import { Component, computed, inject, signal } from "@angular/core";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  requireDefinition,
  type GameObjectDefinition,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import { EditorService } from "./editor.service.js";

type SidebarTab = "palette" | "scene";

interface PaletteGroup {
  category: string;
  label: string;
  defs: GameObjectDefinition[];
}

interface SceneItem {
  inst: LevelObjectInstance;
  def: GameObjectDefinition;
}

@Component({
  selector: "mmx-left-sidebar",
  template: `
    <div class="panel">
      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="tab"
          [class.active]="tab() === 'palette'"
          [attr.aria-selected]="tab() === 'palette'"
          (click)="tab.set('palette')"
        >
          Object Palette
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          [class.active]="tab() === 'scene'"
          [attr.aria-selected]="tab() === 'scene'"
          (click)="tab.set('scene')"
        >
          Scene
          <span class="count">{{ sceneItems().length }}</span>
        </button>
      </div>

      @if (tab() === "palette") {
        <div class="search-wrap">
          <span class="search-icon">⌕</span>
          <input
            class="search-input"
            placeholder="Search objects…"
            aria-label="Search objects"
            [value]="query()"
            (input)="onSearch($event)"
          />
          @if (query()) {
            <button class="clear" type="button" aria-label="Clear search" (click)="query.set('')">
              ×
            </button>
          }
        </div>

        <div class="scroll">
          @for (group of grouped(); track group.category) {
            <div class="cat">{{ group.label }}</div>
            @for (def of group.defs; track def.id) {
              <button
                type="button"
                class="item"
                [class.active]="isPaletteActive(def.id)"
                (click)="service.selectPalette(def.id)"
                [title]="'Place ' + def.name"
              >
                <span class="swatch" [style.background]="def.editor.color">{{ def.icon }}</span>
                <span class="item-name">{{ def.name }}</span>
                <span class="add">+</span>
              </button>
            }
          }
          @if (grouped().length === 0) {
            <div class="empty">No objects match your search.</div>
          }
        </div>
      } @else {
        <div class="scroll">
          @for (row of sceneItems(); track row.inst.id) {
            <button
              type="button"
              class="item"
              [class.active]="isSelected(row.inst.id)"
              (click)="service.focusObject(row.inst.id)"
              [title]="row.inst.id"
            >
              <span class="swatch" [style.background]="row.def.editor.color">{{
                row.def.icon
              }}</span>
              <span class="label">
                <span class="name">{{ row.def.name }}</span>
                <span class="meta">{{ row.inst.x }}, {{ row.inst.y }}</span>
              </span>
            </button>
          }
          @if (sceneItems().length === 0) {
            <div class="empty">No objects in the scene. Place one from the Object Palette.</div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--mmx-surface);
      }
      .tabs {
        display: flex;
        border-bottom: 1px solid var(--mmx-border);
        flex: none;
      }
      .tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 11px 8px 9px;
        border: none;
        background: transparent;
        color: var(--mmx-text-3);
        font: inherit;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
      }
      .tab:hover {
        color: var(--mmx-text-2);
        background: var(--mmx-surface-hover);
      }
      .tab.active {
        color: #d8e7ff;
        border-bottom-color: var(--mmx-accent);
      }
      .count {
        font-family: var(--mmx-mono);
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
        color: #6b7488;
        background: #1a2030;
        padding: 1px 5px;
        border-radius: 4px;
      }
      .tab.active .count {
        color: #93c5fd;
        background: #1c2c4a;
      }
      .search-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 36px;
        margin: 12px 12px 7px;
        padding: 0 10px;
        border: 1px solid var(--mmx-border-strong);
        border-radius: 8px;
        background: var(--mmx-surface-raised);
        transition:
          border-color 120ms,
          box-shadow 120ms;
      }
      .search-wrap:focus-within {
        border-color: var(--mmx-accent);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
      }
      .search-icon {
        color: var(--mmx-text-3);
        font-size: 17px;
        transform: rotate(-20deg);
      }
      .search-input {
        min-width: 0;
        flex: 1;
        border: 0;
        outline: 0;
        background: transparent;
        color: var(--mmx-text);
        font: inherit;
        font-size: 12px;
      }
      .search-input::placeholder {
        color: var(--mmx-text-3);
      }
      .clear {
        border: 0;
        background: transparent;
        color: var(--mmx-text-3);
        cursor: pointer;
        font-size: 17px;
      }
      .scroll {
        overflow-y: auto;
        min-height: 0;
        flex: 1;
      }
      .cat {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--mmx-text-3);
        padding: 13px 14px 5px;
        font-weight: 700;
      }
      .item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: calc(100% - 14px);
        min-height: 34px;
        margin: 1px 7px;
        padding: 5px 8px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;
        font-size: 12.5px;
        color: var(--mmx-text-2);
        transition:
          background 100ms,
          color 100ms;
      }
      .item:hover {
        background: var(--mmx-surface-hover);
        color: var(--mmx-text);
      }
      .item.active {
        background: rgba(59, 130, 246, 0.16);
        color: #d8e7ff;
      }
      .swatch {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        flex: none;
        color: rgba(255, 255, 255, 0.92);
        font-size: 11px;
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.22);
      }
      .item-name {
        min-width: 0;
        flex: 1;
      }
      .add {
        color: var(--mmx-text-3);
        opacity: 0;
        font-size: 17px;
      }
      .item:hover .add {
        opacity: 1;
      }
      .label {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .meta {
        font-family: var(--mmx-mono);
        font-size: 10px;
        color: #6b7488;
      }
      .item.active .meta {
        color: #93c5fd;
      }
      .empty {
        padding: 14px 12px;
        color: #6b7488;
        font-size: 12px;
      }
    `,
  ],
})
export class LeftSidebarComponent {
  readonly service = inject(EditorService);
  readonly tab = signal<SidebarTab>("palette");
  readonly query = signal("");

  readonly grouped = computed<PaletteGroup[]>(() => {
    const q = this.query().trim().toLowerCase();
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      defs: OBJECT_DEFINITIONS.filter(
        (d) =>
          d.category === category &&
          (!q || d.name.toLowerCase().includes(q) || d.category.includes(q)),
      ),
    })).filter((g) => g.defs.length > 0);
  });

  readonly sceneItems = computed<SceneItem[]>(() =>
    this.service.state().document.objects.map((inst) => ({
      inst,
      def: requireDefinition(inst.definitionId),
    })),
  );

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  isPaletteActive(definitionId: string): boolean {
    const s = this.service.state();
    return s.activeTool === "place" && s.placingDefinitionId === definitionId;
  }

  isSelected(id: string): boolean {
    return this.service.state().selectedIds.includes(id);
  }
}
