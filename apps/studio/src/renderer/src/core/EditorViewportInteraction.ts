import {
  TerrainTile,
  effectiveValue,
  moveDecorations,
  moveObjects,
  setProperty,
  setTransform,
} from "@mmx/content-schema";
import { decorationBounds } from "@mmx/renderer-pixi";
import {
  paintTileLayer,
  paintTiles,
  placeAt,
  placeDecorationAt,
  moveSelectedTiles,
} from "./actions.js";
import {
  cloneSelection,
  emptySelection,
  selectedDecorationIds,
  selectedObjectIds,
  selectionsEqual,
  type EditorSelection,
  type EditorStore,
} from "./EditorStore.js";
import {
  boxOf,
  cellRect,
  clampTileDelta,
  floodFill,
  dragTravel,
  handleHitTest,
  normalizeBox,
  pointHitTest,
  singleResizableObject,
  tileIndexAt,
  tilesIntersecting,
  travelsVertically,
  travelTarget,
  type Box,
  type Handle,
} from "./EditorViewportGeometry.js";
import type {
  EmptyCellContextMenu,
  LivePreview,
  MarqueePreview,
  TileStrokePreview,
} from "./EditorViewportRenderer.js";

type DragStart =
  | { kind: "objects"; world: { x: number; y: number }; ids: string[]; orig: Map<string, Box> }
  | {
      kind: "decorations";
      world: { x: number; y: number };
      ids: string[];
      orig: Map<string, { x: number; y: number }>;
    }
  | { kind: "tiles"; world: { x: number; y: number }; indices: number[] };

/**
 * Manages all mutable pointer/keyboard interaction state and translates raw
 * browser events into store mutations, action dispatches, and a typed
 * {@link LivePreview} that the renderer reads for in-flight feedback.
 */
export class EditorViewportInteraction {
  private panning = false;
  private spaceDown = false;
  private lastPointer = { x: 0, y: 0 };
  private dragStart: DragStart | null = null;
  private dragging = false;
  private live: LivePreview = null;
  private resizeState: { id: string; handle: Handle; orig: Box } | null = null;
  /** In-flight travel-grip drag: committed as one Set Travel on release. */
  private travelDrag: {
    id: string;
    start: { x: number; y: number };
    travel: number;
    before: unknown;
    vertical: boolean;
  } | null = null;
  private tileStroke: { erase: boolean; changed: Map<number, TerrainTile> } | null = null;
  /** In-flight tile-layer stroke: cell index -> tile index (-1 erases). */
  private tileArt: {
    layerId: string;
    value: number;
    rect: boolean;
    start: number;
    changed: Map<number, number>;
  } | null = null;
  private pendingToggle: string | null = null;
  private pendingDecorationToggle: string | null = null;
  private pendingTileToggle: number | null = null;
  private marquee: {
    start: { x: number; y: number };
    current: { x: number; y: number };
    additive: boolean;
    base: EditorSelection;
  } | null = null;
  private marqueeActive = false;
  pointerWorld = { x: 0, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: EditorStore,
    private readonly onRedraw: (
      live: LivePreview,
      tileStroke: TileStrokePreview | null,
      marquee: MarqueePreview | null,
      pointerWorld: { x: number; y: number },
    ) => void,
  ) {
    this.bindPointer();
  }

  getLive(): LivePreview {
    return this.live;
  }
  getTileStroke(): TileStrokePreview | null {
    const art = this.tileArt;
    if (!art) return this.tileStroke;
    const shown = art.value < 0 ? TerrainTile.Empty : TerrainTile.Solid;
    return {
      erase: art.value < 0,
      changed: new Map([...art.changed.keys()].map((i) => [i, shown])),
    };
  }
  getMarquee(): MarqueePreview | null {
    if (!this.marquee) return null;
    return { start: this.marquee.start, current: this.marquee.current, active: this.marqueeActive };
  }
  isPanning(): boolean {
    return this.panning;
  }
  isSpaceDown(): boolean {
    return this.spaceDown;
  }
  isMarqueeActive(): boolean {
    return this.marqueeActive;
  }
  setSpace(down: boolean): void {
    this.spaceDown = down;
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const { zoom, viewportPosition } = this.store.get();
    return {
      x: viewportPosition.x + (clientX - rect.left) / zoom,
      y: viewportPosition.y + (clientY - rect.top) / zoom,
    };
  }

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

