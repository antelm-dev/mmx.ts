/**
 * Builds levels/stage2.ldtk, the large mechanics showcase used by the game.
 * The output remains a normal editable LDtk project; this script keeps its broad
 * collision layout reproducible instead of checking in thousands of hand-written
 * IntGrid entries.
 */
import { readFileSync, writeFileSync } from "node:fs";

const source = JSON.parse(readFileSync(new URL("../levels/stage1.ldtk", import.meta.url), "utf8"));
const project = structuredClone(source);
const GRID = 16;
const COLS = 160;
const ROWS = 48;
let iidCounter = 1;
const iid = () => `20000000-0000-4000-8000-${String(iidCounter++).padStart(12, "0")}`;

function fieldDef(template, identifier, uid, type, value, doc) {
  return {
    ...structuredClone(template),
    identifier,
    uid,
    type: `F_${type}`,
    doc,
    defaultOverride: { id: `V_${type}`, params: [value] },
  };
}

const slopeDef = project.defs.entities.find((e) => e.identifier === "Slope");
const dirField = slopeDef.fieldDefs[0];
const entityDef = (identifier, uid, color, doc, fields = []) => ({
  ...structuredClone(slopeDef),
  identifier,
  uid,
  color,
  doc,
  width: 32,
  height: 8,
  resizableX: true,
  resizableY: true,
  fieldDefs: fields,
});

const hazardDef = entityDef(
  "Hazard",
  130,
  "#FF4057",
  "Lethal spikes, lava, or another instant-death volume.",
);
const conveyorDef = entityDef("Conveyor", 131, "#55DDE0", "A floor strip that carries X.", [
  fieldDef(dirField, "Speed", 132, "Int", 60, "Signed horizontal speed in pixels/second."),
]);
const platformDef = entityDef(
  "MovingPlatform",
  133,
  "#FFD166",
  "A one-way platform that patrols horizontally from its authored origin.",
  [
    fieldDef(dirField, "Travel", 134, "Int", 96, "Horizontal travel distance in pixels."),
    fieldDef(dirField, "Speed", 135, "Int", 48, "Travel speed in pixels/second."),
  ],
);
project.defs.entities = project.defs.entities
  .filter((e) => !["Hazard", "Conveyor", "MovingPlatform"].includes(e.identifier))
  .concat(hazardDef, conveyorDef, platformDef);
project.nextUid = 136;

const cells = new Array(COLS * ROWS).fill(0);
const fill = (x, y, w, h, value = 1) => {
  for (let cy = y; cy < y + h; cy++) {
    for (let cx = x; cx < x + w; cx++) {
      if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) cells[cy * COLS + cx] = value;
    }
  }
};

// Main route and three platforming pits.
fill(0, 34, COLS, 2);
for (const [x, w] of [
  [26, 10],
  [68, 12],
  [116, 12],
])
  fill(x, 34, w, 2, 0);
// Upper route: staggered jump/air-dash platforms and a wall-jump shaft.
fill(5, 28, 12, 1);
fill(19, 24, 9, 1);
fill(39, 28, 14, 1);
fill(55, 19, 1, 15);
fill(61, 19, 1, 15);
fill(61, 19, 18, 1);
fill(84, 15, 16, 1);
fill(104, 22, 10, 1);
fill(130, 27, 12, 1);
fill(145, 21, 15, 1);
// Head-bump fixtures and wall-slide columns.
fill(9, 23, 5, 1);
fill(43, 23, 5, 1);
fill(100, 10, 1, 12);
fill(151, 12, 1, 9);
// Cavern floor and hanging obstacles. The right chute is the safe entrance.
fill(0, 46, COLS, 2);
fill(0, 36, 2, 10);
fill(158, 36, 2, 10);
fill(48, 36, 2, 6);
fill(94, 36, 2, 7);
fill(144, 34, 2, 8);
fill(150, 34, 2, 12);

const entityLayerDef = project.defs.layers.find((l) => l.__type === "Entities");
const collisionLayerDef = project.defs.layers.find((l) => l.__type === "IntGrid");
const defs = Object.fromEntries(project.defs.entities.map((e) => [e.identifier, e]));
const fields = (values) =>
  Object.entries(values).map(([name, value]) => {
    const def = Object.values(defs)
      .flatMap((e) => e.fieldDefs)
      .find(
        (f) =>
          f.identifier === name &&
          f.defaultOverride?.id ===
            `V_${typeof value === "boolean" ? "Bool" : typeof value === "number" ? "Int" : "String"}`,
      );
    const type = typeof value === "boolean" ? "Bool" : typeof value === "number" ? "Int" : "String";
    return {
      __identifier: name,
      __type: type,
      __value: value,
      __tile: null,
      defUid: def?.uid ?? 0,
      realEditorValues: [],
    };
  });
