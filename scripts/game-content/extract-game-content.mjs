#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { readPckFile, readPckIndex } from "./pck.mjs";

const LOCALES = {
  deu: "de", eng: "en", esp: "es-419", fra: "fr", ita: "it", jpn: "ja", kor: "ko",
  pol: "pl", ptb: "pt-BR", rus: "ru", tha: "th", tur: "tr", zhs: "zh-CN",
  spa: "es-ES",
};
const SELECTED_LOCALES = new Set(["en", "ru"]);

function usage() {
  console.error("Usage: node scripts/game-content/extract-game-content.mjs [--game-dir <Resources>] --output <catalog.json> [--runtime-export <cards.json>]");
  process.exit(2);
}

function argsOf(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) result[argv[i]?.replace(/^--/, "")] = argv[i + 1];
  return result;
}

function stableId(sourceId) {
  return sourceId.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
}

const POOLS = {
  COLORLESS_CARD_POOL: { id: "colorless", characterId: null },
  CURSE_CARD_POOL: { id: "curse", characterId: null },
  DEFECT_CARD_POOL: { id: "defect", characterId: "defect" },
  DEPRECATED_CARD_POOL: { id: "deprecated", characterId: null },
  EVENT_CARD_POOL: { id: "event", characterId: null },
  IRONCLAD_CARD_POOL: { id: "ironclad", characterId: "ironclad" },
  NECROBINDER_CARD_POOL: { id: "necrobinder", characterId: "necrobinder" },
  QUEST_CARD_POOL: { id: "quest", characterId: null },
  REGENT_CARD_POOL: { id: "regent", characterId: "regent" },
  SILENT_CARD_POOL: { id: "silent", characterId: "silent" },
  STATUS_CARD_POOL: { id: "status", characterId: null },
  TOKEN_CARD_POOL: { id: "token", characterId: null },
};

function normalizeRuntimeCard(card) {
  const unknownPools = card.poolIds.filter((poolId) => !POOLS[poolId]);
  if (unknownPools.length) throw new Error(`Unknown card pools for ${card.sourceId}: ${unknownPools.join(", ")}`);
  const pools = card.poolIds.map((poolId) => POOLS[poolId]);
  const characterIds = [...new Set(pools.map((pool) => pool.characterId).filter(Boolean))];
  if (characterIds.length > 1) throw new Error(`Multiple character owners for ${card.sourceId}: ${characterIds.join(", ")}`);
  if (!["None", "MultiplayerOnly", "SingleplayerOnly"].includes(card.multiplayerConstraint)) {
    throw new Error(`Unknown multiplayer constraint for ${card.sourceId}: ${card.multiplayerConstraint}`);
  }
  return {
    ...card,
    characterId: characterIds[0] ?? null,
    cardColor: POOLS[card.cardColor]?.id ?? stableId(card.cardColor ?? "colorless"),
    poolIds: pools.map((pool) => pool.id).sort(),
    active: !pools.some((pool) => pool.id === "deprecated"),
    coopOnly: card.multiplayerConstraint === "MultiplayerOnly",
    soloOnly: card.multiplayerConstraint === "SingleplayerOnly",
  };
}

const args = argsOf(process.argv.slice(2));
if (!args.output) usage();

async function detectGameDir() {
  const candidates = [];
  if (process.platform === "darwin") {
    candidates.push(path.join(
      os.homedir(),
      "Library/Application Support/Steam/steamapps/common/Slay the Spire 2/SlayTheSpire2.app/Contents/Resources",
    ));
  }
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "release_info.json"));
      await access(path.join(candidate, "Slay the Spire 2.pck"));
      return candidate;
    } catch {
      // Try the next known installation directory.
    }
  }
  throw new Error("Could not find Slay the Spire 2. Pass its Resources directory with --game-dir.");
}

const gameDir = args["game-dir"] ? path.resolve(args["game-dir"]) : await detectGameDir();
const pckPath = path.join(gameDir, "Slay the Spire 2.pck");
const release = JSON.parse(await readFile(path.join(gameDir, "release_info.json"), "utf8"));
const index = await readPckIndex(pckPath);
const translations = new Map();
const unknownLocaleDirs = new Set();

