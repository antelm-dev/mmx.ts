import { Component, computed, inject, signal } from "@angular/core";
import { MatListModule } from "@angular/material/list";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { EditorService } from "./editor.service.js";

interface PaletteGroup {
  category: string;
  label: string;
  defs: GameObjectDefinition[];
}

/** Left panel: level list on top, searchable object palette below. */
@Component({
  selector: "mmx-left-sidebar",
  imports: [MatListModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="panel">
      <div class="section">
        <div class="section-title">Levels</div>
        <mat-nav-list dense>
          @for (level of service.levels; track level.key) {
            <a
              mat-list-item
              [class.active]="service.activeLevel() === level.key"
              (click)="service.openBuiltin(level.key)"
            >
              <span matListItemTitle>▸ {{ level.name }}</span>
            </a>
          }
        </mat-nav-list>
      </div>

      <div class="section grow">
        <div class="section-title">Object Palette</div>
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
                [class.active]="isActive(def.id)"
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
      </div>
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
      .section {
        border-bottom: 1px solid #232a38;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .section.grow {
        flex: 1;
      }
      .section-title {
        text-transform: uppercase;
        letter-spacing: 0.6px;
        font-size: 10.5px;
        font-weight: 600;
        color: #6b7488;
        padding: 9px 12px 5px;
      }
      .search {
        margin: 0 10px 4px;
        width: calc(100% - 20px);
        font-size: 12px;
      }
      .scroll {
        overflow-y: auto;
        min-height: 0;
        flex: 1;
      }
      a.active {
        background: #1c2c4a !important;
        color: #cfe0ff;
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

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  isActive(definitionId: string): boolean {
    const s = this.service.state();
    return s.activeTool === "place" && s.placingDefinitionId === definitionId;
  }
}