  private topObjectAt(wx: number, wy: number) {
    const objects = this.store.get().document.objects;
    for (let i = objects.length - 1; i >= 0; i--) {
      const b = boxOf(objects[i]);
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return objects[i];
    }
    return null;
  }

  private topDecorationAt(wx: number, wy: number) {
    const state = this.store.get();
    const { decorationLayerVisible: vis, decorationLayerLocked: locks } = state;
    const decos = state.document.decorations;
    for (let i = decos.length - 1; i >= 0; i--) {
      const d = decos[i];
      if (!vis[d.layer] || locks[d.layer]) continue;
      const b = decorationBounds(d);
      if (b && wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return d;
    }
    return null;
  }

  private boxesIntersect(a: Box, b: Box): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  private decorationsIntersecting(box: Box): string[] {
    const {
      decorationLayerVisible: vis,
      decorationLayerLocked: locks,
      document: doc,
    } = this.store.get();
    return doc.decorations
      .filter((d) => {
        if (!vis[d.layer] || locks[d.layer]) return false;
        const b = decorationBounds(d);
        return b !== null && this.boxesIntersect(b, box);
      })
      .map((d) => d.id);
  }

  private objectsIntersecting(box: Box): string[] {
    return this.store
      .get()
      .document.objects.filter((o) => this.boxesIntersect(boxOf(o), box))
      .map((o) => o.id);
  }

  private isTerrainCell(index: number): boolean {
    return (this.store.get().document.tiles[index] ?? TerrainTile.Empty) !== TerrainTile.Empty;
  }

  private tilesAt(box: Box): number[] {
    const doc = this.store.get().document;
    return tilesIntersecting(box, doc.cols, doc.rows, doc.gridSize, (i) => this.isTerrainCell(i));
  }

  private tileAt(world: { x: number; y: number }): number | null {
    const doc = this.store.get().document;
    return tileIndexAt(world.x, world.y, doc.cols, doc.rows, doc.gridSize);
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
      const decoIds = this.decorationsIntersecting(box);
      if (decoIds.length > 0) {
        next =
          m.additive && m.base.kind === "decorations"
            ? { kind: "decorations", ids: [...new Set([...m.base.ids, ...decoIds])] }
            : { kind: "decorations", ids: decoIds };
      } else {
        const indices = this.tilesAt(box);
        next =
          m.additive && m.base.kind === "tiles"
            ? { kind: "tiles", indices: [...new Set([...m.base.indices, ...indices])] }
            : { kind: "tiles", indices };
      }
    }
    if (!selectionsEqual(this.store.get().selection, next)) this.store.setSelection(next);
  }

  private handleAt(clientX: number, clientY: number): Handle | null {
    const state = this.store.get();
    const target = singleResizableObject(
      state.document.objects,
      selectedObjectIds(state.selection),
    );
    if (!target) return null;
    const { zoom, viewportPosition } = state;
    return handleHitTest(
      boxOf(target),
      clientX,
      clientY,
      this.canvas.getBoundingClientRect(),
      zoom,
      viewportPosition.x,
      viewportPosition.y,
    );
  }

