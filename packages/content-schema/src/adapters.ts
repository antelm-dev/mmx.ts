import type { LevelData, LevelEntity } from "@mmx/engine/game/LevelData.js";
import { Tile } from "@mmx/engine/game/World.js";
import { applySlopes, type SlopeRect } from "@mmx/ldtk-tools/slopeBake";
import {
  effectiveValue,
  getDefinition,
  instanceSize,
  requireDefinition,
} from "./definitions.js";
import type { GameObjectDefinition, LevelDocument, LevelObjectInstance } from "./types.js";
import { SCHEMA_VERSION } from "./types.js";

/** The engine's numeric Tile enum ↔ the string names the slope bake works in. */
const TILE_NAME: Record<number, string> = {
  [Tile.Empty]: "Empty",
  [Tile.Solid]: "Solid",
  [Tile.SlopeUpRight]: "SlopeUpRight",
  [Tile.SlopeUpLeft]: "SlopeUpLeft",
};
const TILE_ENUM: Record<string, number> = {
  Empty: Tile.Empty,
  Solid: Tile.Solid,
  SlopeUpRight: Tile.SlopeUpRight,
  SlopeUpLeft: Tile.SlopeUpLeft,
};

/**
 * The only place the authoring model ({@link LevelDocument}) and the engine model
 * ({@link LevelData}) meet.
 *
 * Both directions are deliberately lossless for the objects the catalog knows:
 * import preserves each entity's stable `iid` as the instance id and its original
 * order, and export rebuilds the same entity from the definition's base fields
 * layered with the instance's overrides — so a round-trip is identity, which is
 * what keeps the LDtk import/export pipeline undisturbed.
 */

/** Resolve an engine entity id (+ its Kind field) to a catalog definition id. */
function definitionIdFor(entity: LevelEntity): string {
  const kind = typeof entity.fields.Kind === "string" ? entity.fields.Kind : undefined;
  switch (entity.id) {
    case "Spawn":
      return "spawn";
    case "Enemy":
      return kind === "bat" ? "enemy.bat" : "enemy.metool";
    case "LifeCapsule":
      return kind === "large" ? "pickup.life.large" : "pickup.life.small";
    case "WeaponCapsule":
      return kind === "large" ? "pickup.weapon.large" : "pickup.weapon.small";
    case "MovingPlatform":
      return "platform.moving";
    case "Conveyor":
      return "conveyor";
    case "Hazard":
      return "hazard";
    case "Slope":
      return "slope";
    case "CameraZone":
      return "camera-zone";
    default:
      // Unknown to the catalog. Kept verbatim as the definition id so validation
      // flags it rather than the import silently dropping the object.
      return entity.id;
  }
}

function isResizable(def: GameObjectDefinition | undefined): boolean {
  return def?.editor.resizable === true;
}

/** Build the editor document for a generated level. */
export function levelDataToDocument(data: LevelData): LevelDocument {
  const objects: LevelObjectInstance[] = data.entities.map((entity) => {
    const definitionId = definitionIdFor(entity);
    const def = getDefinition(definitionId);
    const overrides: Record<string, unknown> = {};
    for (const prop of def?.properties ?? []) {
      const value = entity.fields[prop.key];
      if (value !== undefined) overrides[prop.key] = value;
    }
    const inst: LevelObjectInstance = { id: entity.iid, definitionId, x: entity.x, y: entity.y };
    if (isResizable(def)) {
      inst.width = entity.w;
      inst.height = entity.h;
    }
    if (Object.keys(overrides).length > 0) inst.overrides = overrides;
    return inst;
  });

  const doc: LevelDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: data.identifier,
    name: data.identifier,
    gridSize: data.gridSize,
    cols: data.cols,
    rows: data.rows,
    tiles: data.tiles.slice(),
    objects,
  };
  if (data.slopes) doc.slopes = { ...data.slopes };
  return doc;
}

/** Convert one instance back to its engine entity. */
export function instanceToEntity(inst: LevelObjectInstance): LevelEntity {
  const def = requireDefinition(inst.definitionId);
  const { width, height } = instanceSize(inst);
  const fields: Record<string, unknown> = { ...def.fields };
  for (const prop of def.properties) {
    const value = inst.overrides?.[prop.key];
    if (value !== undefined) fields[prop.key] = value;
  }
  return { id: def.engineId, iid: inst.id, x: inst.x, y: inst.y, w: width, h: height, fields };
}

/**
 * Expand every Slope object into the terrain the engine actually collides
 * against, mutating `tiles`/`slopes` in place.
 *
 * A slope is authored as a resizable box plus a `Dir`, exactly as in LDtk, so we
 * replay the same bake @mmx/ldtk-tools runs at import time (one slope tile per
 * column over solid fill to the box's base). Without this a slope placed in the
 * editor is inert metadata in Play — it renders and collides as nothing, since
 * the runtime builds its `World` from `tiles`/`slopes`, never from Slope
 * entities. Invalid geometry throws with the bake's own descriptive message,
 * which surfaces as the "could not start Play" toast.
 */
function bakeSlopeObjects(
  doc: LevelDocument,
  tiles: number[],
  slopes: Record<number, [number, number]>,
): void {
  const rects: SlopeRect[] = [];
  for (const inst of doc.objects) {
    if (requireDefinition(inst.definitionId).category !== "slope") continue;
    const { width, height } = instanceSize(inst);
    const dir = effectiveValue(inst, "Dir");
    rects.push({
      x: inst.x,
      y: inst.y,
      w: width,
      h: height,
      dir: typeof dir === "string" ? dir : "UpRight",
    });
  }
  if (rects.length === 0) return;

  // Bake through @mmx/ldtk-tools' own routine (name-keyed) so replaying it over
  // already-baked terrain is exactly idempotent — same tiles, and only the
  // non-default profiles land in `slopes`, keeping the LDtk round-trip identity.
  const names = tiles.map((t) => TILE_NAME[t] ?? "Empty");
  const baked = applySlopes(names, doc.cols, rects, "Slope");
  for (let i = 0; i < names.length; i++) tiles[i] = TILE_ENUM[names[i]] ?? tiles[i];
  for (const [index, profile] of Object.entries(baked)) slopes[Number(index)] = profile;
}

/** Build the engine level for Play mode (and export) from an editor document. */
export function documentToLevelData(doc: LevelDocument): LevelData {
  const tiles = doc.tiles.slice();
  const slopes: Record<number, [number, number]> = doc.slopes ? { ...doc.slopes } : {};
  bakeSlopeObjects(doc, tiles, slopes);
  const data: LevelData = {
    identifier: doc.id,
    gridSize: doc.gridSize,
    cols: doc.cols,
    rows: doc.rows,
    tiles,
    entities: doc.objects.map(instanceToEntity),
  };
  if (Object.keys(slopes).length > 0) data.slopes = slopes;
  return data;
}
