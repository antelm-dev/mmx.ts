import { readFileSync } from "node:fs";
import type { LevelData } from "../../src/game/LevelData.js";

function readLevel(name: string): LevelData {
  return JSON.parse(
    readFileSync(new URL(`./${name}.level.json`, import.meta.url), "utf8"),
  ) as LevelData;
}

export const stage1 = readLevel("stage1");
export const stage2 = readLevel("stage2");
export const levelCatalog: readonly LevelData[] = [stage1, stage2];