  private travelGripAt(clientX: number, clientY: number) {
    const state = this.store.get();
    const target = travelTarget(state.document.objects, selectedObjectIds(state.selection));
    if (!target) return null;
    const { zoom, viewportPosition } = state;
    const rect = this.canvas.getBoundingClientRect();
    return pointHitTest(
      target.grip,
      clientX,
      clientY,
      rect,
      zoom,
      viewportPosition.x,
      viewportPosition.y,
    )
      ? target.inst
      : null;
  }

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
    this.live = {
      type: "resize",
      id: rs.id,
      box: { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) },
    };
  }

  private commitTileDrag(): void {
    const live = this.live;
    if (!live || live.type !== "moveTiles") return;
    const { dCol, dRow } = live;
    this.live = null;
    this.dragging = false;
    this.dragStart = null;
    if (dCol !== 0 || dRow !== 0) moveSelectedTiles(this.store, dCol, dRow);
    else this.redraw();
  }

  private commitDecorationDrag(): void {
    const live = this.live;
    if (!live || live.type !== "moveDecorations") return;
    const { dx, dy } = live;
    const ids = this.dragStart?.kind === "decorations" ? this.dragStart.ids : [];
    this.live = null;
    this.dragging = false;
    this.dragStart = null;
    if (dx !== 0 || dy !== 0) this.store.execute(moveDecorations(ids, dx, dy));
    else this.redraw();
  }

  private commitObjectDrag(): void {
    const live = this.live;
    if (!live || live.type !== "move") return;
    const { dx, dy } = live;
    const ids = this.dragStart?.kind === "objects" ? this.dragStart.ids : [];
    this.live = null;
    this.dragging = false;
    this.dragStart = null;
    if (dx !== 0 || dy !== 0) this.store.execute(moveObjects(ids, dx, dy));
    else this.redraw();
  }

  private readonly windowListeners = new AbortController();

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    c.addEventListener("pointermove", (e) => this.onPointerMove(e));
    const { signal } = this.windowListeners;
    window.addEventListener("pointerup", (e) => this.onPointerUp(e), { signal });
    c.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "Space") this.spaceDown = true;
      },
      { signal },
    );
    window.addEventListener(
      "keyup",
      (e) => {
        if (e.code === "Space") this.spaceDown = false;
      },
      { signal },
    );
  }

  /** Drop the window listeners; the canvas ones go with the canvas. */
  destroy(): void {
    this.windowListeners.abort();
  }

  private redraw(): void {
    this.onRedraw(this.live, this.getTileStroke(), this.getMarquee(), this.pointerWorld);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const state = this.store.get();
    const before = this.screenToWorld(e.clientX, e.clientY);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const zoom = Math.max(0.2, Math.min(16, state.zoom * factor));
    const rect = this.canvas.getBoundingClientRect();
    const vp = {
      x: before.x - (e.clientX - rect.left) / zoom,
      y: before.y - (e.clientY - rect.top) / zoom,
    };
    this.store.setView(zoom, vp);
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.store.get().mode === "play") return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const world = this.screenToWorld(e.clientX, e.clientY);
    this.lastPointer = { x: e.clientX, y: e.clientY };

    if (
      e.button === 1 ||
      (e.button === 0 && (this.spaceDown || this.store.get().activeTool === "pan"))
    ) {
      this.panning = true;
      return;
    }

    const state = this.store.get();

    if (state.activeTool === "tile" && (e.button === 0 || e.button === 2)) {
      this.tileStroke = { erase: e.button === 2 || e.altKey, changed: new Map() };
      this.paintTileAt(world);
      this.redraw();
      return;
    }

    if (state.activeTool === "tilePaint" && (e.button === 0 || e.button === 2)) {
      const { layerId, tile, mode } = state.tilePaint;
      const layer = state.document.tileLayers?.find((l) => l.id === layerId);
      const index = this.tileAt(world);
      if (!layer || index === null) return;
      const value = mode === "erase" || e.button === 2 ? -1 : tile;
      if (mode === "fill") {
        const region = floodFill(layer.cells, state.document.cols, index);
        paintTileLayer(this.store, layer.id, new Map(region.map((i) => [i, value])), "Fill tiles");
        return;
      }
      this.tileArt = {
        layerId: layer.id,
        value,
        rect: mode === "rect",
        start: index,
        changed: new Map([[index, value]]),
      };
      this.redraw();
      return;
    }

    if (e.button !== 0) return;

    if (state.activeTool === "place" && state.placingDefinitionId) {
      placeAt(this.store, state.placingDefinitionId, world.x, world.y);
      return;
    }
    if (state.activeTool === "placeDecoration" && state.placingAssetId) {
      placeDecorationAt(this.store, state.placingAssetId, world.x, world.y);
      return;
    }

    const handle = this.handleAt(e.clientX, e.clientY);
    if (handle) {
      const target = singleResizableObject(
        state.document.objects,
        selectedObjectIds(state.selection),
      );
      if (target) {
        this.resizeState = { id: target.id, handle, orig: boxOf(target) };
        return;
      }
    }

    const traveller = this.travelGripAt(e.clientX, e.clientY);
    if (traveller) {
      const travel = effectiveValue(traveller, "Travel");
      this.travelDrag = {
        id: traveller.id,
        start: world,
        travel: typeof travel === "number" ? travel : 0,
        before: traveller.overrides?.Travel,
        vertical: travelsVertically(traveller),
      };
      return;
    }

    const hit = this.topObjectAt(world.x, world.y);
    if (hit) {
      if (e.shiftKey) {
        this.pendingToggle = hit.id;
        return;
      }
      const selectedIds = selectedObjectIds(state.selection);
      if (!selectedIds.includes(hit.id)) this.store.selectObjects([hit.id]);
      const ids = selectedObjectIds(this.store.get().selection);
      const orig = new Map<string, Box>();
      for (const o of state.document.objects) if (ids.includes(o.id)) orig.set(o.id, boxOf(o));
      this.dragStart = { kind: "objects", world, ids, orig };
      return;
    }

    const hitDec = this.topDecorationAt(world.x, world.y);
    if (hitDec) {
      if (e.shiftKey) {
        this.pendingDecorationToggle = hitDec.id;
        return;
      }
      const selDecIds = selectedDecorationIds(state.selection);
      if (!selDecIds.includes(hitDec.id)) this.store.selectDecorations([hitDec.id]);
      const ids = selectedDecorationIds(this.store.get().selection);
      const orig = new Map<string, { x: number; y: number }>();
      for (const d of state.document.decorations)
        if (ids.includes(d.id)) orig.set(d.id, { x: d.x, y: d.y });
      this.dragStart = { kind: "decorations", world, ids, orig };
      return;
    }

    this.store.setHover(undefined);
    const tileIndex = this.tileAt(world);
    const terrain = tileIndex !== null && this.isTerrainCell(tileIndex);
    if (terrain && !e.shiftKey) {
      const already =
        state.selection.kind === "tiles" && state.selection.indices.includes(tileIndex);
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
    if (this.tileArt) {
      const art = this.tileArt;
      const index = this.tileAt(world);
      if (index !== null && art.rect) {
        art.changed = new Map(
          cellRect(this.store.get().document.cols, art.start, index).map((i) => [i, art.value]),
        );
      } else if (index !== null) {
        art.changed.set(index, art.value);
      }
      this.redraw();
      return;
    }
    if (this.resizeState) {
      this.applyResize(world);
      this.redraw();
      return;
    }
    if (this.travelDrag) {
      const td = this.travelDrag;
      const travel = dragTravel(
        td.travel,
        world.x - td.start.x,
        world.y - td.start.y,
        td.vertical,
        (v) => this.store.snap(v),
      );
      this.live = { type: "travel", id: td.id, travel };
      this.redraw();
      return;
    }

    if (this.marquee) {
      this.marquee.current = world;
      const dist =
        Math.hypot(world.x - this.marquee.start.x, world.y - this.marquee.start.y) *
        this.store.get().zoom;
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
        const { gridSize, cols, rows } = this.store.get().document;
        const raw = { dCol: Math.round(rawDx / gridSize), dRow: Math.round(rawDy / gridSize) };
        this.live = {
          type: "moveTiles",
          ...clampTileDelta(this.dragStart.indices, cols, rows, raw.dCol, raw.dRow),
        };
      } else if (this.dragStart.kind === "decorations") {
        const primary = this.dragStart.orig.get(this.dragStart.ids[0]);
        const dx = primary ? this.store.snap(primary.x + rawDx) - primary.x : rawDx;
        const dy = primary ? this.store.snap(primary.y + rawDy) - primary.y : rawDy;
        this.live = { type: "moveDecorations", dx, dy };
      } else {
        const primary = this.dragStart.orig.get(this.dragStart.ids[0]);
        const dx = primary ? this.store.snap(primary.x + rawDx) - primary.x : rawDx;
        const dy = primary ? this.store.snap(primary.y + rawDy) - primary.y : rawDy;
        this.live = { type: "move", dx, dy };
      }
      this.redraw();
      return;
    }

    if (this.store.get().mode !== "play") {
      const tool = this.store.get().activeTool;
      if (tool === "tile" || tool === "tilePaint") {
        this.store.setHover(undefined);
        this.redraw();
        return;
      }
      const hit = this.topObjectAt(world.x, world.y);
      if (hit) {
        this.store.setHover({ kind: "object", id: hit.id });
        return;
      }
      const hitDec = this.topDecorationAt(world.x, world.y);
      if (hitDec) {
        this.store.setHover({ kind: "decoration", id: hitDec.id });
        return;
      }
      const index = this.tileAt(world);
      if (index !== null && this.isTerrainCell(index)) this.store.setHover({ kind: "tile", index });
      else this.store.setHover(undefined);
    }
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
        const index = this.tileAt(this.marquee.start);
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
      paintTiles(
        this.store,
        [...changed].map(([index, value]) => ({ index, value })),
        erase,
      );
      this.redraw();
      return;
    }

    if (this.tileArt) {
      const { layerId, changed, rect, value } = this.tileArt;
      this.tileArt = null;
      paintTileLayer(
        this.store,
        layerId,
        changed,
        value < 0 ? "Erase tiles" : rect ? "Paint tile rectangle" : "Paint tiles",
      );
      this.redraw();
      return;
    }

    if (this.resizeState && this.live?.type === "resize") {
      const rs = this.resizeState;
      const box = this.live.box;
      this.live = null;
      this.resizeState = null;
      this.store.execute(
        setTransform(
          rs.id,
          { x: rs.orig.x, y: rs.orig.y, width: rs.orig.w, height: rs.orig.h },
          { x: box.x, y: box.y, width: box.w, height: box.h },
        ),
      );
      return;
    }
    this.resizeState = null;

    if (this.travelDrag) {
      const td = this.travelDrag;
      const travel = this.live?.type === "travel" ? this.live.travel : td.travel;
      this.travelDrag = null;
      this.live = null;
      if (travel !== td.travel)
        this.store.execute(setProperty(td.id, "Travel", "override", td.before, travel));
      else this.redraw();
      return;
    }

    if (this.dragging && this.live?.type === "moveTiles") {
      this.commitTileDrag();
      return;
    }
    if (this.dragging && this.live?.type === "moveDecorations") {
      this.commitDecorationDrag();
      return;
    }
    if (this.dragging && this.live?.type === "move") {
      this.commitObjectDrag();
      return;
    }

    if (this.pendingToggle && e.shiftKey) this.store.toggleObjectInSelection(this.pendingToggle);
    if (this.pendingDecorationToggle && e.shiftKey)
      this.store.toggleDecorationInSelection(this.pendingDecorationToggle);
    this.pendingToggle = null;
    this.pendingDecorationToggle = null;
    this.pendingTileToggle = null;
    this.dragStart = null;
    this.dragging = false;
    this.live = null;
  }
}
