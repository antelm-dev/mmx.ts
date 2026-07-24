import { Component, inject } from "@angular/core";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDividerModule } from "@angular/material/divider";
import { MatMenuModule } from "@angular/material/menu";
import { EditorService } from "./editor.service.js";

@Component({
  selector: "mmx-toolbar",
  imports: [MatToolbarModule, MatButtonModule, MatTooltipModule, MatDividerModule, MatMenuModule],
  template: `
    <mat-toolbar class="bar">
      <div class="left">
        <div class="brand" aria-label="MMX Studio">
          <span>MMX <span class="accent">Studio</span></span>
        </div>

        <div class="group">
          <button
            class="text-action"
            matButton
            (click)="service.importJson()"
            matTooltip="Open a level JSON file"
          >
            Import
          </button>
          <button
            class="text-action save"
            matButton
            (click)="service.save()"
            matTooltip="Download level JSON (Ctrl+S)"
          >
            Save
            @if (service.dirty()) {
              <span class="dirty" aria-label="Unsaved changes"></span>
            }
          </button>
        </div>

        <mat-divider vertical />

        <div class="group">
          <button
            matIconButton
            [disabled]="!service.canUndo() || playing()"
            (click)="service.undo()"
            matTooltip="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <span class="tool-icon">↶</span>
          </button>
          <button
            matIconButton
            [disabled]="!service.canRedo() || playing()"
            (click)="service.redo()"
            matTooltip="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <span class="tool-icon">↷</span>
          </button>
        </div>

        <mat-divider vertical />

        <div class="group">
          <button
            matButton
            [class.active]="service.state().gridVisible"
            (click)="service.toggleGrid()"
            matTooltip="Toggle grid (G)"
          >
            <span class="toggle-dot"></span> Grid
          </button>
          <button
            matButton
            [class.active]="service.state().snapEnabled"
            (click)="service.toggleSnap()"
            matTooltip="Toggle snapping (Shift+G)"
          >
            <span class="toggle-dot"></span> Snap
          </button>
        </div>

        <mat-divider vertical />

        <div class="group zoom">
          <button
            matIconButton
            (click)="service.zoomBy(1 / 1.2)"
            matTooltip="Zoom out"
            aria-label="Zoom out"
          >
            <span class="tool-icon">−</span>
          </button>
          <span class="readout">{{ service.zoomPercent() }}%</span>
          <button
            matIconButton
            (click)="service.zoomBy(1.2)"
            matTooltip="Zoom in"
            aria-label="Zoom in"
          >
            <span class="tool-icon">+</span>
          </button>
          <button matButton (click)="service.fit()" matTooltip="Fit level to view (F)">Fit</button>
        </div>
      </div>

      <div class="center">
        <button
          matButton
          class="level-title"
          [matMenuTriggerFor]="levelsMenu"
          matTooltip="Select level"
        >
          <span class="level-kicker">LEVEL</span>
          <span>{{ service.levelTitle() }}</span>
          <span class="caret">⌄</span>
        </button>
        <mat-menu #levelsMenu="matMenu" panelClass="levels-menu">
          @for (level of service.levels; track level.key) {
            <button
              mat-menu-item
              [class.selected]="service.activeLevel() === level.key"
              (click)="service.openBuiltin(level.key)"
            >
              {{ level.name }}
            </button>
          }
        </mat-menu>
      </div>

      <div class="right">
        <button
          matButton="filled"
          [class.stop]="playing()"
          (click)="service.togglePlay()"
          matTooltip="Play / Stop (Ctrl+Enter)"
        >
          <span class="play-icon">{{ playing() ? "■" : "▶" }}</span>
          {{ playing() ? "Stop" : "Play" }}
        </button>
      </div>
    </mat-toolbar>
  `,
  styles: [
    `
      .bar {
        position: relative;
        z-index: 5;
        height: 56px;
        padding: 0 14px;
        display: flex;
        align-items: center;
        background: linear-gradient(180deg, #151b27 0%, #111722 100%);
        border-bottom: 1px solid var(--mmx-border);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
      }
      .left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .center {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1;
        padding: 0 6px;
        border: 1px solid var(--mmx-border);
        border-radius: 9px;
        background: #121823;
      }
      .right {
        display: flex;
        align-items: center;
        flex: none;
        margin-left: auto;
      }
      .brand {
        margin-right: 10px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.25px;
        flex: none;
      }
      .brand .accent {
        color: #5b9cff;
      }
      .group {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .text-action {
        color: var(--mmx-text-2);
      }
      .save {
        gap: 7px;
      }
      .dirty {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #60a5fa;
        box-shadow: 0 0 8px rgba(96, 165, 250, 0.65);
      }
      .tool-icon {
        font-size: 18px;
        line-height: 1;
      }
      .readout {
        min-width: 42px;
        color: var(--mmx-text-2);
        font-family: var(--mmx-mono);
        font-size: 11px;
        text-align: center;
      }
      .level-title {
        max-width: 280px;
        color: var(--mmx-text);
        font-size: 13px;
        font-weight: 650;
        letter-spacing: 0.2px;
      }
      .level-kicker {
        margin-right: 10px;
        color: var(--mmx-text-3);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.8px;
      }
      .caret {
        margin-left: 2px;
        color: var(--mmx-text-3);
        font-size: 12px;
      }
      button.active {
        background: rgba(59, 130, 246, 0.16);
        color: #d8e7ff;
      }
      .toggle-dot {
        width: 5px;
        height: 5px;
        margin-right: 2px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.38;
      }
      button.active .toggle-dot {
        opacity: 1;
        box-shadow: 0 0 7px currentColor;
      }
      button.stop {
        --mat-sys-primary: #ef4444;
        --mat-sys-on-primary: #ffffff;
        background: #ef4444;
        color: #fff;
      }
      .right button {
        min-width: 88px;
        height: 36px;
        border-radius: 9px;
        font-weight: 700;
        letter-spacing: 0.15px;
        box-shadow: 0 5px 16px rgba(59, 130, 246, 0.22);
      }
      .play-icon {
        margin-right: 3px;
        font-size: 10px;
      }
      mat-divider[vertical] {
        height: 24px;
        margin: 0 2px;
      }
      @media (max-width: 1320px) {
        .zoom {
          display: none;
        }
      }
      @media (max-width: 1050px) {
        .level-kicker {
          display: none;
        }
        .center {
          left: 58%;
        }
      }
    `,
  ],
})
export class ToolbarComponent {
  readonly service = inject(EditorService);
  readonly playing = () => this.service.mode() === "play";
}