for (const [name, entry] of index.files) {
  const match = /^localization\/([^/]+)\/cards\.json$/.exec(name);
  if (!match) continue;
  const locale = LOCALES[match[1]];
  if (!locale) {
    unknownLocaleDirs.add(match[1]);
    continue;
  }
  if (!SELECTED_LOCALES.has(locale)) continue;
  const table = JSON.parse((await readPckFile(pckPath, entry)).toString("utf8"));
  for (const [key, value] of Object.entries(table)) {
    const fieldMatch = /^(.*)\.(title|description)$/.exec(key);
    if (!fieldMatch) continue;
    const [, sourceId, field] = fieldMatch;
    const byLocale = translations.get(sourceId) ?? new Map();
    const translation = byLocale.get(locale) ?? { name: "", description: "" };
    translation[field === "title" ? "name" : "description"] = value;
    byLocale.set(locale, translation);
    translations.set(sourceId, byLocale);
  }
}

if (unknownLocaleDirs.size) throw new Error(`Unknown locale directories: ${[...unknownLocaleDirs].join(", ")}`);

let runtimeCards = [];
const defaultRuntimeExport = path.join(os.tmpdir(), "spire2codex-runtime-cards.json");
let runtimeExportPath = args["runtime-export"] ? path.resolve(args["runtime-export"]) : defaultRuntimeExport;
try {
  await access(runtimeExportPath);
} catch {
  runtimeExportPath = "";
}
if (runtimeExportPath) {
  const runtime = JSON.parse(await readFile(runtimeExportPath, "utf8"));
  if (runtime.complete !== true) throw new Error("Runtime export is not marked complete");
  runtimeCards = Array.isArray(runtime) ? runtime : runtime.cards;
  if (!Array.isArray(runtimeCards)) throw new Error("Runtime export must be an array or contain cards[]");
}

const runtimeBySourceId = new Map(runtimeCards.map(normalizeRuntimeCard).map((card) => [card.sourceId, card]));
const sourceIds = new Set(runtimeCards.length > 0 ? runtimeBySourceId.keys() : translations.keys());
const normalizedIds = new Map();
const cards = [];

for (const sourceId of [...sourceIds].sort()) {
  const id = stableId(sourceId);
  if (!id) throw new Error(`Cannot normalize source ID ${JSON.stringify(sourceId)}`);
  if (normalizedIds.has(id) && normalizedIds.get(id) !== sourceId) {
    throw new Error(`ID collision: ${sourceId} and ${normalizedIds.get(id)} both become ${id}`);
  }
  normalizedIds.set(id, sourceId);
  const localized = translations.get(sourceId) ?? new Map();
  const english = localized.get("en");
  if (!english?.name) throw new Error(`Missing English title for ${sourceId}`);
  const runtime = runtimeBySourceId.get(sourceId);
  cards.push({
    id,
    sourceId,
    ...(runtime ?? {}),
    metadataComplete: Boolean(runtime),
    translations: sortedObject(localized),
  });
}

const catalog = {
  schemaVersion: 2,
  source: {
    kind: "game-distribution",
    gameVersion: release.version,
    commit: release.commit,
    builtAt: release.date,
    pckFormat: index.format,
    godotVersion: index.engine.join("."),
    runtimeExport: runtimeExportPath || null,
  },
  complete: runtimeCards.length > 0 && cards.every((card) => card.metadataComplete),
  localizationOnlySourceIds: runtimeCards.length > 0
    ? [...translations.keys()].filter((sourceId) => !runtimeBySourceId.has(sourceId)).sort()
    : [],
  cards,
};
const body = `${JSON.stringify(catalog, null, 2)}\n`;
await writeFile(path.resolve(args.output), body);
console.log(JSON.stringify({
  output: path.resolve(args.output),
  cards: cards.length,
  locales: [...new Set(cards.flatMap((card) => Object.keys(card.translations)))].sort(),
  complete: catalog.complete,
  coopOnly: cards.filter((card) => card.coopOnly).length,
  soloOnly: cards.filter((card) => card.soloOnly).length,
  sha256: createHash("sha256").update(body).digest("hex"),
}, null, 2));
