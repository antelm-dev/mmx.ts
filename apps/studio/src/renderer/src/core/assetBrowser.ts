import { definitionsFromGameData } from "@mmx/content-schema";
import type { GameData, GameDataOverlay } from "@mmx/engine/data";
import type { ProjectDocument } from "@mmx/project-schema";
import { isProjectEnemy } from "./enemyEditor.js";

/** What a row is, which decides the document it opens (fonts and sounds open none). */
export type AssetEntryKind =
  | "tileset"
  | "sprite"
  | "animation"
  | "image"
  | "sound"
  | "font"
  | "enemy"
  | "object";

/** One browser row: a manifest asset, an enemy (by its prefab id) or a project object. */
export type AssetEntry = { kind: AssetEntryKind; id: string; label: string; builtIn: boolean };
export type AssetGroup = { kind: AssetEntryKind; label: string; entries: AssetEntry[] };

const GROUPS: [AssetEntryKind, string][] = [
  ["tileset", "Tilesets"],
  ["sprite", "Sprites"],
  ["animation", "Animations"],
  ["image", "Images"],
  ["sound", "Sounds"],
  ["font", "Fonts"],
  ["enemy", "Enemies"],
  ["object", "Objects"],
];

/**
 * The Assets panel's groups, in browser order: the project's manifest assets and
 * objects (none without a project) and every enemy of the merged game data, flagged
 * built-in unless the project's `overlay` adds it (as the Enemy editor tells them apart).
 * Entries are sorted by label and filtered on label or id by `query`; groups left empty
 * are dropped.
 */
export function assetGroups(
  project: Pick<ProjectDocument, "assets" | "objects"> | undefined,
  data: GameData,
  query: string,
  overlay?: GameDataOverlay,
): AssetGroup[] {
  const entries: AssetEntry[] = [
    ...(project?.assets ?? []).map((a) => ({
      kind: a.kind,
      id: a.id,
      label: a.id,
      builtIn: false,
    })),
    ...definitionsFromGameData(data)
      .filter((def) => def.category === "enemy")
      .map((def) => ({
        kind: "enemy" as const,
        id: def.id,
        label: def.name,
        builtIn: !isProjectEnemy(overlay, def.id),
      })),
    ...(project?.objects ?? []).map((o) => ({
      kind: "object" as const,
      id: o.id,
      label: o.name,
      builtIn: false,
    })),
  ];
  const q = query.trim().toLowerCase();
  const shown = entries
    .filter((e) => !q || e.label.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
    .sort((a, b) => a.label.localeCompare(b.label));
  return GROUPS.flatMap(([kind, label]) => {
    const inGroup = shown.filter((e) => e.kind === kind);
    return inGroup.length > 0 ? [{ kind, label, entries: inGroup }] : [];
  });
}
