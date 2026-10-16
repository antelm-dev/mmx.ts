import { Application } from "pixi.js";
import { loadEditorAssets, type AssetCatalog } from "@mmx/renderer-pixi";
import { starterAssets } from "../assets/studioAssets.js";
import type { EditorStore } from "./EditorStore.js";
import { EditorViewportRenderer } from "./EditorViewportRenderer.js";
import { EditorViewportInteraction } from "./EditorViewportInteraction.js";

export type {
  EmptyCellContextMenu,
  EmptyCellContextMenuHandler,
} from "./EditorViewportRenderer.js";

const COLOR_BG = 0x05070d;

/**
 * Public façade for the Pixi editing surface.
 *
 * Owns the Application lifecycle, canvas insertion, resize observation, and
 * camera controls. Delegates all drawing to {@link EditorViewportRenderer} and
 * all pointer/keyboard handling to {@link EditorViewportInteraction}.
 */
export class EditorViewport {
  private readonly renderer: EditorViewportRenderer;
  private readonly interaction: EditorViewportInteraction;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private onEmptyContextMenu:
    | import("./EditorViewportRenderer.js").EmptyCellContextMenuHandler
    | null = null;

  private constructor(
    private readonly app: Application,
    private readonly canvas: HTMLCanvasElement,
    private readonly store: EditorStore,
  ) {
    this.renderer = new EditorViewportRenderer(app, store, starterAssets.catalog);
    this.interaction = new EditorViewportInteraction(
      canvas,
      store,
      (live, tileStroke, marquee, pointerWorld) => {
        this.renderer.updateCursor(
          canvas,
          this.interaction.isPanning(),
          this.interaction.isSpaceDown(),
          this.interaction.isMarqueeActive(),
        );
        this.renderer.redraw(live, tileStroke, marquee, pointerWorld);
      },
    );

    // Wire context-menu so the interaction module delegates back up.
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (store.get().mode === "play") return;
      if (store.get().activeTool === "tile" || store.get().activeTool === "tilePaint") return;
      const payload = this.interaction.emptyContextAt(e.clientX, e.clientY);
      if (payload) this.onEmptyContextMenu?.(payload);
    });
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
    await loadEditorAssets(starterAssets.catalog);
    const viewport = new EditorViewport(app, canvas, store);
    const resize = (): void => viewport.onResize(host);
    viewport.resizeObserver = new ResizeObserver(resize);
    viewport.resizeObserver.observe(host);
    resize();
    return viewport;
  }

  private onResize(host: HTMLElement): void {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w > 0 && h > 0) this.app.renderer.resize(w, h);
    this.redraw();
  }

  // ---------- Camera controls ----------

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

  private viewSize(): { w: number; h: number } {
    const r = this.app.renderer;
    return { w: r.width / r.resolution, h: r.height / r.resolution };
  }

  // ---------- Public interaction helpers ----------

  setSpace(down: boolean): void {
    this.interaction.setSpace(down);
  }

  setEmptyContextMenuHandler(
    handler: import("./EditorViewportRenderer.js").EmptyCellContextMenuHandler | null,
  ): void {
    this.onEmptyContextMenu = handler;
  }

  /** The world point under the mouse, or null when the mouse is not over the canvas. */
  pointerWorld(): { x: number; y: number } | null {
    return this.canvas.matches(":hover") ? { ...this.interaction.pointerWorld } : null;
  }

  emptyContextAt(
    clientX: number,
    clientY: number,
  ): import("./EditorViewportRenderer.js").EmptyCellContextMenu | null {
    return this.interaction.emptyContextAt(clientX, clientY);
  }

  // ---------- Lifecycle ----------

  redraw(): void {
    // `setAssets` resolves after an await and may land on a destroyed viewport.
    if (this.destroyed) return;
    this.renderer.updateCursor(
      this.canvas,
      this.interaction.isPanning(),
      this.interaction.isSpaceDown(),
      this.interaction.isMarqueeActive(),
    );
    this.renderer.redraw(
      this.interaction.getLive(),
      this.interaction.getTileStroke(),
      this.interaction.getMarquee(),
      this.interaction.pointerWorld,
    );
  }

  /** Draw from another asset catalog (e.g. after a project is opened). */
  async setAssets(assets: AssetCatalog): Promise<void> {
    await loadEditorAssets(assets);
    this.renderer.setAssets(assets);
    this.redraw();
  }

  /** Drop sprites that show loaded sheets; the next `setAssets` draws them again. */
  releaseSheetTextures(): void {
    this.renderer.releaseSheetTextures();
  }

  /** Hide/show the editing surface (Play mode swaps in the game renderer). */
  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? "block" : "none";
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.interaction.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }
}
