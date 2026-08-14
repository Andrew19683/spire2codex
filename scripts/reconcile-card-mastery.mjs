#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

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

await loadLocalEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required (it may be set in .env.local)");
if (!serviceKey) throw new Error("Pass SUPABASE_SERVICE_ROLE_KEY only to this process");

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.rpc("reconcile_card_mastery_catalog");
if (error) throw error;
console.log(`Card Mastery catalog reconciliation complete. Updated users: ${data}`);
