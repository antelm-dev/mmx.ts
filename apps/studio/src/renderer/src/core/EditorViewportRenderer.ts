import { Application, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import {
  TerrainTile,
  effectiveValue,
  definitionFor,
  type DecorationInstance,
  type LevelObjectInstance,
  type SlopeMap,
} from "@mmx/content-schema";
import {
  DecorationView,
  decorationBounds,
  getDecorationAsset,
  getSpritePreview,
  type AssetCatalog,
} from "@mmx/renderer-pixi";
import type { DebugPrimitive } from "@mmx/engine/behaviors";
import { EditableTerrain } from "./EditableTerrain.js";
import { tileLayerWritesCollision } from "./actions.js";
import {
  selectedDecorationIds,
  selectedObjectIds,
  type EditorStore,
} from "./EditorStore.js";
import {
  boxOf,
  environmentGeometry,
  handlePos,
  normalizeBox,
  singleResizableObject,
  hexToNum,
  HANDLES,
  HANDLE_HIT_PX,
  travelEditable,
  travelGrip,
  type Box,
} from "./EditorViewportGeometry.js";

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

const COLOR_BG = 0x05070d;
const COLOR_TILE_FILL = 0x0b1120;
const COLOR_TILE_EDGE = 0x33507a;
const COLOR_GRID = 0x161d2b;
const COLOR_SELECT = 0x4c8dff;
const COLOR_HOVER = 0xffffff;
const COLOR_ERASE = 0xff5a5a;
const COLOR_PATH = 0xffc94d;

/** Typed snapshot of in-flight interaction state passed to {@link EditorViewportRenderer.redraw}. */
export type LivePreview =
  | { type: "move"; dx: number; dy: number }
  | { type: "moveDecorations"; dx: number; dy: number }
  | { type: "moveTiles"; dCol: number; dRow: number }
  | { type: "resize"; id: string; box: Box }
  | { type: "travel"; id: string; travel: number }
  | null;

/** Tile-paint stroke preview: maps row-major tile index → target value. */
export interface TileStrokePreview {
  erase: boolean;
  changed: ReadonlyMap<number, TerrainTile>;
}

/** Marquee selection preview while the drag is in progress. */
export interface MarqueePreview {
  start: { x: number; y: number };
  current: { x: number; y: number };
  active: boolean;
}

/**
 * Owns the Pixi layers and all authoring draw logic.  Stateless with respect
 * to interaction — callers supply a {@link LivePreview} on each frame.
 */
export class EditorViewportRenderer {
  readonly world = new Container();
  private readonly terrainLayer = new Graphics();
  private readonly gridLayer = new Graphics();
  private readonly decorationBackLayer = new Container();
  private readonly objectLayer = new Container();
  private readonly decorationFrontLayer = new Container();
  private readonly overlay = new Graphics();
  /** The game's image-layer + backdrop view, drawn at camera 0 (no parallax) like catalog decorations. */
  private readonly art = new DecorationView();

  private terrainTilesRef: readonly TerrainTile[] | null = null;
  private terrainSlopesRef: SlopeMap | undefined | null = null;
  private terrainCols = -1;
  private terrainRows = -1;
  private terrainGridSize = -1;

  private readonly labelStyle: TextStyle;

  constructor(
    private readonly app: Application,
    private readonly store: EditorStore,
    private assets: AssetCatalog,
  ) {
    this.labelStyle = new TextStyle({
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 10,
      fill: 0xdfe7f5,
    });
    this.world.addChild(
      this.art.farBackground,
      this.art.background,
      this.art.worldBack,
      this.terrainLayer,
      this.gridLayer,
      this.decorationBackLayer,
      this.objectLayer,
      this.decorationFrontLayer,
      this.art.worldFront,
      this.art.foreground,
      this.overlay,
    );
    this.app.stage.addChild(this.art.backdrop, this.world);
  }

  /** Swap the sprite source (the open project's catalog, or the starter fallback). */
  setAssets(assets: AssetCatalog): void {
    this.assets = assets;
    // Image layers built before their sheet loaded were skipped; rebuild against the new sheets.
    this.art.clear();
  }

  /** Drop every sprite that shows a loaded sheet, before `resetSheetCache()` destroys them. */
  releaseSheetTextures(): void {
    this.art.clear();
    for (const layer of [this.decorationBackLayer, this.objectLayer, this.decorationFrontLayer]) {
      layer.removeChildren().forEach((c) => c.destroy());
    }
  }


  redraw(
    live: LivePreview,
    tileStroke: TileStrokePreview | null,
    marquee: MarqueePreview | null,
    pointerWorld: { x: number; y: number },
  ): void {
    const state = this.store.get();
    const { document: doc, zoom, viewportPosition } = state;

    this.world.position.set(-viewportPosition.x * zoom, -viewportPosition.y * zoom);
    this.world.scale.set(zoom);

    if (
      this.terrainTilesRef !== doc.tiles ||
      this.terrainSlopesRef !== doc.slopes ||
      this.terrainCols !== doc.cols ||
      this.terrainRows !== doc.rows ||
      this.terrainGridSize !== doc.gridSize
    ) {
      this.rebuildTerrain();
    }
    this.drawGrid();
    this.drawImageLayers();
    this.drawDecorations(live);
    this.drawObjects(live);
    this.drawOverlay(live, tileStroke, marquee, pointerWorld);
    this.app.render();
  }

  private rebuildTerrain(): void {
    const doc = this.store.get().document;
    const terrain = new EditableTerrain(doc);
    this.terrainTilesRef = doc.tiles;
    this.terrainSlopesRef = doc.slopes;
    this.terrainCols = doc.cols;
    this.terrainRows = doc.rows;
    this.terrainGridSize = doc.gridSize;
    const g = this.terrainLayer;
    g.clear();
    const TS = doc.gridSize;
    for (let ty = 0; ty < doc.rows; ty++) {
      for (let tx = 0; tx < doc.cols; tx++) {
        const kind = terrain.tileAt(tx, ty);
        if (kind === TerrainTile.Empty) continue;
        const x = tx * TS;
        const y = ty * TS;
        if (kind === TerrainTile.Solid) {
          g.rect(x, y, TS, TS);
        } else if (kind === TerrainTile.OneWay) {
          // Solid from above only: draw just the top edge, like the engine renderer.
          g.rect(x, y, TS, Math.max(1, TS / 8));
        } else {
          const { l, r } = terrain.slopeProfile(tx, ty, kind);
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

  private drawImageLayers(): void {
    const { document: doc, decorationLayerVisible: vis } = this.store.get();
    // Rebuilds only when the layers change (DecorationView keys on a signature).
    // An invalid colour (hand-edited JSON) is a Problems error; Pixi would throw on it.
    const backdrop = /^#[0-9a-f]{6}$/i.test(doc.backdrop ?? "") ? doc.backdrop : undefined;
    const imageLayers = Array.isArray(doc.imageLayers) ? doc.imageLayers : undefined;
    const tileLayers = Array.isArray(doc.tileLayers) ? doc.tileLayers : undefined;
    const { tilesets } = this.store.get();
    this.art.setDecorations([], { imageLayers, backdrop, tileLayers, cols: doc.cols, tilesets });
    // Painted world tiles stay visible through the collision fill, which the engine hides.
    this.terrainLayer.alpha = tileLayers?.some(tileLayerWritesCollision) ? 0.35 : 1;
    this.art.backdrop.width = this.app.screen.width;
    this.art.backdrop.height = this.app.screen.height;
    this.art.farBackground.visible = vis["far-background"];
    this.art.background.visible = vis.background;
    this.art.worldBack.visible = vis["world-back"];
    this.art.worldFront.visible = vis["world-front"];
    this.art.foreground.visible = vis.foreground;
    // Lets e2e tests count the image-layer sprites (and tile sprites) the viewport actually
    // drew, and map world cells to screen points.
    const layers = [
      this.art.farBackground,
      this.art.background,
      this.art.worldBack,
      this.art.worldFront,
      this.art.foreground,
    ];
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.dataset.imageLayerSprites = String(layers.reduce((n, c) => n + c.children.length, 0));
    canvas.dataset.tileLayerSprites = String(
      layers.reduce((n, c) => n + c.children.reduce((m, child) => m + child.children.length, 0), 0),
    );
    const { zoom, viewportPosition } = this.store.get();
    canvas.dataset.view = `${zoom},${viewportPosition.x},${viewportPosition.y}`;
  }

  private decorationDrawPos(
    inst: DecorationInstance,
    live: LivePreview,
    selIds: string[],
  ): { x: number; y: number } {
    if (live?.type === "moveDecorations" && selIds.includes(inst.id)) {
      return { x: inst.x + live.dx, y: inst.y + live.dy };
    }
    return { x: inst.x, y: inst.y };
  }

  private drawDecorations(live: LivePreview): void {
    const backLayer = this.decorationBackLayer;
    const frontLayer = this.decorationFrontLayer;
    backLayer.removeChildren().forEach((c) => c.destroy());
    frontLayer.removeChildren().forEach((c) => c.destroy());
    const state = this.store.get();
    const vis = state.decorationLayerVisible;
    const selIds = selectedDecorationIds(state.selection);
    const BACK_LAYERS = new Set(["far-background", "background", "world-back"]);

    for (const inst of state.document.decorations) {
      if (!vis[inst.layer]) continue;
      const asset = getDecorationAsset(inst.assetId);
      if (!asset) continue;
      const texture = this.assets.getDecorationPreview(inst.assetId)?.texture;
      if (!texture) continue;
      const pos = this.decorationDrawPos(inst, live, selIds);
      const sprite = new Sprite(texture);
      sprite.anchor.set(asset.anchor[0], asset.anchor[1]);
      sprite.position.set(pos.x, pos.y);
      if (inst.flipX) sprite.scale.x = -1;
      if (inst.flipY) sprite.scale.y = -1;
      if (inst.rotation) sprite.rotation = inst.rotation;
      if (inst.tint !== undefined) sprite.tint = inst.tint;
      const target = BACK_LAYERS.has(inst.layer) ? backLayer : frontLayer;
      target.addChild(sprite);
    }
  }

  private objectDrawBox(inst: LevelObjectInstance, live: LivePreview): Box {
    const base = boxOf(inst);
    const ids = selectedObjectIds(this.store.get().selection);
    if (live?.type === "move" && ids.includes(inst.id)) {
      return { ...base, x: base.x + live.dx, y: base.y + live.dy };
    }
    if (live?.type === "resize" && live.id === inst.id) return live.box;
    return base;
  }

  private drawObjects(live: LivePreview): void {
    const layer = this.objectLayer;
    layer.removeChildren().forEach((c) => c.destroy());
    const state = this.store.get();
    const zoom = state.zoom;

    for (const inst of state.document.objects) {
      const def = definitionFor(inst.definitionId);
      const color = hexToNum(def.editor.color);
      const box = this.objectDrawBox(inst, live);
      const preview = getSpritePreview(def, this.assets);
      const g = new Graphics();
      const isCamera = def.category === "camera";
      const isSlope = def.category === "slope";
      const hasSprite = !!preview?.texture;

      if (isSlope) {
        const upRight = effectiveValue(inst, "Dir") !== "UpLeft";
        const apexX = upRight ? box.x + box.w : box.x;
        const ramp = [box.x, box.y + box.h, box.x + box.w, box.y + box.h, apexX, box.y];
        g.poly(ramp).fill({ color, alpha: 0.26 });
        g.poly(ramp).stroke({ width: 1 / zoom, color, alpha: 0.95 });
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

      if (preview?.texture) {
        const sprite = new Sprite(preview.texture);
        sprite.anchor.set(0.5);
        sprite.position.set(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2));
        if (def.category === "enemy") {
          const facesRight = effectiveValue(inst, "FacesRight") === true;
          sprite.scale.x = facesRight ? -1 : 1;
        }
        layer.addChild(sprite);
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

  private drawOverlay(
    live: LivePreview,
    tileStroke: TileStrokePreview | null,
    marquee: MarqueePreview | null,
    pointerWorld: { x: number; y: number },
  ): void {
    const g = this.overlay;
    g.clear();
    const state = this.store.get();
    const zoom = state.zoom;
    const grid = state.document.gridSize;

    if (state.activeTool === "tile" || state.activeTool === "tilePaint") {
      this.drawTileToolOverlay(g, grid, zoom, tileStroke, pointerWorld);
      return;
    }

    const byId = new Map(state.document.objects.map((o) => [o.id, o]));
    const selectedIds = selectedObjectIds(state.selection);
    const selectedDecIds = selectedDecorationIds(state.selection);

    if (state.hover?.kind === "object" && !selectedIds.includes(state.hover.id)) {
      const inst = byId.get(state.hover.id);
      if (inst) {
        const b = this.objectDrawBox(inst, live);
        g.rect(b.x, b.y, b.w, b.h).stroke({ width: 1 / zoom, color: COLOR_HOVER, alpha: 0.5 });
      }
    }

    if (state.hover?.kind === "decoration" && !selectedDecIds.includes(state.hover.id)) {
      const hoverId = state.hover.id;
      const dec = state.document.decorations.find((d) => d.id === hoverId);
      const b = dec ? decorationBounds(dec) : null;
      if (b) g.rect(b.x, b.y, b.w, b.h).stroke({ width: 1 / zoom, color: COLOR_HOVER, alpha: 0.5 });
    }

    if (state.hover?.kind === "tile") {
      const selectedTiles = state.selection.kind === "tiles" ? new Set(state.selection.indices) : null;
      if (!selectedTiles?.has(state.hover.index)) {
        const col = state.hover.index % state.document.cols;
        const row = Math.floor(state.hover.index / state.document.cols);
        g.rect(col * grid, row * grid, grid, grid).stroke({ width: 1 / zoom, color: COLOR_HOVER, alpha: 0.5 });
      }
    }

    for (const id of selectedIds) {
      const inst = byId.get(id);
      if (!inst) continue;
      const b = this.objectDrawBox(inst, live);
      g.rect(b.x - 1 / zoom, b.y - 1 / zoom, b.w + 2 / zoom, b.h + 2 / zoom)
        .stroke({ width: 2 / zoom, color: COLOR_SELECT });
      const shown = live?.type === "travel" && live.id === id
        ? { ...inst, overrides: { ...inst.overrides, Travel: live.travel } }
        : inst;
      const geometry = environmentGeometry(shown, b);
      this.drawGeometry(g, geometry, zoom);
      const grip = selectedIds.length === 1 && travelEditable(inst) ? travelGrip(geometry) : null;
      if (grip) {
        const s = HANDLE_HIT_PX / zoom;
        g.rect(grip.x - s / 2, grip.y - s / 2, s, s)
          .fill(COLOR_PATH)
          .stroke({ width: 1 / zoom, color: 0xffffff });
      }
    }

    for (const id of selectedDecIds) {
      const dec = state.document.decorations.find((d) => d.id === id);
      if (!dec) continue;
      const selIds = selectedDecorationIds(state.selection);
      const pos = this.decorationDrawPos(dec, live, selIds);
      const asset = getDecorationAsset(dec.assetId);
      if (!asset) continue;
      const [, , w, h] = asset.region;
      const [ax, ay] = asset.anchor;
      const bx = pos.x - ax * w;
      const by = pos.y - ay * h;
      g.rect(bx - 1 / zoom, by - 1 / zoom, w + 2 / zoom, h + 2 / zoom).stroke({
        width: 2 / zoom,
        color: COLOR_SELECT,
      });
    }

    if (state.selection.kind === "tiles") {
      const dCol = live?.type === "moveTiles" ? live.dCol : 0;
      const dRow = live?.type === "moveTiles" ? live.dRow : 0;
      for (const index of state.selection.indices) {
        const col = (index % state.document.cols) + dCol;
        const row = Math.floor(index / state.document.cols) + dRow;
        if (dCol !== 0 || dRow !== 0) {
          const ox = (index % state.document.cols) * grid;
          const oy = Math.floor(index / state.document.cols) * grid;
          g.rect(ox, oy, grid, grid).fill({ color: COLOR_BG, alpha: 0.45 });
          g.rect(col * grid, row * grid, grid, grid).fill({ color: COLOR_TILE_FILL, alpha: 0.75 });
        }
        g.rect(col * grid - 1 / zoom, row * grid - 1 / zoom, grid + 2 / zoom, grid + 2 / zoom)
          .stroke({ width: 2 / zoom, color: COLOR_SELECT });
      }
    }

    const handleTarget = singleResizableObject(
      state.document.objects,
      selectedIds,
    );
    if (handleTarget) {
      const b = this.objectDrawBox(handleTarget, live);
      const s = HANDLE_HIT_PX / zoom;
      for (const h of HANDLES) {
        const p = handlePos(b, h);
        g.rect(p.x - s / 2, p.y - s / 2, s, s)
          .fill(COLOR_SELECT)
          .stroke({ width: 1 / zoom, color: 0xffffff });
      }
    }

    if (marquee?.active) {
      const box = normalizeBox(
        marquee.start.x,
        marquee.start.y,
        marquee.current.x,
        marquee.current.y,
      );
      g.rect(box.x, box.y, box.w, box.h).fill({ color: COLOR_SELECT, alpha: 0.12 });
      g.rect(box.x, box.y, box.w, box.h).stroke({
        width: 1 / zoom,
        color: COLOR_SELECT,
        alpha: 0.95,
      });
    }
  }

  /** Engine debug primitives (travel path, end rect…), styled by Studio. */
  private drawGeometry(g: Graphics, geometry: readonly DebugPrimitive[], zoom: number): void {
    const stroke = { width: 1 / zoom, color: COLOR_PATH, alpha: 0.9 };
    for (const p of geometry) {
      if (p.kind === "rect") {
        g.rect(p.x, p.y, p.width, p.height).fill({ color: COLOR_PATH, alpha: 0.08 }).stroke(stroke);
      } else if (p.kind === "point") {
        g.circle(p.x, p.y, 2 / zoom).fill(COLOR_PATH);
      } else {
        g.moveTo(p.from.x, p.from.y).lineTo(p.to.x, p.to.y).stroke(stroke);
        // Arrowhead mid-path (the far end holds the grip), so the travel direction reads at a glance.
        const len = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
        if (len === 0) continue;
        const ux = (p.to.x - p.from.x) / len;
        const uy = (p.to.y - p.from.y) / len;
        const head = Math.min(6 / zoom, len / 2);
        const tx = (p.from.x + p.to.x) / 2 + (ux * head) / 2;
        const ty = (p.from.y + p.to.y) / 2 + (uy * head) / 2;
        g.poly([
          tx, ty,
          tx - ux * head - uy * head * 0.5, ty - uy * head + ux * head * 0.5,
          tx - ux * head + uy * head * 0.5, ty - uy * head - ux * head * 0.5,
        ]).fill(COLOR_PATH);
      }
    }
  }

  private drawTileToolOverlay(
    g: Graphics,
    gridSize: number,
    zoom: number,
    tileStroke: TileStrokePreview | null,
    pointerWorld: { x: number; y: number },
  ): void {
    const doc = this.store.get().document;
    const inBounds = (col: number, row: number): boolean =>
      col >= 0 && row >= 0 && col < doc.cols && row < doc.rows;

    if (tileStroke && tileStroke.changed.size > 0) {
      for (const [index, value] of tileStroke.changed) {
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

    const col = Math.floor(pointerWorld.x / gridSize);
    const row = Math.floor(pointerWorld.y / gridSize);
    if (!inBounds(col, row)) return;
    g.rect(col * gridSize, row * gridSize, gridSize, gridSize).stroke({
      width: 1.5 / zoom,
      color: COLOR_SELECT,
      alpha: 0.85,
    });
  }

  /** Update the CSS cursor on the canvas element. */
  updateCursor(canvas: HTMLCanvasElement, panning: boolean, spaceDown: boolean, marqueeActive: boolean): void {
    const state = this.store.get();
    const isPan = panning || spaceDown || state.activeTool === "pan";
    const isCross = marqueeActive || state.activeTool === "place" ||
      state.activeTool === "placeDecoration" || state.activeTool === "tile" ||
      state.activeTool === "tilePaint";
    canvas.style.cursor = state.mode === "play" ? "default" : isPan ? "grab" : isCross ? "crosshair" : "default";
  }
}
