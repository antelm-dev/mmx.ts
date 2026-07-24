/**
 * Builds an LDtk project from the authored text grid in levels/stage1.ascii,
 * so the geometry can be opened and edited in LDtk rather than redrawn by
 * hand.
 *
 * Once stage1.ldtk is opened and saved by LDtk itself, LDtk owns the file and
 * this should not be re-run casually — it would clobber those edits. The
 * importer (importLdtk.ts) is the one that runs routinely.
 *
 * Note that this only ever wrote what a character grid can say. It has no
 * Slope entity def and emits no Slope boxes, so re-running it drops every
 * ramp that is not 45 degrees — the .ascii lists those in its legend
 * precisely because it cannot draw them. Rebuilding from here means putting
 * them back by hand.
 */
import { randomUUID } from "node:crypto";
import type { LdtkProject } from "./ldtkTypes.js";

const GRID = 16;

/** Must match the Tile enum in packages/engine/src/game/World.ts. 'S' marks the spawn entity and leaves the tile itself empty. */
const CHAR_TO_VALUE: Record<string, number> = { "#": 1, "/": 2, "\\": 3 };

const COLLISION_UID = 1;
const ENTITIES_UID = 2;
const SPAWN_UID = 3;
const LEVEL_UID = 4;

/** Fields every layer def carries regardless of type. */
const layerDefCommon = {
  gridSize: GRID,
  displayOpacity: 1,
  inactiveOpacity: 1,
  hideInList: false,
  hideFieldsWhenInactive: false,
  canSelectWhenInactive: true,
  renderInWorldView: true,
  pxOffsetX: 0,
  pxOffsetY: 0,
  parallaxFactorX: 0,
  parallaxFactorY: 0,
  parallaxScaling: true,
  requiredTags: [],
  excludedTags: [],
  autoRuleGroups: [],
  autoSourceLayerDefUid: null,
  tilesetDefUid: null,
  tilePivotX: 0,
  tilePivotY: 0,
  uiFilterTags: [],
  useAsyncRender: false,
  guideGridWid: 0,
  guideGridHei: 0,
  doc: null,
  uiColor: null,
  biomeFieldUid: null,
};

/** Fields every layer instance carries regardless of type. */
function layerInstCommon(cols: number, rows: number) {
  return {
    __cWid: cols,
    __cHei: rows,
    __gridSize: GRID,
    __opacity: 1,
    __pxTotalOffsetX: 0,
    __pxTotalOffsetY: 0,
    __tilesetDefUid: null,
    __tilesetRelPath: null,
    levelId: LEVEL_UID,
    pxOffsetX: 0,
    pxOffsetY: 0,
    visible: true,
    optionalRules: [],
    autoLayerTiles: [],
    seed: 1234567,
    overrideTilesetUid: null,
    gridTiles: [],
  };
}

/**
 * Builds the LDtk project object for stage1 from its authored ASCII grid
 * (already split into non-empty rows, padded to the widest by the caller's
 * choice of `cols`).
 */
