#!/usr/bin/env node

import { access, cp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  throw new Error("Automatic exporter installation is currently implemented for macOS only.");
}

const dotnet = spawnSync("dotnet", ["--version"], { encoding: "utf8" });
if (dotnet.error?.code === "ENOENT") {
  console.error(".NET 9 SDK is required. Install it with: brew install dotnet@9");
  process.exit(1);
}
if (dotnet.status !== 0 || !dotnet.stdout.trim().startsWith("9.")) {
  console.error(`.NET 9 SDK is required; found: ${dotnet.stdout.trim() || dotnet.stderr.trim()}`);
  process.exit(1);
}

const gameDir = path.join(os.homedir(), "Library/Application Support/Steam/steamapps/common/Slay the Spire 2");
const resources = path.join(gameDir, "SlayTheSpire2.app/Contents/Resources");
await access(path.join(resources, "release_info.json"));

const projectDir = path.resolve("tools/Spire2CodexExporter");
const outputDir = path.resolve(".generated/Spire2CodexExporter");
const build = spawnSync("dotnet", [
  "build", path.join(projectDir, "Spire2CodexExporter.csproj"),
  "-c", "Release", "-o", outputDir, `-p:STS2GameDir=${gameDir}`,
], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const modsDir = path.join(gameDir, "SlayTheSpire2.app/Contents/MacOS/mods/Spire2CodexExporter");
await mkdir(modsDir, { recursive: true });
await cp(path.join(outputDir, "Spire2CodexExporter.dll"), path.join(modsDir, "Spire2CodexExporter.dll"));
await cp(path.join(projectDir, "Spire2CodexExporter.json"), path.join(modsDir, "Spire2CodexExporter.json"));

console.log(`Exporter installed in ${modsDir}`);
console.log("Launch the game, enable Spire2Codex Catalog Exporter in Settings → Mod Settings, then restart the game once.");
console.log(`The exporter will create ${path.join(os.tmpdir(), "spire2codex-runtime-cards.json")}`);

