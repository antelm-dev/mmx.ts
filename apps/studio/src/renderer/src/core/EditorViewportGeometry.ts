import {
  catalogGameData,
  instanceSize,
  definitionFor,
  effectiveValue,
  entityFields,
  getDefinition,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import { environmentBehaviorRegistry, type DebugPrimitive } from "@mmx/engine/behaviors";

// ---------- Types ----------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const HANDLE_HIT_PX = 7;

// ---------- Box helpers ----------

export function boxOf(inst: LevelObjectInstance): Box {
  const { width, height } = instanceSize(inst);
  return { x: inst.x, y: inst.y, w: width, h: height };
}

export function normalizeBox(x0: number, y0: number, x1: number, y1: number): Box {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------- Handle geometry ----------

export function handlePos(b: Box, h: Handle): { x: number; y: number } {
  const midX = b.x + b.w / 2;
  const midY = b.y + b.h / 2;
  switch (h) {
    case "nw":
      return { x: b.x, y: b.y };
    case "n":
      return { x: midX, y: b.y };
    case "ne":
      return { x: b.x + b.w, y: b.y };
    case "e":
      return { x: b.x + b.w, y: midY };
    case "se":
      return { x: b.x + b.w, y: b.y + b.h };
    case "s":
      return { x: midX, y: b.y + b.h };
    case "sw":
      return { x: b.x, y: b.y + b.h };
    default:
      return { x: b.x, y: midY };
  }
}

/** Whether screen-space client coords fall on the handle square drawn at world point `p`. */
export function pointHitTest(
  p: { x: number; y: number },
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  zoom: number,
  viewportX: number,
  viewportY: number,
): boolean {
  const dx = clientX - canvasRect.left - (p.x - viewportX) * zoom;
  const dy = clientY - canvasRect.top - (p.y - viewportY) * zoom;
  return Math.abs(dx) <= HANDLE_HIT_PX && Math.abs(dy) <= HANDLE_HIT_PX;
}

/**
 * Given screen-space client coords and the world-to-screen projection, return
 * which resize handle (if any) is hit on the given box.
 */
export function handleHitTest(
  b: Box,
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  zoom: number,
  viewportX: number,
  viewportY: number,
): Handle | null {
  for (const h of HANDLES) {
    if (pointHitTest(handlePos(b, h), clientX, clientY, canvasRect, zoom, viewportX, viewportY))
      return h;
  }
  return null;
}

// ---------- Environment gizmos ----------

/**
 * The engine's design-time geometry for an environment instance drawn at `box`
 * (a moving platform's travel path and end rect), or none: not an environment,
 * no provider, or an unknown definition (editor reads never throw).
 */
export function environmentGeometry(
  inst: LevelObjectInstance,
  box: Box = boxOf(inst),
): readonly DebugPrimitive[] {
  const def = getDefinition(inst.definitionId);
  if (!def) return [];
  // The catalog's game data, so an environment the project's data adds draws as a built-in one.
  const data = catalogGameData();
  const source = data.prefabs[def.baseId ?? def.id]?.source;
  if (source?.kind !== "environment") return [];
  const environment = data.environments[source.ref];
  if (!environment || !environmentBehaviorRegistry.has(environment.behavior)) return [];
  const provider = environmentBehaviorRegistry.get(environment.behavior).debugGeometry;
  return (
    provider?.(
      entityFields(inst),
      { x: box.x, y: box.y, facing: 1, width: box.w, height: box.h },
      environment.defaults,
    ) ?? []
  );
}

/** The grip that drags Travel: the centre of the geometry's travel `end` rect. */
export function travelGrip(geometry: readonly DebugPrimitive[]): { x: number; y: number } | null {
  const end = geometry.find((p) => p.kind === "rect" && p.label === "end");
  return end?.kind === "rect" ? { x: end.x + end.width / 2, y: end.y + end.height / 2 } : null;
}

/** Whether a grip may set the instance's Travel: a project object can fix it (not exposed), and an override of it would be dropped. */
export function travelEditable(inst: LevelObjectInstance): boolean {
  return definitionFor(inst.definitionId).properties.some((p) => p.key === "Travel");
}

/** The single selected object with a travel grip and an editable Travel, and that grip. */
export function travelTarget(
  objects: readonly LevelObjectInstance[],
  selectedIds: readonly string[],
): { inst: LevelObjectInstance; grip: { x: number; y: number } } | null {
  if (selectedIds.length !== 1) return null;
  const inst = objects.find((o) => o.id === selectedIds[0]);
  const grip = inst && travelEditable(inst) ? travelGrip(environmentGeometry(inst)) : null;
  return inst && grip ? { inst, grip } : null;
}

/** Whether an instance travels vertically (its Axis), so a grip drag reads the pointer's y. */
export function travelsVertically(inst: LevelObjectInstance): boolean {
  return effectiveValue(inst, "Axis") === "vertical";
}

/** Travel after dragging the grip by (dx, dy) world px from `start`: along the axis, snapped, never negative. */
export function dragTravel(
  start: number,
  dx: number,
  dy: number,
  vertical: boolean,
  snap: (value: number) => number,
): number {
  return Math.max(0, snap(start + (vertical ? dy : dx)));
}

// ---------- Object resizability ----------

export function singleResizableObject(
  objects: readonly LevelObjectInstance[],
  selectedIds: readonly string[],
): LevelObjectInstance | null {
  if (selectedIds.length !== 1) return null;
  const inst = objects.find((o) => o.id === selectedIds[0]);
  if (!inst) return null;
  return definitionFor(inst.definitionId).editor.resizable ? inst : null;
}

// ---------- Tile grid helpers ----------

/**
 * Compute the row-major tile index for a world position, or null when out of bounds.
 */
export function tileIndexAt(
  wx: number,
  wy: number,
  cols: number,
  rows: number,
  gridSize: number,
): number | null {
  const col = Math.floor(wx / gridSize);
  const row = Math.floor(wy / gridSize);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return row * cols + col;
}

/**
 * Return the tile indices whose cells intersect the given box.
 * Only non-empty cells are included (callers must supply `isSolid`).
 */
export function tilesIntersecting(
  box: Box,
  cols: number,
  rows: number,
  gridSize: number,
  isSolid: (index: number) => boolean,
): number[] {
  const col0 = Math.max(0, Math.floor(box.x / gridSize));
  const row0 = Math.max(0, Math.floor(box.y / gridSize));
  const col1 = Math.min(cols - 1, Math.ceil((box.x + box.w) / gridSize) - 1);
  const row1 = Math.min(rows - 1, Math.ceil((box.y + box.h) / gridSize) - 1);
  if (col1 < col0 || row1 < row0) return [];
  const out: number[] = [];
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const index = row * cols + col;
      if (!isSolid(index)) continue;
      const cell: Box = { x: col * gridSize, y: row * gridSize, w: gridSize, h: gridSize };
      if (boxesIntersect(cell, box)) out.push(index);
    }
  }
  return out;
}

