#!/usr/bin/env node
/**
 * CLI entry point: writes levels/stage1.ldtk from levels/stage1.ascii.
 *
 *   pnpm --filter @mmx/ldtk-tools export -- [--force]
 *
 * See buildStage1Project in exportLdtk.ts for why this should not be re-run
 * once LDtk owns the file.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { buildStage1Project } from "./exportLdtk.js";

const SOURCE = new URL("../../../levels/stage1.ascii", import.meta.url);

/**
 * The grid is everything after the first blank line, so the file can carry a
 * legend above it. Rows are padded to the widest, matching World.fromRows.
 */
function readAscii(url: URL): string[] {
  const text = readFileSync(url, "utf8").replaceAll("\r\n", "\n");
  const blank = text.indexOf("\n\n");
  const body = blank === -1 ? text : text.slice(blank + 2);
  return body.split("\n").filter((line) => line.length > 0);
}

const project = buildStage1Project(readAscii(SOURCE));

const outDir = new URL("../../../levels/", import.meta.url);
const outFile = new URL("stage1.ldtk", outDir);
mkdirSync(outDir, { recursive: true });

if (existsSync(outFile) && !process.argv.includes("--force")) {
  console.error("levels/stage1.ldtk already exists; refusing to overwrite (use --force).");
  process.exit(1);
}

writeFileSync(outFile, JSON.stringify(project, null, 2) + "\n");
const rows = project.levels[0].pxHei / project.defaultGridSize;
const cols = project.levels[0].pxWid / project.defaultGridSize;
console.log(`wrote levels/stage1.ldtk (${cols}x${rows})`);
