/**
 * Bootstrap: writes levels/stage1.ldtk from the authored text grid in
 * levels/stage1.ascii, so the geometry can be opened and edited in LDtk rather
 * than redrawn by hand.
 *
 * Once stage1.ldtk is opened and saved by LDtk itself, LDtk owns the file and
 * this script should not be re-run casually — it would clobber those edits,
 * hence the --force guard. The importer, tools/import-ldtk.mjs, is the one that
 * runs routinely.
 *
 * Note that this only ever wrote what a character grid can say. It has no Slope
 * entity def and emits no Slope boxes, so re-running it drops every ramp that
 * is not 45 degrees — the .ascii lists those in its legend precisely because it
 * cannot draw them. Rebuilding from here means putting them back by hand.
 *
 *   node tools/export-ldtk.mjs [--force]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

const GRID = 16;

const SOURCE = new URL("../levels/stage1.ascii", import.meta.url);

/**
 * The grid is everything after the first blank line, so the file can carry a
 * legend above it. Rows are padded to the widest, matching World.fromRows.
 */
function readAscii(url) {
  const text = readFileSync(url, "utf8").replaceAll("\r\n", "\n");
  const blank = text.indexOf("\n\n");
  const body = blank === -1 ? text : text.slice(blank + 2);
  return body.split("\n").filter((line) => line.length > 0);
}

const ASCII = readAscii(SOURCE);

// Must match the Tile enum in src/engine/World.ts. 'S' marks the spawn entity
// and leaves the tile itself empty.
const CHAR_TO_VALUE = { "#": 1, "/": 2, "\\": 3 };

const cols = Math.max(...ASCII.map((r) => r.length));
const rows = ASCII.length;

const intGridCsv = [];
let spawn = null;
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const ch = ASCII[y][x];
    if (ch === "S") {
      if (spawn) throw new Error(`levels/stage1.ascii: more than one spawn ('S')`);
      spawn = [x, y];
    }
    intGridCsv.push(CHAR_TO_VALUE[ch] ?? 0);
  }
}
if (!spawn) throw new Error(`levels/stage1.ascii: no spawn marker ('S')`);
const [spawnX, spawnY] = spawn;

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
const layerInstCommon = {
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

const project = {
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
          ...layerInstCommon,
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
          ...layerInstCommon,
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

const outDir = new URL("../levels/", import.meta.url);
const outFile = new URL("stage1.ldtk", outDir);
mkdirSync(outDir, { recursive: true });

if (existsSync(outFile) && !process.argv.includes("--force")) {
  console.error("levels/stage1.ldtk already exists; refusing to overwrite (use --force).");
  process.exit(1);
}

writeFileSync(outFile, JSON.stringify(project, null, 2) + "\n");
console.log(`wrote levels/stage1.ldtk (${cols}x${rows})`);
