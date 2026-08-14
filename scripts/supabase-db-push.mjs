#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

async function readSecret(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Set SUPABASE_DB_PASSWORD when running without an interactive terminal");
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();

  return await new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          return reject(new Error("Cancelled"));
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

const poolerPath = path.resolve("supabase/.temp/pooler-url");
try {
  await access(poolerPath);
} catch {
  throw new Error("Supabase project is not linked. Run `npx supabase link --project-ref <ref>` first.");
}

const poolerUrl = (await readFile(poolerPath, "utf8")).trim();
const parsed = new URL(poolerUrl);
if (parsed.protocol !== "postgresql:" || parsed.port !== "5432" || !parsed.hostname.endsWith(".pooler.supabase.com")) {
  throw new Error(`Expected a Supabase session pooler URL in ${poolerPath}`);
}

const password = process.env.SUPABASE_DB_PASSWORD ?? await readSecret("Supabase database password: ");
if (!password) throw new Error("Database password cannot be empty");

const executable = path.resolve("node_modules/.bin/supabase");
const result = spawnSync(executable, [
  "db", "push", "--db-url", poolerUrl, ...process.argv.slice(2),
], {
  stdio: "inherit",
  env: { ...process.env, PGPASSWORD: password },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

