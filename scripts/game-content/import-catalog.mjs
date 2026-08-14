#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const TYPES = new Set(["Attack", "Skill", "Power", "Status", "Curse", "Quest", "None"]);
const RARITIES = new Set(["ancient", "basic", "common", "curse", "event", "quest", "rare", "status", "token", "uncommon"]);
const POOLS = new Set(["ironclad", "silent", "regent", "necrobinder", "defect", "colorless", "status", "curse", "event", "quest", "token", "deprecated"]);
const CONSTRAINTS = new Set(["None", "MultiplayerOnly", "SingleplayerOnly"]);
const CARD_FIELDS = ["source_id", "character_id", "card_color", "type", "rarity", "active", "in_canonical_pool", "show_in_card_library", "multiplayer_constraint", "solo_only"];

function parseArgs(argv) {
  const result = { apply: false, force: false, validateOnly: false, catalog: "/tmp/spire2codex-catalog.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") result.apply = true;
    else if (arg === "--force") result.force = true;
    else if (arg === "--validate-only") result.validateOnly = true;
    else if (arg === "--catalog") result.catalog = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

async function loadLocalEnv() {
  try {
    const body = await readFile(path.resolve(".env.local"), "utf8");
    for (const line of body.split(/\r?\n/)) {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function validate(snapshot) {
  if (snapshot?.schemaVersion !== 2) throw new Error(`Unsupported catalog schema version: ${snapshot?.schemaVersion}`);
  if (snapshot?.complete !== true) throw new Error("Catalog snapshot is not complete");
  if (!snapshot.source?.gameVersion || !snapshot.source?.commit) throw new Error("Catalog source version/commit is missing");
  if (!Array.isArray(snapshot.cards) || snapshot.cards.length === 0) throw new Error("Catalog contains no cards");
  const ids = new Set();
  for (const card of snapshot.cards) {
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(card.id)) throw new Error(`Invalid card ID: ${card.id}`);
    if (ids.has(card.id)) throw new Error(`Duplicate card ID: ${card.id}`);
    ids.add(card.id);
    if (!card.sourceId) throw new Error(`Missing sourceId for ${card.id}`);
    if (typeof card.active !== "boolean") throw new Error(`Missing active flag for ${card.id}`);
    if (!TYPES.has(card.type)) throw new Error(`Unknown type for ${card.id}: ${card.type}`);
    if (!RARITIES.has(card.rarity)) throw new Error(`Unknown rarity for ${card.id}: ${card.rarity}`);
    if (!CONSTRAINTS.has(card.multiplayerConstraint)) throw new Error(`Unknown multiplayer constraint for ${card.id}`);
    if (card.coopOnly !== (card.multiplayerConstraint === "MultiplayerOnly")) throw new Error(`Invalid coopOnly for ${card.id}`);
    if (card.soloOnly !== (card.multiplayerConstraint === "SingleplayerOnly")) throw new Error(`Invalid soloOnly for ${card.id}`);
    if (!Array.isArray(card.poolIds) || card.poolIds.some((pool) => !POOLS.has(pool))) throw new Error(`Invalid pools for ${card.id}`);
    for (const locale of ["en", "ru"]) {
      if (!card.translations?.[locale]?.name) throw new Error(`Missing ${locale} name for ${card.id}`);
      if (typeof card.translations[locale].description !== "string") throw new Error(`Missing ${locale} description for ${card.id}`);
    }
  }
}

async function fetchAll(queryFactory, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

function expectedCard(card) {
  return {
    source_id: card.sourceId,
    character_id: card.characterId,
    card_color: card.cardColor,
    type: card.type,
    rarity: card.rarity,
    active: card.active,
    in_canonical_pool: card.inCanonicalPool,
    show_in_card_library: card.showInCardLibrary,
    multiplayer_constraint: card.multiplayerConstraint,
    solo_only: card.soloOnly,
  };
}

function changedFields(actual, expected) {
  return CARD_FIELDS.filter((field) => actual[field] !== expected[field]);
}

const args = parseArgs(process.argv.slice(2));
await loadLocalEnv();
const catalogPath = path.resolve(args.catalog);
const catalogBody = await readFile(catalogPath, "utf8");
const snapshot = JSON.parse(catalogBody);
validate(snapshot);
const checksum = createHash("sha256").update(catalogBody).digest("hex");

if (args.validateOnly) {
  console.log(JSON.stringify({
    valid: true,
    catalog: catalogPath,
    catalogVersion: `${snapshot.source.gameVersion}+${snapshot.source.commit}`,
    checksum,
    cards: snapshot.cards.length,
    active: snapshot.cards.filter((card) => card.active).length,
    inactive: snapshot.cards.filter((card) => !card.active).length,
    coopOnly: snapshot.cards.filter((card) => card.coopOnly).length,
    soloOnly: snapshot.cards.filter((card) => card.soloOnly).length,
  }, null, 2));
  process.exit(0);
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const readKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = args.apply ? serviceKey : (serviceKey ?? readKey);
if (!url || !key) {
  throw new Error(args.apply
    ? "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required for --apply"
    : "Supabase URL and a publishable or service-role key are required for diff");
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let currentCards;
let currentTranslations;
let currentMemberships;
try {
  [currentCards, currentTranslations, currentMemberships] = await Promise.all([
    fetchAll(() => client.from("cards").select(CARD_FIELDS.length ? `id,${CARD_FIELDS.join(",")}` : "id").order("id")),
    fetchAll(() => client.from("card_translations").select("card_id,locale,name,description").in("locale", ["en", "ru"]).order("card_id")),
    fetchAll(() => client.from("card_pool_memberships").select("card_id,pool_id").order("card_id")),
  ]);
} catch (error) {
  throw new Error(`Cannot read expanded catalog schema. Apply Supabase migrations first. ${error.message}`);
}

const incomingById = new Map(snapshot.cards.map((card) => [card.id, card]));
const currentById = new Map(currentCards.map((card) => [card.id, card]));
const added = snapshot.cards.filter((card) => !currentById.has(card.id)).map((card) => card.id);
const changed = snapshot.cards.flatMap((card) => {
  const current = currentById.get(card.id);
  if (!current) return [];
  const fields = changedFields(current, expectedCard(card));
  return fields.length ? [{ id: card.id, fields }] : [];
});
const deactivated = currentCards.filter((card) => card.active && !incomingById.has(card.id)).map((card) => card.id);

const translationMap = new Map(currentTranslations.map((row) => [`${row.card_id}:${row.locale}`, row]));
let translationChanges = 0;
for (const card of snapshot.cards) for (const locale of ["en", "ru"]) {
  const current = translationMap.get(`${card.id}:${locale}`);
  const expected = card.translations[locale];
  if (!current || current.name !== expected.name || current.description !== expected.description) translationChanges += 1;
}

const membershipSet = new Set(currentMemberships.map((row) => `${row.card_id}:${row.pool_id}`));
const expectedMembershipSet = new Set(snapshot.cards.flatMap((card) => card.poolIds.map((pool) => `${card.id}:${pool}`)));
const membershipChanges = [...expectedMembershipSet].filter((key) => !membershipSet.has(key)).length
  + [...membershipSet].filter((key) => incomingById.has(key.split(":")[0]) && !expectedMembershipSet.has(key)).length;

const summary = {
  mode: args.apply ? "apply" : "dry-run",
  catalog: catalogPath,
  catalogVersion: `${snapshot.source.gameVersion}+${snapshot.source.commit}`,
  checksum,
  incoming: snapshot.cards.length,
  active: snapshot.cards.filter((card) => card.active).length,
  coopOnly: snapshot.cards.filter((card) => card.coopOnly).length,
  soloOnly: snapshot.cards.filter((card) => card.soloOnly).length,
  added: added.length,
  changed: changed.length,
  translationsChanged: translationChanges,
  membershipsChanged: membershipChanges,
  deactivated: deactivated.length,
  samples: {
    added: added.slice(0, 10),
    changed: changed.slice(0, 10),
    deactivated: deactivated.slice(0, 10),
  },
};
console.log(JSON.stringify(summary, null, 2));

if (args.apply) {
  const { data, error } = await client.rpc("import_game_content", {
    snapshot,
    allow_large_deactivation: args.force,
  });
  if (error) throw error;
  console.log(JSON.stringify({ applied: true, result: data }, null, 2));
} else {
  console.log("Dry-run only. Re-run with --apply after reviewing this diff.");
}