export function buildStage1Project(asciiRows: string[]): LdtkProject {
  const cols = Math.max(...asciiRows.map((r) => r.length));
  const rows = asciiRows.length;

  const intGridCsv: number[] = [];
  let spawn: [number, number] | null = null;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = asciiRows[y][x];
      if (ch === "S") {
        if (spawn) throw new Error(`levels/stage1.ascii: more than one spawn ('S')`);
        spawn = [x, y];
      }
      intGridCsv.push(CHAR_TO_VALUE[ch] ?? 0);
    }
  }
  if (!spawn) throw new Error(`levels/stage1.ascii: no spawn marker ('S')`);
  const [spawnX, spawnY] = spawn;

  return {
    iid: randomUUID(),
    jsonVersion: "1.5.3",
    appBuildId: 473688,
    nextUid: 100,
    identifierStyle: "Capitalize",
    worldLayout: "Free",
    worldGridWidth: 256,
    worldGridHeight: 256,
    defaultLevelWidth: cols * GRID,
    defaultLevelHeight: rows * GRID,
    defaultGridSize: GRID,
    defaultEntityWidth: GRID,
    defaultEntityHeight: GRID,
    defaultPivotX: 0,
    defaultPivotY: 0,
    bgColor: "#40465B",
    defaultLevelBgColor: "#696A79",
    minifyJson: false,
    externalLevels: false,
    exportTiled: false,
    simplifiedExport: false,
    imageExportMode: "None",
    exportLevelBg: true,
    pngFilePattern: null,
    backupOnSave: false,
    backupLimit: 10,
    backupRelPath: null,
    levelNamePattern: "Level_%idx",
    tutorialDesc: null,
    customCommands: [],
    flags: [],
    dummyWorldIid: randomUUID(),
    worlds: [],
    toc: [],
    defs: {
      layers: [
        {
          ...layerDefCommon,
          __type: "Entities",
          identifier: "Entities",
          type: "Entities",
          uid: ENTITIES_UID,
          intGridValues: [],
          intGridValuesGroups: [],
        },
        {
          ...layerDefCommon,
          __type: "IntGrid",
          identifier: "Collision",
          type: "IntGrid",
          uid: COLLISION_UID,
          intGridValues: [
            { value: 1, identifier: "Solid", color: "#7F8FA4", tile: null, groupUid: 0 },
            { value: 2, identifier: "SlopeUpRight", color: "#E4A672", tile: null, groupUid: 0 },
            { value: 3, identifier: "SlopeUpLeft", color: "#B86F50", tile: null, groupUid: 0 },
          ],
          intGridValuesGroups: [],
        },
      ],
      entities: [
        {
          identifier: "Spawn",
          uid: SPAWN_UID,
          tags: [],
          width: GRID,
          height: GRID,
          resizableX: false,
          resizableY: false,
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          keepAspectRatio: false,
          tileOpacity: 1,
          fillOpacity: 1,
          lineOpacity: 1,
          hollow: false,
          color: "#94D9B3",
          renderMode: "Ellipse",
          showName: true,
          tilesetId: null,
          tileId: null,
          tileRenderMode: "FitInside",
          tileRect: null,
          uiTileRect: null,
          nineSliceBorders: [],
          maxCount: 1,
          limitScope: "PerLevel",
          limitBehavior: "MoveLastOne",
          // Top-left pivot keeps the exported px identical to the tile origin, which
          // is the convention the engine's spawn constant already used.
          pivotX: 0,
          pivotY: 0,
          fieldDefs: [],
          doc: null,
          exportToToc: false,
          allowOutOfBounds: false,
        },
      ],
      tilesets: [],
      enums: [],
      externalEnums: [],
      levelFields: [],
    },
    levels: [
      {
        identifier: "Stage1",
        iid: randomUUID(),
        uid: LEVEL_UID,
        worldX: 0,
        worldY: 0,
        worldDepth: 0,
        pxWid: cols * GRID,
        pxHei: rows * GRID,
        __bgColor: "#696A79",
        bgColor: null,
        useAutoIdentifier: false,
        bgRelPath: null,
        bgPos: null,
        bgPivotX: 0.5,
        bgPivotY: 0.5,
        __smartColor: "#AFAFC0",
        __bgPos: null,
        externalRelPath: null,
        fieldInstances: [],
        __neighbours: [],
        // Topmost layer first, which is how LDtk orders these.
        layerInstances: [
          {
            ...layerInstCommon(cols, rows),
            __identifier: "Entities",
            __type: "Entities",
            iid: randomUUID(),
            layerDefUid: ENTITIES_UID,
            intGridCsv: [],
            entityInstances: [
              {
                __identifier: "Spawn",
                __grid: [spawnX, spawnY],
                __pivot: [0, 0],
                __tags: [],
                __tile: null,
                __smartColor: "#94D9B3",
                __worldX: spawnX * GRID,
                __worldY: spawnY * GRID,
                iid: randomUUID(),
                width: GRID,
                height: GRID,
                defUid: SPAWN_UID,
                px: [spawnX * GRID, spawnY * GRID],
                fieldInstances: [],
              },
            ],
          },
          {
            ...layerInstCommon(cols, rows),
            __identifier: "Collision",
            __type: "IntGrid",
            iid: randomUUID(),
            layerDefUid: COLLISION_UID,
            intGridCsv,
            entityInstances: [],
          },
        ],
      },
    ],
  };
}
