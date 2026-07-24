import { level as stage1 } from "@mmx/engine/game/levels/stage1.js";
import { level as stage2 } from "@mmx/engine/game/levels/stage2.js";
import { levelDataToDocument, type LevelDocument } from "@mmx/content-schema";

/**
 * The generated stages, presented to the editor as {@link LevelDocument}s.
 *
 * These are the same `LevelData` modules the game loads (never edited by hand —
 * see @mmx/ldtk-tools), imported through the schema adapter so "Open Stage 2" in
 * the editor and "play Stage 2" in the game start from identical content.
 */
export interface BuiltinLevel {
  key: string;
  name: string;
  document: () => LevelDocument;
}

export const BUILTIN_LEVELS: readonly BuiltinLevel[] = [
  { key: "stage1", name: "Stage 1", document: () => levelDataToDocument(stage1) },
  { key: "stage2", name: "Stage 2 (Mechanics Demo)", document: () => levelDataToDocument(stage2) },
];
