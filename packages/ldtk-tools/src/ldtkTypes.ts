/**
 * The subset of the LDtk project JSON schema this package reads and writes.
 * LDtk's own schema is much larger (editor state, auto-layer rules, tilesets)
 * and moves between versions; only the fields tools/export-ldtk.mjs's
 * successor constructs and tools/import-ldtk.mjs's successor consumes are
 * typed here.
 */

export interface LdtkLayerDefCommon {
  gridSize: number;
  displayOpacity: number;
  inactiveOpacity: number;
  hideInList: boolean;
  hideFieldsWhenInactive: boolean;
  canSelectWhenInactive: boolean;
  renderInWorldView: boolean;
  pxOffsetX: number;
  pxOffsetY: number;
  parallaxFactorX: number;
  parallaxFactorY: number;
  parallaxScaling: boolean;
  requiredTags: string[];
  excludedTags: string[];
  autoRuleGroups: unknown[];
  autoSourceLayerDefUid: number | null;
  tilesetDefUid: number | null;
  tilePivotX: number;
  tilePivotY: number;
  uiFilterTags: string[];
  useAsyncRender: boolean;
  guideGridWid: number;
  guideGridHei: number;
  doc: string | null;
  uiColor: string | null;
  biomeFieldUid: number | null;
}

export interface LdtkIntGridValue {
  value: number;
  identifier: string;
  color: string;
  tile: unknown | null;
  groupUid: number;
}

export interface LdtkEntitiesLayerDef extends LdtkLayerDefCommon {
  __type: "Entities";
  identifier: string;
  type: "Entities";
  uid: number;
  intGridValues: LdtkIntGridValue[];
  intGridValuesGroups: unknown[];
}

export interface LdtkIntGridLayerDef extends LdtkLayerDefCommon {
  __type: "IntGrid";
  identifier: string;
  type: "IntGrid";
  uid: number;
  intGridValues: LdtkIntGridValue[];
  intGridValuesGroups: unknown[];
}

export type LdtkLayerDef = LdtkEntitiesLayerDef | LdtkIntGridLayerDef;

export interface LdtkFieldDef {
  identifier: string;
  uid: number;
  type: string;
  doc: string | null;
  [key: string]: unknown;
}

export interface LdtkEntityDef {
  identifier: string;
  uid: number;
  tags: string[];
  width: number;
  height: number;
  resizableX: boolean;
  resizableY: boolean;
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  keepAspectRatio: boolean;
  tileOpacity: number;
  fillOpacity: number;
  lineOpacity: number;
  hollow: boolean;
  color: string;
  renderMode: string;
  showName: boolean;
  tilesetId: number | null;
  tileId: number | null;
  tileRenderMode: string;
  tileRect: unknown | null;
  uiTileRect: unknown | null;
  nineSliceBorders: unknown[];
  maxCount: number;
  limitScope: string;
  limitBehavior: string;
  pivotX: number;
  pivotY: number;
  fieldDefs: LdtkFieldDef[];
  doc: string | null;
  exportToToc: boolean;
  allowOutOfBounds: boolean;
  [key: string]: unknown;
}

export interface LdtkFieldInstance {
  __identifier: string;
  __type?: string;
  __value: unknown;
  __tile?: unknown | null;
  defUid?: number;
  realEditorValues?: unknown[];
}

export interface LdtkEntityInstance {
  __identifier: string;
  __grid: [number, number];
  __pivot: [number, number];
  __tags: string[];
  __tile: unknown | null;
  __smartColor: string;
  __worldX: number;
  __worldY: number;
  iid: string;
  width: number;
  height: number;
  defUid: number;
  px: [number, number];
  fieldInstances: LdtkFieldInstance[];
}

export interface LdtkLayerInstanceCommon {
  __cWid: number;
  __cHei: number;
  __gridSize: number;
  __opacity: number;
  __pxTotalOffsetX: number;
  __pxTotalOffsetY: number;
  __tilesetDefUid: number | null;
  __tilesetRelPath: string | null;
  levelId: number;
  pxOffsetX: number;
  pxOffsetY: number;
  visible: boolean;
  optionalRules: unknown[];
  autoLayerTiles: unknown[];
  seed: number;
  overrideTilesetUid: number | null;
  gridTiles: unknown[];
}

export interface LdtkEntitiesLayerInstance extends LdtkLayerInstanceCommon {
  __identifier: string;
  __type: "Entities";
  iid: string;
  layerDefUid: number;
  intGridCsv: number[];
  entityInstances: LdtkEntityInstance[];
}

export interface LdtkIntGridLayerInstance extends LdtkLayerInstanceCommon {
  __identifier: string;
  __type: "IntGrid";
  iid: string;
  layerDefUid: number;
  intGridCsv: number[];
  entityInstances: LdtkEntityInstance[];
}

export type LdtkLayerInstance = LdtkEntitiesLayerInstance | LdtkIntGridLayerInstance;

export interface LdtkLevel {
  identifier: string;
  iid: string;
  uid: number;
  worldX: number;
  worldY: number;
  worldDepth: number;
  pxWid: number;
  pxHei: number;
  __bgColor: string;
  bgColor: string | null;
  useAutoIdentifier: boolean;
  bgRelPath: string | null;
  bgPos: unknown | null;
  bgPivotX: number;
  bgPivotY: number;
  __smartColor: string;
  __bgPos: unknown | null;
  externalRelPath: string | null;
  fieldInstances: unknown[];
  __neighbours: unknown[];
  layerInstances: LdtkLayerInstance[];
}

export interface LdtkDefs {
  layers: LdtkLayerDef[];
  entities: LdtkEntityDef[];
  tilesets: unknown[];
  enums: unknown[];
  externalEnums: unknown[];
  levelFields: unknown[];
}

export interface LdtkProject {
  iid: string;
  jsonVersion: string;
  appBuildId: number;
  nextUid: number;
  identifierStyle: string;
  worldLayout: string;
  worldGridWidth: number;
  worldGridHeight: number;
  defaultLevelWidth: number;
  defaultLevelHeight: number;
  defaultGridSize: number;
  defaultEntityWidth: number;
  defaultEntityHeight: number;
  defaultPivotX: number;
  defaultPivotY: number;
  bgColor: string;
  defaultLevelBgColor: string;
  minifyJson: boolean;
  externalLevels: boolean;
  exportTiled: boolean;
  simplifiedExport: boolean;
  imageExportMode: string;
  exportLevelBg: boolean;
  pngFilePattern: string | null;
  backupOnSave: boolean;
  backupLimit: number;
  backupRelPath: string | null;
  levelNamePattern: string;
  tutorialDesc: string | null;
  customCommands: unknown[];
  flags: unknown[];
  dummyWorldIid: string;
  worlds: unknown[];
  toc: unknown[];
  defs: LdtkDefs;
  levels: LdtkLevel[];
}