const entities = [];
function add(id, x, y, w = defs[id].width, h = defs[id].height, values = {}) {
  entities.push({
    __identifier: id,
    __grid: [Math.floor(x / GRID), Math.floor(y / GRID)],
    __pivot: [0, 0],
    __tags: [],
    __tile: null,
    __smartColor: defs[id].color,
    __worldX: x,
    __worldY: y,
    iid: iid(),
    width: w,
    height: h,
    defUid: defs[id].uid,
    px: [x, y],
    fieldInstances: fields(values),
  });
}

add("Spawn", 3 * GRID, 33 * GRID);
add("Enemy", 14 * GRID, 33 * GRID, 16, 16, { Kind: "metool", FacesRight: false });
add("Enemy", 45 * GRID, 26 * GRID, 16, 16, { Kind: "bat", FacesRight: true });
add("Enemy", 89 * GRID, 14 * GRID, 16, 16, { Kind: "metool", FacesRight: false });
add("Enemy", 108 * GRID, 20 * GRID, 16, 16, { Kind: "bat", FacesRight: false });
add("Enemy", 136 * GRID, 26 * GRID, 16, 16, { Kind: "metool", FacesRight: true });

// Conveyors run in opposite directions to make their influence obvious.
add("Conveyor", 8 * GRID, 33.5 * GRID, 16 * GRID, 8, { Speed: 60 });
add("Conveyor", 82 * GRID, 33.5 * GRID, 22 * GRID, 8, { Speed: -75 });
// Moving bridges patrol above each lethal pit.
add("MovingPlatform", 25 * GRID, 31 * GRID, 48, 8, { Travel: 8 * GRID, Speed: 48 });
add("MovingPlatform", 67 * GRID, 30 * GRID, 48, 8, { Travel: 10 * GRID, Speed: 56 });
add("MovingPlatform", 115 * GRID, 31 * GRID, 48, 8, { Travel: 10 * GRID, Speed: 64 });
// Pit volumes extend below the visible spike tips, preventing tunnelling past them.
add("Hazard", 26 * GRID, 34 * GRID, 10 * GRID, 12 * GRID);
add("Hazard", 68 * GRID, 34 * GRID, 12 * GRID, 12 * GRID);
add("Hazard", 116 * GRID, 34 * GRID, 12 * GRID, 12 * GRID);
add("Hazard", 52 * GRID, 33.5 * GRID, 3 * GRID, 8);

// Cavern ramps: 45-degree, 1-in-2, and 1-in-4 examples.
add("Slope", 7 * GRID, 42 * GRID, 4 * GRID, 4 * GRID, { Dir: "UpRight" });
add("Slope", 18 * GRID, 43 * GRID, 6 * GRID, 3 * GRID, { Dir: "UpLeft" });
add("Slope", 58 * GRID, 44 * GRID, 8 * GRID, 2 * GRID, { Dir: "UpRight" });
add("Slope", 105 * GRID, 42 * GRID, 8 * GRID, 4 * GRID, { Dir: "UpLeft" });
add("Slope", 132 * GRID, 44 * GRID, 8 * GRID, 2 * GRID, { Dir: "UpRight" });

// Overlapping zones lock the camera to each vertical tier while allowing x scroll.
add("CameraZone", 0, 0, COLS * GRID, 19 * GRID, { BindX: false, BindY: true });
add("CameraZone", 0, 19 * GRID, COLS * GRID, 17 * GRID, { BindX: false, BindY: true });
add("CameraZone", 0, 36 * GRID, COLS * GRID, 12 * GRID, { BindX: false, BindY: true });

const levelUid = 200;
const layerCommon = {
  __cWid: COLS,
  __cHei: ROWS,
  __gridSize: GRID,
  __opacity: 1,
  __pxTotalOffsetX: 0,
  __pxTotalOffsetY: 0,
  __tilesetDefUid: null,
  __tilesetRelPath: null,
  levelId: levelUid,
  pxOffsetX: 0,
  pxOffsetY: 0,
  visible: true,
  optionalRules: [],
  autoLayerTiles: [],
  seed: 424242,
  overrideTilesetUid: null,
  gridTiles: [],
};
project.iid = iid();
project.defaultLevelWidth = COLS * GRID;
project.defaultLevelHeight = ROWS * GRID;
project.levels = [
  {
    ...structuredClone(project.levels[0]),
    identifier: "MechanicsDemo",
    iid: iid(),
    uid: levelUid,
    pxWid: COLS * GRID,
    pxHei: ROWS * GRID,
    layerInstances: [
      {
        ...layerCommon,
        __identifier: "Entities",
        __type: "Entities",
        iid: iid(),
        layerDefUid: entityLayerDef.uid,
        intGridCsv: [],
        entityInstances: entities,
      },
      {
        ...layerCommon,
        __identifier: "Collision",
        __type: "IntGrid",
        iid: iid(),
        layerDefUid: collisionLayerDef.uid,
        intGridCsv: cells,
        entityInstances: [],
      },
    ],
  },
];

writeFileSync(
  new URL("../levels/stage2.ldtk", import.meta.url),
  JSON.stringify(project, null, 2) + "\n",
);
console.log(`wrote levels/stage2.ldtk (${COLS}x${ROWS}, ${entities.length} entities)`);
