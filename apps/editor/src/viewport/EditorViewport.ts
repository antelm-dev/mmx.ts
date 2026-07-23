import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { Tile, World } from "@mmx/engine/game/World.js";
import {
  effectiveValue,
  instanceSize,
  moveObjects,
  requireDefinition,
  setTransform,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import type { EditorStore } from "../state/EditorStore.js";
import { placeAt } from "../state/actions.js";

const COLOR_BG = 0x05070d;
const COLOR_TILE_FILL = 0x0b1120;
const COLOR_TILE_EDGE = 0x33507a;
const COLOR_GRID = 0x161d2b;
const COLOR_SELECT = 0x4c8dff;
const COLOR_HOVER = 0xffffff;

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

/**
 * The Pixi editing surface: terrain and every placed object, plus all pointer
 * interaction (pan/zoom, selection, drag-move, resize handles, placement).
 *
 * Deliberately separate from @mmx/renderer-pixi's game `Renderer` — this draws
 * *authoring* affordances (boxes, labels, handles, grid) rather than sprites, and
 * reads the {@link EditorStore} rather than an engine `Scene`. Play mode uses the
 * real renderer; this never does.
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
  private dragStart: {
    world: { x: number; y: number };
    ids: string[];
    orig: Map<string, Box>;
  } | null = null;
  private dragging = false;
  private live:
    | { type: "move"; dx: number; dy: number }
    | { type: "resize"; id: string; box: Box }
    | null = null;
  private resizeState: { id: string; handle: Handle; orig: Box } | null = null;
  private pendingToggle: string | null = null;
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
        if (kind === Tile.Empty) continue;
        const x = tx * TS;
        const y = ty * TS;
        if (kind === Tile.Solid) {
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
    if (this.live?.type === "move" && this.store.get().selectedIds.includes(inst.id)) {
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
      const g = new Graphics();
      const isCamera = def.category === "camera";
      g.rect(box.x, box.y, box.w, box.h).fill({ color, alpha: isCamera ? 0.05 : 0.16 });
      g.rect(box.x, box.y, box.w, box.h).stroke({ width: 1 / zoom, color, alpha: 0.9 });

      // Facing arrow for enemies.
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

      // Label (kept at constant screen size).
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
    const byId = new Map(state.document.objects.map((o) => [o.id, o]));

    if (state.hoveredId && !state.selectedIds.includes(state.hoveredId)) {
      const inst = byId.get(state.hoveredId);
      if (inst) {
        const b = this.objectDrawBox(inst);
        g.rect(b.x, b.y, b.w, b.h).stroke({ width: 1 / zoom, color: COLOR_HOVER, alpha: 0.5 });
      }
    }

    for (const id of state.selectedIds) {
      const inst = byId.get(id);
      if (!inst) continue;
      const b = this.objectDrawBox(inst);
      g.rect(b.x - 1 / zoom, b.y - 1 / zoom, b.w + 2 / zoom, b.h + 2 / zoom).stroke({
        width: 2 / zoom,
        color: COLOR_SELECT,
      });
    }

    // Resize handles for a single selected resizable object.
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
  }

  private singleResizable(): LevelObjectInstance | null {
    const state = this.store.get();
    if (state.selectedIds.length !== 1) return null;
    const inst = state.document.objects.find((o) => o.id === state.selectedIds[0]);
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
    const payload = this.emptyContextAt(e.clientX, e.clientY);
    if (payload) this.onEmptyContextMenu?.(payload);
  }

  /** Resolve a free-cell context payload at screen coords, or null if occupied / out of edit mode. */
  emptyContextAt(clientX: number, clientY: number): EmptyCellContextMenu | null {
    if (this.store.get().mode === "play") return null;
    const world = this.screenToWorld(clientX, clientY);
    if (this.topObjectAt(world.x, world.y)) return null;
    const grid = this.store.get().document.gridSize;
    return {
      clientX,
      clientY,
      worldX: world.x,
      worldY: world.y,
      col: Math.floor(world.x / grid),
      row: Math.floor(world.y / grid),
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
    if (e.button !== 0) return;

    const state = this.store.get();

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
        if (!state.selectedIds.includes(hit.id)) this.store.select([hit.id]);
        const ids = this.store.get().selectedIds;
        const orig = new Map<string, Box>();
        for (const o of state.document.objects) if (ids.includes(o.id)) orig.set(o.id, boxOf(o));
        this.dragStart = { world, ids, orig };
      }
    } else if (!e.shiftKey) {
      this.store.clearSelection();
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

    if (this.resizeState) {
      this.applyResize(world);
      this.redraw();
      return;
    }

    if (this.dragStart) {
      const rawDx = world.x - this.dragStart.world.x;
      const rawDy = world.y - this.dragStart.world.y;
      if (!this.dragging && Math.hypot(rawDx, rawDy) * this.store.get().zoom < 3) return;
      this.dragging = true;
      const primaryId = this.dragStart.ids[0];
      const primary = this.dragStart.orig.get(primaryId);
      let dx = rawDx;
      let dy = rawDy;
      if (primary) {
        dx = this.store.snap(primary.x + rawDx) - primary.x;
        dy = this.store.snap(primary.y + rawDy) - primary.y;
      }
      this.live = { type: "move", dx, dy };
      this.redraw();
      return;
    }

    // Idle hover.
    if (this.store.get().mode !== "play") {
      const hit = this.topObjectAt(world.x, world.y);
      this.store.setHover(hit?.id);
    }
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

    if (this.dragging && this.live?.type === "move") {
      const { dx, dy } = this.live;
      const ids = this.dragStart?.ids ?? [];
      this.live = null;
      this.dragging = false;
      this.dragStart = null;
      if (dx !== 0 || dy !== 0) this.store.execute(moveObjects(ids, dx, dy));
      else this.redraw();
      return;
    }

    if (this.pendingToggle && e.shiftKey) {
      this.store.toggleInSelection(this.pendingToggle);
    }
    this.pendingToggle = null;
    this.dragStart = null;
    this.dragging = false;
    this.live = null;
  }

  private updateCursor(): void {
    const state = this.store.get();
    let cursor = "default";
    if (state.mode === "play") cursor = "default";
    else if (this.panning || this.spaceDown || state.activeTool === "pan") cursor = "grab";
    else if (state.activeTool === "place") cursor = "crosshair";
    this.canvas.style.cursor = cursor;
  }

  /** Hide/show the editing surface (Play mode swaps in the game renderer). */
  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? "block" : "none";
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
