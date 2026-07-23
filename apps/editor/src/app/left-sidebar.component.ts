import { Component, computed, inject, signal } from "@angular/core";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
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
  imports: [MatFormFieldModule, MatInputModule],
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
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
          <input
            matInput
            placeholder="Search objects…"
            [value]="query()"
            (input)="onSearch($event)"
          />
        </mat-form-field>

        <div class="scroll">
          @for (group of grouped(); track group.category) {
            <div class="cat">{{ group.label }}</div>
            @for (def of group.defs; track def.id) {
              <div
                class="item"
                [class.active]="isPaletteActive(def.id)"
                (click)="service.selectPalette(def.id)"
                [title]="'Place ' + def.name"
              >
                <span class="swatch" [style.background]="def.editor.color"></span>
                <span>{{ def.icon }} {{ def.name }}</span>
              </div>
            }
          }
          @if (grouped().length === 0) {
            <div class="empty">No objects match your search.</div>
          }
        </div>
      } @else {
        <div class="scroll">
          @for (row of sceneItems(); track row.inst.id) {
            <div
              class="item"
              [class.active]="isSelected(row.inst.id)"
              (click)="service.focusObject(row.inst.id)"
              [title]="row.inst.id"
            >
              <span class="swatch" [style.background]="row.def.editor.color"></span>
              <span class="label">
                <span class="name">{{ row.def.icon }} {{ row.def.name }}</span>
                <span class="meta">{{ row.inst.x }}, {{ row.inst.y }}</span>
              </span>
            </div>
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
        background: #12161f;
        border-right: 1px solid #2a3140;
      }
      .tabs {
        display: flex;
        border-bottom: 1px solid #2a3140;
        flex: none;
      }
      .tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 9px 8px;
        border: none;
        background: transparent;
        color: #6b7488;
        font: inherit;
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
      }
      .tab:hover {
        color: #aab3c5;
        background: #181d29;
      }
      .tab.active {
        color: #cfe0ff;
        border-bottom-color: #3b82f6;
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
      .search {
        margin: 8px 10px 4px;
        width: calc(100% - 20px);
        font-size: 12px;
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
        color: #6b7488;
        padding: 8px 12px 3px;
      }
      .item {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 12.5px;
        color: #aab3c5;
      }
      .item:hover {
        background: #181d29;
      }
      .item.active {
        background: #1c2c4a;
        color: #cfe0ff;
      }
      .swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        flex: none;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
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
