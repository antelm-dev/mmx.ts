import { instanceSize, requireDefinition } from "@mmx/content-schema";
import { clear, el } from "../util/dom.js";
import type { EditorContext } from "./context.js";

/** Bottom dock: asset placeholder, validation problems, and selection details. */
export class BottomPanel {
  readonly root = el("div", { class: "panel bottom" });
  private problems = el("div", { class: "scroll", style: "flex:1" });
  private selection = el("div", { class: "scroll", style: "flex:1" });
  private problemsTitle = el("div", { class: "section-title" }, ["Problems"]);

  constructor(private readonly ctx: EditorContext) {
    this.build();
    ctx.store.subscribe((_, reason) => {
      if (reason !== "view") this.render();
    });
    this.render();
  }

  private build(): void {
    const assets = el("div", { class: "tabcol" }, [
      el("div", { class: "section-title" }, ["Assets"]),
      el("div", { class: "asset-ph" }, [
        "Asset browser — coming soon.\nSprites and audio are loaded by the engine's renderer during Play.",
      ]),
    ]);
    const problemsCol = el("div", { class: "tabcol" }, [this.problemsTitle, this.problems]);
    const selectionCol = el("div", { class: "tabcol" }, [
      el("div", { class: "section-title" }, ["Selection"]),
      this.selection,
    ]);
    this.root.append(assets, problemsCol, selectionCol);
  }

  private render(): void {
    this.renderProblems();
    this.renderSelection();
  }

  private renderProblems(): void {
    clear(this.problems);
    const result = this.ctx.store.validate();
    this.problemsTitle.textContent =
      result.errorCount + result.warningCount === 0
        ? "Problems"
        : `Problems — ${result.errorCount} error${result.errorCount === 1 ? "" : "s"}, ${result.warningCount} warning${result.warningCount === 1 ? "" : "s"}`;

    if (result.issues.length === 0) {
      this.problems.append(
        el("div", { class: "empty-note" }, ["No problems detected. Ready to play."]),
      );
      return;
    }
    for (const issue of result.issues) {
      const row = el(
        "div",
        {
          class: `problem ${issue.severity}`,
          onClick: () => issue.objectId && this.ctx.focusObject(issue.objectId),
        },
        [
          el("span", { class: "dot" }, []),
          el("span", { style: "flex:1" }, [issue.message]),
          el("span", { class: "code" }, [issue.code]),
        ],
      );
      this.problems.append(row);
    }
  }

  private renderSelection(): void {
    clear(this.selection);
    const state = this.ctx.store.get();
    const { selectedIds, document: doc } = state;

    if (selectedIds.length === 0) {
      this.kv("Level", doc.name);
      this.kv("Grid", `${doc.gridSize}px — ${doc.cols}×${doc.rows} tiles`);
      this.kv("Objects", String(doc.objects.length));
      this.kv("Mode", state.mode);
      return;
    }
    if (selectedIds.length > 1) {
      this.kv("Selected", `${selectedIds.length} objects`);
      return;
    }
    const inst = doc.objects.find((o) => o.id === selectedIds[0]);
    if (!inst) return;
    const def = requireDefinition(inst.definitionId);
    const { width, height } = instanceSize(inst);
    this.kv("Type", def.name);
    this.kv("Definition", inst.definitionId);
    this.kv("Position", `${inst.x}, ${inst.y}`);
    if (def.editor.resizable) this.kv("Size", `${width} × ${height}`);
    this.kv("ID", inst.id);
  }

  private kv(key: string, value: string): void {
    this.selection.append(
      el("div", { class: "kv" }, [
        el("span", { class: "k" }, [key]),
        el("span", { class: "v" }, [value]),
      ]),
    );
  }
}