/**
 * Clamp a tile-move delta so no selected tile leaves the grid.
 */
export function clampTileDelta(
  indices: readonly number[],
  cols: number,
  rows: number,
  dCol: number,
  dRow: number,
): { dCol: number; dRow: number } {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const index of indices) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
  }
  const clampedCol = Math.max(-minCol, Math.min(cols - 1 - maxCol, dCol));
  const clampedRow = Math.max(-minRow, Math.min(rows - 1 - maxRow, dRow));
  return {
    dCol: clampedCol === 0 ? 0 : clampedCol,
    dRow: clampedRow === 0 ? 0 : clampedRow,
  };
}

// ---------- Misc ----------

export function hexToNum(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

/** Row-major indices of the cell rectangle between two corner cells, inclusive. */
export function cellRect(cols: number, a: number, b: number): number[] {
  const [c0, c1] = [a % cols, b % cols].sort((x, y) => x - y) as [number, number];
  const [r0, r1] = [Math.floor(a / cols), Math.floor(b / cols)].sort((x, y) => x - y) as [
    number,
    number,
  ];
  const out: number[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * cols + c);
  return out;
}

/** Indices 4-connected to `start` that hold the same value in `cells` (the paint-bucket region). */
export function floodFill(cells: readonly number[], cols: number, start: number): number[] {
  const target = cells[start];
  if (target === undefined) return [];
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop()!;
    const col = i % cols;
    for (const n of [i - cols, i + cols, col > 0 ? i - 1 : -1, col < cols - 1 ? i + 1 : -1]) {
      if (n < 0 || n >= cells.length || seen.has(n) || cells[n] !== target) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return [...seen];
}

/** Tile columns and rows a tileset image holds, with the renderer's `columns` cap. */
export function tileGrid(
  tileset: { tileSize: number; columns?: number },
  image: { w: number; h: number },
): { columns: number; rows: number } {
  const fit = Math.floor(image.w / tileset.tileSize);
  return {
    columns: Math.min(tileset.columns ?? fit, fit),
    rows: Math.floor(image.h / tileset.tileSize),
  };
}
