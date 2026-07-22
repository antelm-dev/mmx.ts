import type { LevelData, LevelEntity } from "@mmx/engine/game/LevelData.js";
import { getDefinition, instanceSize, requireDefinition } from "./definitions.js";
import type { GameObjectDefinition, LevelDocument, LevelObjectInstance } from "./types.js";
import { SCHEMA_VERSION } from "./types.js";

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

/** Build the engine level for Play mode (and export) from an editor document. */
export function documentToLevelData(doc: LevelDocument): LevelData {
  const data: LevelData = {
    identifier: doc.id,
    gridSize: doc.gridSize,
    cols: doc.cols,
    rows: doc.rows,
    tiles: doc.tiles.slice(),
    entities: doc.objects.map(instanceToEntity),
  };
  if (doc.slopes) data.slopes = { ...doc.slopes };
  return data;
}
