import type { LevelData, LevelEntity } from "@mmx/engine";
import { Tile } from "@mmx/engine";
import { applySlopes, type SlopeRect } from "@mmx/content-schema/slopes";
import {
  TERRAIN_TILE_BY_NAME,
  TERRAIN_TILE_NAME,
  TerrainTile,
  effectiveValue,
  getDefinition,
  instanceSize,
  requireDefinition,
  SCHEMA_VERSION,
  type GameObjectDefinition,
  type LevelDocument,
  type LevelObjectInstance,
} from "@mmx/content-schema";

const TILE_NAME: Record<number, string> = {
  [TerrainTile.Empty]: TERRAIN_TILE_NAME[TerrainTile.Empty],
  [TerrainTile.Solid]: TERRAIN_TILE_NAME[TerrainTile.Solid],
  [TerrainTile.SlopeUpRight]: TERRAIN_TILE_NAME[TerrainTile.SlopeUpRight],
  [TerrainTile.SlopeUpLeft]: TERRAIN_TILE_NAME[TerrainTile.SlopeUpLeft],
};

const TILE_ENUM: Record<string, TerrainTile> = {
  Empty: Tile.Empty,
  Solid: Tile.Solid,
  SlopeUpRight: Tile.SlopeUpRight,
  SlopeUpLeft: Tile.SlopeUpLeft,
};

function assertTerrainMapsToEngine(): void {
  if (
    TerrainTile.Empty !== Tile.Empty ||
    TerrainTile.Solid !== Tile.Solid ||
    TerrainTile.SlopeUpRight !== Tile.SlopeUpRight ||
    TerrainTile.SlopeUpLeft !== Tile.SlopeUpLeft
  ) {
    throw new Error("TerrainTile values drifted from engine Tile");
  }
}

assertTerrainMapsToEngine();

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
      return entity.id;
  }
}

function isResizable(def: GameObjectDefinition | undefined): boolean {
  return def?.editor.resizable === true;
}

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
    decorations: [],
  };
  if (data.slopes) doc.slopes = { ...data.slopes };
  return doc;
}

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

function bakeSlopeObjects(
  doc: LevelDocument,
  tiles: TerrainTile[],
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

  const names = tiles.map((t) => TILE_NAME[t] ?? TERRAIN_TILE_NAME[TerrainTile.Empty]);
  const baked = applySlopes(names, doc.cols, rects, "Slope");
  for (let i = 0; i < names.length; i++) {
    tiles[i] = TILE_ENUM[names[i]] ?? TERRAIN_TILE_BY_NAME[names[i]] ?? tiles[i];
  }
  for (const [index, profile] of Object.entries(baked)) slopes[Number(index)] = profile;
}

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
