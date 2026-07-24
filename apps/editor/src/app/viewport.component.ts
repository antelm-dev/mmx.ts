import { AfterViewInit, Component, ElementRef, ViewChild, computed, inject } from "@angular/core";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { EditorService } from "./editor.service.js";

interface PlaceGroup {
  category: string;
  label: string;
  defs: GameObjectDefinition[];
}

/**
 * Hosts the Pixi editing surface (and, in Play mode, the game renderer's canvas).
 * The heavy lifting stays in the framework-agnostic {@link EditorViewport} /
 * {@link PlaySession}; this component only supplies the host element and draws the
 * two overlay chips reactively from the editor mode.
 */
@Component({
  selector: "mmx-viewport",
  template: `
    <div #host class="viewport-host">
      @if (mode() === "edit") {
        <div class="viewport-hint">
          Scroll: zoom · Middle / Space-drag: pan · Right-click empty: place · Del: remove
        </div>
      }
      @if (mode() === "play") {
        <div class="play-banner">
          ● Play mode — WASD / Arrows move · Space jump · X dash · C fire · Esc to stop
        </div>
      }
    </div>

    @if (menuPos(); as ctx) {
      <div
        class="ctx-backdrop"
        (pointerdown)="onBackdropPointer($event)"
        (contextmenu)="onBackdropContextMenu($event)"
      ></div>
      <div
        class="ctx-menu"
        [style.left.px]="ctx.clientX"
        [style.top.px]="ctx.clientY"
        (pointerdown)="$event.stopPropagation()"
      >
        <div class="ctx-header">Cell {{ ctx.col }}, {{ ctx.row }}</div>
        <div class="ctx-section">Place</div>
        <div class="ctx-scroll">
          @for (group of placeGroups(); track group.category) {
            <div class="ctx-cat">{{ group.label }}</div>
            @for (def of group.defs; track def.id) {
              <button type="button" class="ctx-item" (click)="service.placeAtContext(def.id)">
                <span class="swatch" [style.background]="def.editor.color"></span>
                <span>{{ def.icon }} {{ def.name }}</span>
              </button>
            }
          }
        </div>
        <div class="ctx-sep"></div>
        <button type="button" class="ctx-item" (click)="clearAndClose()">Clear selection</button>
        <button type="button" class="ctx-item" (click)="toggleGrid()">
          {{ service.state().gridVisible ? "Hide grid" : "Show grid" }}
        </button>
        <button type="button" class="ctx-item" (click)="toggleSnap()">
          {{ service.state().snapEnabled ? "Disable snap" : "Enable snap" }}
        </button>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        height: 100%;
        min-height: 0;
        background: #05070d;
      }
      .viewport-host {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      .viewport-hint,
      .play-banner {
        position: absolute;
        z-index: 3;
        font-size: 11px;
        font-family: var(--mmx-mono);
        pointer-events: none;
      }
      .viewport-hint {
        left: 14px;
        bottom: 14px;
        color: #8390a5;
        background: rgba(12, 17, 26, 0.88);
        border: 1px solid rgba(64, 77, 100, 0.72);
        border-radius: 8px;
        padding: 7px 10px;
        box-shadow: 0 5px 18px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(10px);
      }
      .play-banner {
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(76, 141, 255, 0.15);
        border: 1px solid #4c8dff;
        color: #cfe0ff;
        border-radius: 20px;
        padding: 5px 14px;
      }
      .ctx-backdrop {
        position: fixed;
        inset: 0;
        z-index: 40;
      }
      .ctx-menu {
        position: fixed;
        z-index: 41;
        min-width: 200px;
        max-width: 260px;
        max-height: min(420px, calc(100vh - 16px));
        display: flex;
        flex-direction: column;
        background: #12161f;
        border: 1px solid #2a3140;
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
        padding: 6px 0;
        overflow: hidden;
      }
      .ctx-header {
        font-family: var(--mmx-mono);
        font-size: 10px;
        color: #6b7488;
        padding: 4px 12px 6px;
      }
      .ctx-section {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #6b7488;
        padding: 4px 12px 2px;
      }
      .ctx-scroll {
        overflow-y: auto;
        min-height: 0;
        max-height: 260px;
      }
      .ctx-cat {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #6b7488;
        padding: 8px 12px 2px;
      }
      .ctx-item {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        border: none;
        background: transparent;
        color: #aab3c5;
        font: inherit;
        font-size: 12.5px;
        text-align: left;
        padding: 6px 12px;
        cursor: pointer;
      }
      .ctx-item:hover {
        background: #181d29;
        color: #cfe0ff;
      }
      .swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        flex: none;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
      }
      .ctx-sep {
        height: 1px;
        background: #2a3140;
        margin: 4px 0;
      }
    `,
  ],
})
export class ViewportComponent implements AfterViewInit {
  readonly service = inject(EditorService);
  readonly mode = this.service.mode;
  readonly menu = this.service.emptyContextMenu;

  readonly placeGroups = computed<PlaceGroup[]>(() =>
    CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      defs: OBJECT_DEFINITIONS.filter((d) => d.category === category),
    })).filter((g) => g.defs.length > 0),
  );

  readonly menuPos = computed(() => {
    const ctx = this.menu();
    if (!ctx) return null;
    const menuW = 220;
    const menuH = 420;
    return {
      ...ctx,
      clientX: Math.max(8, Math.min(ctx.clientX, window.innerWidth - menuW - 8)),
      clientY: Math.max(
        8,
        Math.min(ctx.clientY, window.innerHeight - Math.min(menuH, window.innerHeight - 16) - 8),
      ),
    };
  });

  @ViewChild("host", { static: true }) host!: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    void this.service.attachViewport(this.host.nativeElement);
  }

  onBackdropPointer(e: PointerEvent): void {
    if (e.button === 2) return;
    this.service.closeEmptyContextMenu();
  }

  onBackdropContextMenu(e: MouseEvent): void {
    e.preventDefault();
    this.service.openEmptyContextMenuAt(e.clientX, e.clientY);
  }

  clearAndClose(): void {
    this.service.store.clearSelection();
    this.service.closeEmptyContextMenu();
  }

  toggleGrid(): void {
    this.service.toggleGrid();
    this.service.closeEmptyContextMenu();
  }

  toggleSnap(): void {
    this.service.toggleSnap();
    this.service.closeEmptyContextMenu();
  }
}
