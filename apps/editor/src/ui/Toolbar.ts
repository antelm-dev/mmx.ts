import { clear, el } from "../util/dom.js";
import type { EditorContext } from "./context.js";

/** Top toolbar: file, history, view toggles, zoom, and Play/Stop. */
export class Toolbar {
  readonly root = el("div", { class: "toolbar" });
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private gridBtn!: HTMLButtonElement;
  private snapBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;
  private zoomReadout!: HTMLElement;

  constructor(private readonly ctx: EditorContext) {
    this.build();
    ctx.store.subscribe(() => this.sync());
    this.sync();
  }

  private button(label: string, title: string, onClick: () => void, cls = ""): HTMLButtonElement {
    return el("button", { class: `btn ${cls}`.trim(), title, onClick }, [
      label,
    ]) as HTMLButtonElement;
  }

  private build(): void {
    clear(this.root);
    const brand = el("div", { class: "brand" }, []);
    brand.innerHTML = "MMX <span>Studio</span>";

    this.saveBtn = this.button("Save", "Download level JSON (Ctrl+S)", () => this.ctx.save());
    const fileGroup = el("div", { class: "tb-group" }, [
      this.button("Import", "Open a level JSON file", () => this.ctx.importJson()),
      this.saveBtn,
    ]);

    this.undoBtn = this.button("↶", "Undo (Ctrl+Z)", () => this.ctx.undo(), "icon");
    this.redoBtn = this.button("↷", "Redo (Ctrl+Shift+Z)", () => this.ctx.redo(), "icon");
    const historyGroup = el("div", { class: "tb-group" }, [this.undoBtn, this.redoBtn]);

    this.gridBtn = this.button("Grid", "Toggle grid (G)", () => this.ctx.store.toggleGrid());
    this.snapBtn = this.button("Snap", "Toggle snapping (Shift+G)", () =>
      this.ctx.store.toggleSnap(),
    );
    const viewGroup = el("div", { class: "tb-group" }, [this.gridBtn, this.snapBtn]);

    this.zoomReadout = el("div", { class: "tb-readout" }, ["100%"]);
    const zoomGroup = el("div", { class: "tb-group" }, [
      this.button("−", "Zoom out", () => this.ctx.zoomBy(1 / 1.2), "icon"),
      this.zoomReadout,
      this.button("+", "Zoom in", () => this.ctx.zoomBy(1.2), "icon"),
      this.button("Fit", "Fit level to view (F)", () => this.ctx.fit()),
    ]);

    this.playBtn = this.button(
      "▶ Play",
      "Enter Play mode (Ctrl+Enter)",
      () => this.ctx.togglePlay(),
      "primary",
    );

    this.root.append(
      brand,
      fileGroup,
      historyGroup,
      viewGroup,
      zoomGroup,
      el("div", { class: "spacer" }, []),
      el("div", { class: "tb-group" }, [this.playBtn]),
    );
  }

  private sync(): void {
    const state = this.ctx.store.get();
    this.undoBtn.disabled = !this.ctx.store.canUndo;
    this.redoBtn.disabled = !this.ctx.store.canRedo;
    this.gridBtn.classList.toggle("active", state.gridVisible);
    this.snapBtn.classList.toggle("active", state.snapEnabled);
    this.zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
    const playing = state.mode === "play";
    this.playBtn.textContent = playing ? "■ Stop" : "▶ Play";
    this.playBtn.classList.toggle("danger", playing);
    this.saveBtn.textContent = this.ctx.store.isDirty ? "Save •" : "Save";
    // History/tools are inert during play.
    for (const btn of [this.undoBtn, this.redoBtn]) btn.disabled ||= playing;
  }
}
