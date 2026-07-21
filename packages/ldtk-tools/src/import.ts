#!/usr/bin/env node
/**
 * CLI entry point: converts every LDtk project file in levels/ into a
 * TypeScript module under packages/engine/src/game/levels/.
 *
 *   pnpm level:import
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { convert, emit } from "./importLdtk.js";
import type { LdtkProject } from "./ldtkTypes.js";

const SRC_DIR = new URL("../../../levels/", import.meta.url);
const OUT_DIR = new URL("../../engine/src/game/levels/", import.meta.url);

mkdirSync(OUT_DIR, { recursive: true });

const sources = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ldtk"));
if (sources.length === 0) {
  console.error("no .ldtk files in levels/");
  process.exit(1);
}

for (const source of sources) {
  const ldtk = JSON.parse(readFileSync(new URL(source, SRC_DIR), "utf8")) as LdtkProject;
  const level = convert(ldtk, source);
  const name = basename(source, ".ldtk");
  writeFileSync(new URL(`${name}.ts`, OUT_DIR), emit(level, source));
  const shaped = Object.keys(level.slopes).length;
  console.log(
    `${source} -> packages/engine/src/game/levels/${name}.ts (${level.cols}x${level.rows}, ` +
      `${level.entities.length} entities, ${shaped} shaped slope tiles)`,
  );
}
