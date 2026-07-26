import { Application, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { World } from "@mmx/engine/game/World.js";
import {
  TerrainTile,
  effectiveValue,
  instanceSize,
  moveObjects,
  requireDefinition,
  setTransform,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import { loadSheets, regionTexture, SHEET_URLS } from "@mmx/renderer-pixi";
import { previewForDefinition } from "./spritePreview.js";
import {
  cloneSelection,
  emptySelection,
  selectedObjectIds,
  selectionsEqual,
  type EditorSelection,
  type EditorStore,
} from "./EditorStore.js";
import { paintTiles, placeAt, moveSelectedTiles } from "./actions.js";

const COLOR_BG = 0x05070d;
const COLOR_TILE_FILL = 0x0b1120;
const COLOR_TILE_EDGE = 0x33507a;
const COLOR_GRID = 0x161d2b;
const COLOR_SELECT = 0x4c8dff;
const COLOR_HOVER = 0xffffff;
const COLOR_ERASE = 0xff5a5a;

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_HIT_PX = 7;

export interface EmptyCellContextMenu {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
  col: number;
  row: number;
  /** Whether the cell already holds a solid tile — picks Add- vs Remove-tile. */
  tileSolid: boolean;
}

export type EmptyCellContextMenuHandler = (payload: EmptyCellContextMenu) => void;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function hexToNum(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

function boxOf(inst: LevelObjectInstance): Box {
  const { width, height } = instanceSize(inst);
  return { x: inst.x, y: inst.y, w: width, h: height };
}

function normalizeBox(x0: number, y0: number, x1: number, y1: number): Box {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * The Pixi editing surface: terrain and every placed object, plus all pointer
 * interaction (pan/zoom, selection, drag-move, resize handles, placement).
 *
 * Deliberately separate from @mmx/renderer-pixi's game `Renderer` — this draws
 * authoring affordances (boxes, labels, handles, grid) plus static sprite
 * previews for catalogued actors, and reads the {@link EditorStore} rather than
 * an engine `Scene`. Play mode uses the real renderer; this never does.
 */
export class EditorViewport {
  private readonly world = new Container();
  private readonly terrainLayer = new Graphics();
  private readonly gridLayer = new Graphics();
  private readonly objectLayer = new Container();
  private readonly overlay = new Graphics();
  private terrainWorld: World | null = null;
  private terrainTilesRef: number[] | null = null;

  private readonly labelStyle: TextStyle;

  // Interaction state.
  private panning = false;
  private spaceDown = false;
  private lastPointer = { x: 0, y: 0 };
  private dragStart:
    | {
        kind: "objects";
        world: { x: number; y: number };
        ids: string[];
        orig: Map<string, Box>;
      }
    | {
        kind: "tiles";
        world: { x: number; y: number };
        indices: number[];
      }
    | null = null;
  private dragging = false;
  private live:
    | { type: "move"; dx: number; dy: number }
    | { type: "moveTiles"; dCol: number; dRow: number }
    | { type: "resize"; id: string; box: Box }
    | null = null;
  private resizeState: { id: string; handle: Handle; orig: Box } | null = null;
  // Live terrain-paint gesture: `erase` fixes solid-vs-empty for the whole
  // stroke, `changed` maps row-major tile index → target value for a preview
  // that commits as one command on pointer-up.
  private tileStroke: { erase: boolean; changed: Map<number, number> } | null = null;
  private pendingToggle: string | null = null;
  private pendingTileToggle: number | null = null;
  private marquee: {
    start: { x: number; y: number };
    current: { x: number; y: number };
    additive: boolean;
    base: EditorSelection;
  } | null = null;
  private marqueeActive = false;
  private pointerWorld = { x: 0, y: 0 };
  private onEmptyContextMenu: EmptyCellContextMenuHandler | null = null;

  private constructor(
    private readonly app: Application,
    private readonly canvas: HTMLCanvasElement,
    private readonly store: EditorStore,
  ) {
    this.labelStyle = new TextStyle({
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 10,
      fill: 0xdfe7f5,
    });
    this.world.addChild(this.terrainLayer, this.gridLayer, this.objectLayer, this.overlay);
    this.app.stage.addChild(this.world);
    this.bindPointer();
  }

  static async create(host: HTMLElement, store: EditorStore): Promise<EditorViewport> {
    const canvas = document.createElement("canvas");
    canvas.id = "viewport-canvas";
    host.append(canvas);
    const app = new Application();
    await app.init({
      canvas,
      background: COLOR_BG,
      antialias: false,
      autoStart: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      width: host.clientWidth || 800,
      height: host.clientHeight || 600,
    });
    const viewport = new EditorViewport(app, canvas, store);
    await loadSheets(SHEET_URLS);
    const resize = (): void => viewport.onResize(host);
    new ResizeObserver(resize).observe(host);
    resize();
    return viewport;
  }

  private onResize(host: HTMLElement): void {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w > 0 && h > 0) this.app.renderer.resize(w, h);
    this.redraw();
  }

  /** Frame the whole document in the viewport. */
  fitToDocument(): void {
    const doc = this.store.get().document;
    const worldW = doc.cols * doc.gridSize;
    const worldH = doc.rows * doc.gridSize;
    const vw = this.app.renderer.width / this.app.renderer.resolution;
    const vh = this.app.renderer.height / this.app.renderer.resolution;
    const zoom = Math.max(0.25, Math.min(vw / worldW, vh / worldH) * 0.95);
    const vp = {
      x: (worldW - vw / zoom) / 2,
      y: (worldH - vh / zoom) / 2,
    };
    this.store.setView(zoom, vp);
  }

  /** Zoom about the viewport centre (toolbar +/- buttons). */
  zoomByCentered(factor: number): void {
    const { zoom, viewportPosition } = this.store.get();
    const { w, h } = this.viewSize();
    const centerX = viewportPosition.x + w / (2 * zoom);
    const centerY = viewportPosition.y + h / (2 * zoom);
    const nz = Math.max(0.2, Math.min(16, zoom * factor));
    this.store.setView(nz, { x: centerX - w / (2 * nz), y: centerY - h / (2 * nz) });
  }

  /** Centre the view on a world point (used when focusing a problem/object). */
  centerOn(wx: number, wy: number): void {
    const { zoom } = this.store.get();
    const { w, h } = this.viewSize();
    this.store.setView(zoom, { x: wx - w / (2 * zoom), y: wy - h / (2 * zoom) });
  }

  // ---------- Coordinate transforms ----------

  private viewSize(): { w: number; h: number } {
    const r = this.app.renderer;
    return { w: r.width / r.resolution, h: r.height / r.resolution };
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const { zoom, viewportPosition } = this.store.get();
    return {
      x: viewportPosition.x + (clientX - rect.left) / zoom,
      y: viewportPosition.y + (clientY - rect.top) / zoom,
    };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const { zoom, viewportPosition } = this.store.get();
    return { x: (wx - viewportPosition.x) * zoom, y: (wy - viewportPosition.y) * zoom };
  }

  // ---------- Rendering ----------

  redraw(): void {
    const state = this.store.get();
    const { document: doc, zoom, viewportPosition } = state;

    this.world.position.set(-viewportPosition.x * zoom, -viewportPosition.y * zoom);
    this.world.scale.set(zoom);

    if (this.terrainTilesRef !== doc.tiles) this.rebuildTerrain();
    this.drawGrid();
    this.drawObjects();
    this.drawOverlay();
    this.updateCursor();
    this.app.render();
  }

  private rebuildTerrain(): void {
    const doc = this.store.get().document;
    const world = new World(doc.tiles.slice(), doc.cols, doc.rows, doc.slopes);
    this.terrainWorld = world;
    this.terrainTilesRef = doc.tiles;
    const g = this.terrainLayer;
    g.clear();
    const TS = doc.gridSize;
    for (let ty = 0; ty < doc.rows; ty++) {
      for (let tx = 0; tx < doc.cols; tx++) {
        const kind = world.tileAt(tx, ty);
        if (kind === TerrainTile.Empty) continue;
        const x = tx * TS;
        const y = ty * TS;
        if (kind === TerrainTile.Solid) {
          g.rect(x, y, TS, TS);
        } else {
          const { l, r } = world.slopeProfile(tx, ty, kind);
          g.poly([x, y + TS, x + TS, y + TS, x + TS, y + TS - r, x, y + TS - l]);
        }
      }
    }
    g.fill(COLOR_TILE_FILL);
    g.stroke({ width: 1, color: COLOR_TILE_EDGE, alignment: 0 });
  }

  private drawGrid(): void {
    const state = this.store.get();
    const g = this.gridLayer;
    g.clear();
    if (!state.gridVisible) return;
    const doc = state.document;
    const TS = doc.gridSize;
    const worldW = doc.cols * TS;
    const worldH = doc.rows * TS;
    const width = 1 / state.zoom;
    for (let x = 0; x <= doc.cols; x++) g.moveTo(x * TS, 0).lineTo(x * TS, worldH);
    for (let y = 0; y <= doc.rows; y++) g.moveTo(0, y * TS).lineTo(worldW, y * TS);
    g.stroke({ width, color: COLOR_GRID });
    g.rect(0, 0, worldW, worldH).stroke({ width: width * 1.5, color: 0x2a3345 });
  }

  private objectDrawBox(inst: LevelObjectInstance): Box {
    const base = boxOf(inst);
    const ids = selectedObjectIds(this.store.get().selection);
    if (this.live?.type === "move" && ids.includes(inst.id)) {
      return { ...base, x: base.x + this.live.dx, y: base.y + this.live.dy };
    }
    if (this.live?.type === "resize" && this.live.id === inst.id) return this.live.box;
    return base;
  }

  private drawObjects(): void {
    const layer = this.objectLayer;
    layer.removeChildren().forEach((c) => c.destroy());
    const state = this.store.get();
    const zoom = state.zoom;

    for (const inst of state.document.objects) {
      const def = requireDefinition(inst.definitionId);
      const color = hexToNum(def.editor.color);
      const box = this.objectDrawBox(inst);
      const preview = previewForDefinition(inst.definitionId);
      const g = new Graphics();
      const isCamera = def.category === "camera";
      const isSlope = def.category === "slope";
      const hasSprite = !!preview && !!regionTexture(preview.sheet, preview.region);

      if (isSlope) {
        // A slope reads as its ramp, not a box: fill the solid (lower) triangle
        // and let its direction show the rise. UpRight rises left→right.
        const upRight = effectiveValue(inst, "Dir") !== "UpLeft";
        const apexX = upRight ? box.x + box.w : box.x;
        const ramp = [box.x, box.y + box.h, box.x + box.w, box.y + box.h, apexX, box.y];
        g.poly(ramp).fill({ color, alpha: 0.26 });
        g.poly(ramp).stroke({ width: 1 / zoom, color, alpha: 0.95 });
        // Faint bounds so the resize handles still have something to sit on.
        g.rect(box.x, box.y, box.w, box.h).stroke({ width: 1 / zoom, color, alpha: 0.28 });
      } else {
        g.rect(box.x, box.y, box.w, box.h).fill({
          color,
          alpha: isCamera ? 0.05 : hasSprite ? 0.08 : 0.16,
        });
        g.rect(box.x, box.y, box.w, box.h).stroke({ width: 1 / zoom, color, alpha: 0.9 });
      }

      if (def.category === "enemy") {
        const facesRight = effectiveValue(inst, "FacesRight") === true;
        const cy = box.y + box.h / 2;
        const dir = facesRight ? 1 : -1;
        const tipX = facesRight ? box.x + box.w : box.x;
        g.moveTo(tipX, cy)
          .lineTo(tipX - dir * 5, cy - 3)
          .lineTo(tipX - dir * 5, cy + 3)
          .fill(color);
      }
      layer.addChild(g);

      if (preview) {
        const texture = regionTexture(preview.sheet, preview.region);
        if (texture) {
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);
          sprite.position.set(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2));
          if (def.category === "enemy") {
            const facesRight = effectiveValue(inst, "FacesRight") === true;
            sprite.scale.x = facesRight ? -1 : 1;
          }
          layer.addChild(sprite);
        }
      }

      const label = new Text({
        text: `${def.icon ?? ""} ${def.name}`.trim(),
        style: this.labelStyle,
      });
      label.position.set(box.x + 2 / zoom, box.y - 12 / zoom);
      label.scale.set(1 / zoom);
      layer.addChild(label);
    }
  }

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    const state = this.store.get();
    const zoom = state.zoom;
    const grid = state.document.gridSize;

    if (state.activeTool === "tile") {
      this.drawTileToolOverlay(g, grid, zoom);
      return;
    }

    const byId = new Map(state.document.objects.map((o) => [o.id, o]));
    const selectedIds = selectedObjectIds(state.selection);

    if (state.hover?.kind === "object" && !selectedIds.includes(state.hover.id)) {
      const inst = byId.get(state.hover.id);
      if (inst) {
        const b = this.objectDrawBox(inst);
        g.rect(b.x, b.y, b.w, b.h).stroke({ width: 1 / zoom, color: COLOR_HOVER, alpha: 0.5 });
      }
    }

    if (state.hover?.kind === "tile") {
      const selectedTiles =
        state.selection.kind === "tiles" ? new Set(state.selection.indices) : null;
      if (!selectedTiles?.has(state.hover.index)) {
        const col = state.hover.index % state.document.cols;
        const row = Math.floor(state.hover.index / state.document.cols);
        g.rect(col * grid, row * grid, grid, grid).stroke({
          width: 1 / zoom,
          color: COLOR_HOVER,
          alpha: 0.5,
        });
      }
    }

    for (const id of selectedIds) {
      const inst = byId.get(id);
      if (!inst) continue;
      const b = this.objectDrawBox(inst);
      g.rect(b.x - 1 / zoom, b.y - 1 / zoom, b.w + 2 / zoom, b.h + 2 / zoom).stroke({
        width: 2 / zoom,
        color: COLOR_SELECT,
      });
    }

    if (state.selection.kind === "tiles") {
      const dCol = this.live?.type === "moveTiles" ? this.live.dCol : 0;
      const dRow = this.live?.type === "moveTiles" ? this.live.dRow : 0;
      for (const index of state.selection.indices) {
        const col = (index % state.document.cols) + dCol;
        const row = Math.floor(index / state.document.cols) + dRow;
        if (dCol !== 0 || dRow !== 0) {
          const ox = (index % state.document.cols) * grid;
          const oy = Math.floor(index / state.document.cols) * grid;
          g.rect(ox, oy, grid, grid).fill({ color: COLOR_BG, alpha: 0.45 });
          g.rect(col * grid, row * grid, grid, grid).fill({
            color: COLOR_TILE_FILL,
            alpha: 0.75,
          });
        }
        g.rect(col * grid - 1 / zoom, row * grid - 1 / zoom, grid + 2 / zoom, grid + 2 / zoom).stroke(
          {
            width: 2 / zoom,
            color: COLOR_SELECT,
          },
        );
      }
    }

    const handleTarget = this.singleResizable();
    if (handleTarget) {
      const b = this.objectDrawBox(handleTarget);
      const s = HANDLE_HIT_PX / zoom;
      for (const h of HANDLES) {
        const p = this.handlePos(b, h);
        g.rect(p.x - s / 2, p.y - s / 2, s, s)
          .fill(COLOR_SELECT)
          .stroke({ width: 1 / zoom, color: 0xffffff });
      }
    }

    if (this.marquee && this.marqueeActive) {
      const box = normalizeBox(
        this.marquee.start.x,
        this.marquee.start.y,
        this.marquee.current.x,
        this.marquee.current.y,
      );
      g.rect(box.x, box.y, box.w, box.h).fill({ color: COLOR_SELECT, alpha: 0.12 });
      g.rect(box.x, box.y, box.w, box.h).stroke({
        width: 1 / zoom,
        color: COLOR_SELECT,
        alpha: 0.95,
      });
    }
  }

  /** Paint-tool feedback: previewed stroke cells, or an idle cursor cell. */
  private drawTileToolOverlay(g: Graphics, gridSize: number, zoom: number): void {
    const stroke = this.tileStroke;
    const doc = this.store.get().document;
    const inBounds = (col: number, row: number): boolean =>
      col >= 0 && row >= 0 && col < doc.cols && row < doc.rows;

    if (stroke && stroke.changed.size > 0) {
      for (const [index, value] of stroke.changed) {
        const col = index % doc.cols;
        const row = Math.floor(index / doc.cols);
        const x = col * gridSize;
        const y = row * gridSize;
        if (value === TerrainTile.Empty) {
          g.rect(x, y, gridSize, gridSize).stroke({ width: 1.5 / zoom, color: COLOR_ERASE });
          g.moveTo(x, y).lineTo(x + gridSize, y + gridSize);
          g.moveTo(x + gridSize, y).lineTo(x, y + gridSize);
          g.stroke({ width: 1 / zoom, color: COLOR_ERASE, alpha: 0.7 });
        } else {
          g.rect(x, y, gridSize, gridSize).fill({ color: COLOR_TILE_FILL, alpha: 0.7 });
          g.rect(x, y, gridSize, gridSize).stroke({ width: 1.5 / zoom, color: COLOR_SELECT });
        }
      }
      return;
    }

    // Idle: outline the cell the next click would affect.
    const col = Math.floor(this.pointerWorld.x / gridSize);
    const row = Math.floor(this.pointerWorld.y / gridSize);
    if (!inBounds(col, row)) return;
    g.rect(col * gridSize, row * gridSize, gridSize, gridSize).stroke({
      width: 1.5 / zoom,
      color: COLOR_SELECT,
      alpha: 0.85,
    });
  }

  private singleResizable(): LevelObjectInstance | null {
    const ids = selectedObjectIds(this.store.get().selection);
    if (ids.length !== 1) return null;
    const inst = this.store.get().document.objects.find((o) => o.id === ids[0]);
    if (!inst) return null;
    return requireDefinition(inst.definitionId).editor.resizable ? inst : null;
  }

  private handlePos(b: Box, h: Handle): { x: number; y: number } {
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

  // ---------- Hit testing ----------

  private topObjectAt(wx: number, wy: number): LevelObjectInstance | null {
    const objects = this.store.get().document.objects;
    for (let i = objects.length - 1; i >= 0; i--) {
      const b = boxOf(objects[i]);
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return objects[i];
    }
    return null;
  }

  private tileIndexAt(wx: number, wy: number): number | null {
    const doc = this.store.get().document;
    const col = Math.floor(wx / doc.gridSize);
    const row = Math.floor(wy / doc.gridSize);
    if (col < 0 || row < 0 || col >= doc.cols || row >= doc.rows) return null;
    return row * doc.cols + col;
  }

  private isTerrainCell(index: number): boolean {
    return (this.store.get().document.tiles[index] ?? TerrainTile.Empty) !== TerrainTile.Empty;
  }

  private objectsIntersecting(box: Box): string[] {
    return this.store
      .get()
      .document.objects.filter((o) => boxesIntersect(boxOf(o), box))
      .map((o) => o.id);
  }

  private tilesIntersecting(box: Box): number[] {
    const doc = this.store.get().document;
    const grid = doc.gridSize;
    const col0 = Math.max(0, Math.floor(box.x / grid));
    const row0 = Math.max(0, Math.floor(box.y / grid));
    const col1 = Math.min(doc.cols - 1, Math.ceil((box.x + box.w) / grid) - 1);
    const row1 = Math.min(doc.rows - 1, Math.ceil((box.y + box.h) / grid) - 1);
    if (col1 < col0 || row1 < row0) return [];
    const out: number[] = [];
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const index = row * doc.cols + col;
        if (!this.isTerrainCell(index)) continue;
        const cell: Box = { x: col * grid, y: row * grid, w: grid, h: grid };
        if (boxesIntersect(cell, box)) out.push(index);
      }
    }
    return out;
  }

  private clampTileDelta(
    indices: readonly number[],
    dCol: number,
    dRow: number,
  ): { dCol: number; dRow: number } {
    const { cols, rows } = this.store.get().document;
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
    return {
      dCol: Math.max(-minCol, Math.min(cols - 1 - maxCol, dCol)),
      dRow: Math.max(-minRow, Math.min(rows - 1 - maxRow, dRow)),
    };
  }

  private applyMarqueeSelection(): void {
    const m = this.marquee;
    if (!m) return;
    const box = normalizeBox(m.start.x, m.start.y, m.current.x, m.current.y);
    const objectIds = this.objectsIntersecting(box);
    let next: EditorSelection;
    if (objectIds.length > 0) {
      next =
        m.additive && m.base.kind === "objects"
          ? { kind: "objects", ids: [...new Set([...m.base.ids, ...objectIds])] }
          : { kind: "objects", ids: objectIds };
    } else {
      const indices = this.tilesIntersecting(box);
      next =
        m.additive && m.base.kind === "tiles"
          ? { kind: "tiles", indices: [...new Set([...m.base.indices, ...indices])] }
          : { kind: "tiles", indices };
    }
    if (selectionsEqual(this.store.get().selection, next)) return;
    this.store.setSelection(next);
  }

  private handleAt(clientX: number, clientY: number): Handle | null {
    const target = this.singleResizable();
    if (!target) return null;
    const b = boxOf(target);
    for (const h of HANDLES) {
      const wp = this.handlePos(b, h);
      const sp = this.worldToScreen(wp.x, wp.y);
      const rect = this.canvas.getBoundingClientRect();
      const dx = clientX - rect.left - sp.x;
      const dy = clientY - rect.top - sp.y;
      if (Math.abs(dx) <= HANDLE_HIT_PX && Math.abs(dy) <= HANDLE_HIT_PX) return h;
    }
    return null;
  }

  // ---------- Pointer handling ----------

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    c.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    c.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    c.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") this.spaceDown = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceDown = false;
    });
  }

  setSpace(down: boolean): void {
    this.spaceDown = down;
  }

  setEmptyContextMenuHandler(handler: EmptyCellContextMenuHandler | null): void {
    this.onEmptyContextMenu = handler;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const state = this.store.get();
    const before = this.screenToWorld(e.clientX, e.clientY);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const zoom = Math.max(0.2, Math.min(16, state.zoom * factor));
    // Keep the world point under the cursor fixed.
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const vp = { x: before.x - sx / zoom, y: before.y - sy / zoom };
    this.store.setView(zoom, vp);
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (this.store.get().mode === "play") return;
    // In the tile tool a right-drag erases; pointer-down owns it, so no menu.
    if (this.store.get().activeTool === "tile") return;
    const payload = this.emptyContextAt(e.clientX, e.clientY);
    if (payload) this.onEmptyContextMenu?.(payload);
  }

  /** Resolve a free-cell context payload at screen coords, or null if occupied / out of edit mode. */
  emptyContextAt(clientX: number, clientY: number): EmptyCellContextMenu | null {
    if (this.store.get().mode === "play") return null;
    const world = this.screenToWorld(clientX, clientY);
    if (this.topObjectAt(world.x, world.y)) return null;
    const doc = this.store.get().document;
    const grid = doc.gridSize;
    const col = Math.floor(world.x / grid);
    const row = Math.floor(world.y / grid);
    const inBounds = col >= 0 && row >= 0 && col < doc.cols && row < doc.rows;
    return {
      clientX,
      clientY,
      worldX: world.x,
      worldY: world.y,
      col,
      row,
      tileSolid: inBounds && doc.tiles[row * doc.cols + col] === TerrainTile.Solid,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.store.get().mode === "play") return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const world = this.screenToWorld(e.clientX, e.clientY);
    this.lastPointer = { x: e.clientX, y: e.clientY };

    // Pan: middle button, or space+left, or the pan tool.
    if (
      e.button === 1 ||
      (e.button === 0 && (this.spaceDown || this.store.get().activeTool === "pan"))
    ) {
      this.panning = true;
      return;
    }

    const state = this.store.get();

    // Terrain paint: left paints solid, right (or Alt+left) erases. Start the
    // stroke here so a right-drag begins erasing rather than opening the menu.
    if (state.activeTool === "tile" && (e.button === 0 || e.button === 2)) {
      this.tileStroke = { erase: e.button === 2 || e.altKey, changed: new Map() };
      this.paintTileAt(world);
      this.redraw();
      return;
    }

    if (e.button !== 0) return;

    if (state.activeTool === "place" && state.placingDefinitionId) {
      placeAt(this.store, state.placingDefinitionId, world.x, world.y);
      return;
    }

    // Resize handle first.
    const handle = this.handleAt(e.clientX, e.clientY);
    if (handle) {
      const target = this.singleResizable();
      if (target) {
        this.resizeState = { id: target.id, handle, orig: boxOf(target) };
        return;
      }
    }

    const hit = this.topObjectAt(world.x, world.y);
    if (hit) {
      if (e.shiftKey) {
        this.pendingToggle = hit.id;
      } else {
        const selectedIds = selectedObjectIds(state.selection);
        if (!selectedIds.includes(hit.id)) this.store.selectObjects([hit.id]);
        const ids = selectedObjectIds(this.store.get().selection);
        const orig = new Map<string, Box>();
        for (const o of state.document.objects) if (ids.includes(o.id)) orig.set(o.id, boxOf(o));
        this.dragStart = { kind: "objects", world, ids, orig };
      }
    } else {
      this.store.setHover(undefined);
      const tileIndex = this.tileIndexAt(world.x, world.y);
      const terrain = tileIndex !== null && this.isTerrainCell(tileIndex);
      if (terrain && !e.shiftKey) {
        const sel = state.selection;
        const already = sel.kind === "tiles" && sel.indices.includes(tileIndex);
        if (!already) this.store.selectTiles([tileIndex]);
        const next = this.store.get().selection;
        const indices = next.kind === "tiles" ? [...next.indices] : [tileIndex];
        this.dragStart = { kind: "tiles", world, indices };
      } else {
        this.pendingTileToggle = e.shiftKey && terrain ? tileIndex : null;
        this.marquee = {
          start: world,
          current: world,
          additive: e.shiftKey,
          base: e.shiftKey ? cloneSelection(state.selection) : emptySelection(),
        };
        this.marqueeActive = false;
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const world = this.screenToWorld(e.clientX, e.clientY);
    this.pointerWorld = world;

    if (this.panning) {
      const { zoom, viewportPosition } = this.store.get();
      const dx = (e.clientX - this.lastPointer.x) / zoom;
      const dy = (e.clientY - this.lastPointer.y) / zoom;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.store.setView(zoom, { x: viewportPosition.x - dx, y: viewportPosition.y - dy });
      return;
    }

    if (this.tileStroke) {
      this.paintTileAt(world);
      this.redraw();
      return;
    }

    if (this.resizeState) {
      this.applyResize(world);
      this.redraw();
      return;
    }

    if (this.marquee) {
      this.marquee.current = world;
      const zoom = this.store.get().zoom;
      const dist =
        Math.hypot(world.x - this.marquee.start.x, world.y - this.marquee.start.y) * zoom;
      if (dist >= 3) {
        this.marqueeActive = true;
        this.applyMarqueeSelection();
        this.redraw();
      }
      return;
    }

    if (this.dragStart) {
      const rawDx = world.x - this.dragStart.world.x;
      const rawDy = world.y - this.dragStart.world.y;
      if (!this.dragging && Math.hypot(rawDx, rawDy) * this.store.get().zoom < 3) return;
      this.dragging = true;
      if (this.dragStart.kind === "tiles") {
        const grid = this.store.get().document.gridSize;
        const raw = {
          dCol: Math.round(rawDx / grid),
          dRow: Math.round(rawDy / grid),
        };
        this.live = {
          type: "moveTiles",
          ...this.clampTileDelta(this.dragStart.indices, raw.dCol, raw.dRow),
        };
      } else {
        const primaryId = this.dragStart.ids[0];
        const primary = this.dragStart.orig.get(primaryId);
        let dx = rawDx;
        let dy = rawDy;
        if (primary) {
          dx = this.store.snap(primary.x + rawDx) - primary.x;
          dy = this.store.snap(primary.y + rawDy) - primary.y;
        }
        this.live = { type: "move", dx, dy };
      }
      this.redraw();
      return;
    }

    // Idle hover. The tile tool wants the cell cursor, not object highlights.
    if (this.store.get().mode !== "play") {
      const tool = this.store.get().activeTool;
      if (tool === "tile") {
        this.store.setHover(undefined);
        this.redraw();
      } else {
        const hit = this.topObjectAt(world.x, world.y);
        if (hit) {
          this.store.setHover({ kind: "object", id: hit.id });
        } else {
          const index = this.tileIndexAt(world.x, world.y);
          if (index !== null && this.isTerrainCell(index)) {
            this.store.setHover({ kind: "tile", index });
          } else {
            this.store.setHover(undefined);
          }
        }
      }
    }
  }

  /** Record the tile under a world point into the active stroke's preview map. */
  private paintTileAt(world: { x: number; y: number }): void {
    const stroke = this.tileStroke;
    if (!stroke) return;
    const doc = this.store.get().document;
    const col = Math.floor(world.x / doc.gridSize);
    const row = Math.floor(world.y / doc.gridSize);
    if (col < 0 || row < 0 || col >= doc.cols || row >= doc.rows) return;
    stroke.changed.set(row * doc.cols + col, stroke.erase ? TerrainTile.Empty : TerrainTile.Solid);
  }

  private applyResize(world: { x: number; y: number }): void {
    const rs = this.resizeState;
    if (!rs) return;
    const o = rs.orig;
    let x = o.x;
    let y = o.y;
    let right = o.x + o.w;
    let bottom = o.y + o.h;
    if (rs.handle.includes("w")) x = this.store.snap(world.x);
    if (rs.handle.includes("e")) right = this.store.snap(world.x);
    if (rs.handle.includes("n")) y = this.store.snap(world.y);
    if (rs.handle.includes("s")) bottom = this.store.snap(world.y);
    const w = Math.max(1, right - x);
    const h = Math.max(1, bottom - y);
    this.live = { type: "resize", id: rs.id, box: { x, y, w, h } };
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.panning) {
      this.panning = false;
      return;
    }

    if (this.marquee) {
      if (this.marqueeActive) {
        this.applyMarqueeSelection();
      } else if (this.pendingTileToggle !== null && e.shiftKey) {
        this.store.toggleTileInSelection(this.pendingTileToggle);
      } else if (!this.marquee.additive) {
        const index = this.tileIndexAt(this.marquee.start.x, this.marquee.start.y);
        if (index !== null && this.isTerrainCell(index)) this.store.selectTiles([index]);
        else this.store.clearSelection();
      }
      this.pendingTileToggle = null;
      this.marquee = null;
      this.marqueeActive = false;
      this.redraw();
      return;
    }

    if (this.tileStroke) {
      const { erase, changed } = this.tileStroke;
      this.tileStroke = null;
      const edits = [...changed].map(([index, value]) => ({ index, value }));
      paintTiles(this.store, edits, erase); // emits a redraw via the store change
      this.redraw();
      return;
    }

    if (this.resizeState && this.live?.type === "resize") {
      const rs = this.resizeState;
      const box = this.live.box;
      const before = { x: rs.orig.x, y: rs.orig.y, width: rs.orig.w, height: rs.orig.h };
      const after = { x: box.x, y: box.y, width: box.w, height: box.h };
      this.live = null;
      this.resizeState = null;
      this.store.execute(setTransform(rs.id, before, after));
      return;
    }
    this.resizeState = null;

    if (this.dragging && this.live?.type === "moveTiles") {
      const { dCol, dRow } = this.live;
      this.live = null;
      this.dragging = false;
      this.dragStart = null;
      if (dCol !== 0 || dRow !== 0) moveSelectedTiles(this.store, dCol, dRow);
      else this.redraw();
      return;
    }

    if (this.dragging && this.live?.type === "move") {
      const { dx, dy } = this.live;
      const ids = this.dragStart?.kind === "objects" ? this.dragStart.ids : [];
      this.live = null;
      this.dragging = false;
      this.dragStart = null;
      if (dx !== 0 || dy !== 0) this.store.execute(moveObjects(ids, dx, dy));
      else this.redraw();
      return;
    }

    if (this.pendingToggle && e.shiftKey) {
      this.store.toggleObjectInSelection(this.pendingToggle);
    }
    this.pendingToggle = null;
    this.pendingTileToggle = null;
    this.dragStart = null;
    this.dragging = false;
    this.live = null;
  }

  private updateCursor(): void {
    const state = this.store.get();
    let cursor = "default";
    if (this.panning || this.spaceDown || state.activeTool === "pan") cursor = "grab";
    else if (
      this.marqueeActive ||
      state.activeTool === "place" ||
      state.activeTool === "tile"
    ) {
      cursor = "crosshair";
    }
    if (state.mode === "play") cursor = "default";
    this.canvas.style.cursor = cursor;
  }

  /** Hide/show the editing surface (Play mode swaps in the game renderer). */
  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? "block" : "none";
  }

  destroy(): void {
    this.app.destroy({ removeView: true }, { children: true });
  }
}
