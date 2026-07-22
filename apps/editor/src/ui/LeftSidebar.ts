import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { BUILTIN_LEVELS } from "../levels/builtins.js";
import { clear, el } from "../util/dom.js";
import type { EditorContext } from "./context.js";

/** Left panel: level list on top, searchable object palette below. */
export class LeftSidebar {
  readonly root = el("div", { class: "panel left" });
  private levelList = el("div", {});
  private paletteHost = el("div", { class: "scroll" });
  private search = el("input", {
    class: "search",
    type: "text",
    placeholder: "Search objects…",
  }) as HTMLInputElement;
  private activeLevelKey: string | null = "stage1";

  constructor(private readonly ctx: EditorContext) {
    this.build();
    ctx.store.subscribe(() => this.renderPalette());
    this.search.addEventListener("input", () => this.renderPalette());
  }

  setActiveLevel(key: string | null): void {
    this.activeLevelKey = key;
    this.renderLevels();
  }

  private build(): void {
    const levels = el("div", { class: "section" }, [
      el("div", { class: "section-title" }, ["Levels"]),
      this.levelList,
    ]);
    const palette = el(
      "div",
      { class: "section", style: "flex:1;display:flex;flex-direction:column;min-height:0" },
      [el("div", { class: "section-title" }, ["Object Palette"]), this.search, this.paletteHost],
    );
    this.root.append(levels, palette);
    this.renderLevels();
    this.renderPalette();
  }

  private renderLevels(): void {
    clear(this.levelList);
    for (const level of BUILTIN_LEVELS) {
      const row = el(
        "div",
        {
          class: `list-row ${this.activeLevelKey === level.key ? "active" : ""}`.trim(),
          onClick: () => this.ctx.openBuiltin(level.key),
        },
        [el("span", {}, ["▸"]), el("span", {}, [level.name])],
      );
      this.levelList.append(row);
    }
  }

  private renderPalette(): void {
    clear(this.paletteHost);
    const query = this.search.value.trim().toLowerCase();
    const state = this.ctx.store.get();
    const byCategory = new Map<string, GameObjectDefinition[]>();
    for (const def of OBJECT_DEFINITIONS) {
      if (query && !def.name.toLowerCase().includes(query) && !def.category.includes(query))
        continue;
      const list = byCategory.get(def.category) ?? [];
      list.push(def);
      byCategory.set(def.category, list);
    }

    for (const category of CATEGORY_ORDER) {
      const defs = byCategory.get(category);
      if (!defs || defs.length === 0) continue;
      this.paletteHost.append(
        el("div", { class: "palette-cat" }, [CATEGORY_LABELS[category] ?? category]),
      );
      for (const def of defs) {
        const active = state.activeTool === "place" && state.placingDefinitionId === def.id;
        const item = el(
          "div",
          {
            class: `palette-item ${active ? "active" : ""}`.trim(),
            title: `Place ${def.name}`,
            onClick: () => this.ctx.selectPalette(def.id),
          },
          [
            el("span", { class: "swatch", style: `background:${def.editor.color}` }, []),
            el("span", {}, [`${def.icon ?? ""} ${def.name}`.trim()]),
          ],
        );
        this.paletteHost.append(item);
      }
    }

    if (this.paletteHost.childElementCount === 0) {
      this.paletteHost.append(
        el("div", { class: "empty-note" }, ["No objects match your search."]),
      );
    }
  }
}
