import { Component, inject } from "@angular/core";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDividerModule } from "@angular/material/divider";
import { EditorService } from "./editor.service.js";

/** Top toolbar: file, history, view toggles, zoom, and Play/Stop. */
@Component({
  selector: "mmx-toolbar",
  imports: [MatToolbarModule, MatButtonModule, MatTooltipModule, MatDividerModule],
  template: `
    <mat-toolbar class="bar">
      <span class="brand">MMX <span class="accent">Studio</span></span>

      <div class="group">
        <button matButton (click)="service.importJson()" matTooltip="Open a level JSON file">
          Import
        </button>
        <button matButton (click)="service.save()" matTooltip="Download level JSON (Ctrl+S)">
          {{ service.dirty() ? "Save •" : "Save" }}
        </button>
      </div>

      <mat-divider vertical />

      <div class="group">
        <button
          matIconButton
          [disabled]="!service.canUndo() || playing()"
          (click)="service.undo()"
          matTooltip="Undo (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          matIconButton
          [disabled]="!service.canRedo() || playing()"
          (click)="service.redo()"
          matTooltip="Redo (Ctrl+Shift+Z)"
        >
          ↷
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
          Grid
        </button>
        <button
          matButton
          [class.active]="service.state().snapEnabled"
          (click)="service.toggleSnap()"
          matTooltip="Toggle snapping (Shift+G)"
        >
          Snap
        </button>
      </div>

      <mat-divider vertical />

      <div class="group">
        <button matIconButton (click)="service.zoomBy(1 / 1.2)" matTooltip="Zoom out">−</button>
        <span class="readout">{{ service.zoomPercent() }}%</span>
        <button matIconButton (click)="service.zoomBy(1.2)" matTooltip="Zoom in">＋</button>
        <button matButton (click)="service.fit()" matTooltip="Fit level to view (F)">Fit</button>
      </div>

      <span class="spacer"></span>

      <button
        matButton="filled"
        [class.stop]="playing()"
        (click)="service.togglePlay()"
        matTooltip="Play / Stop (Ctrl+Enter)"
      >
        {{ playing() ? "■ Stop" : "▶ Play" }}
      </button>
    </mat-toolbar>
  `,
  styles: [
    `
      .bar {
        background: #12161f;
        border-bottom: 1px solid #2a3140;
        gap: 6px;
        height: 52px;
        padding: 0 12px;
      }
      .brand {
        font-weight: 700;
        letter-spacing: 0.5px;
        margin-right: 12px;
        font-size: 15px;
      }
      .brand .accent {
        color: #4c8dff;
      }
      .group {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .spacer {
        flex: 1 1 auto;
      }
      .readout {
        font-family: var(--mmx-mono);
        font-size: 11px;
        color: #6b7488;
        min-width: 46px;
        text-align: center;
      }
      button.active {
        background: #1c2c4a;
        color: #cfe0ff;
      }
      button.stop {
        --mat-sys-primary: #ef4444;
        --mat-sys-on-primary: #ffffff;
        background: #ef4444;
        color: #fff;
      }
      mat-divider[vertical] {
        height: 24px;
        margin: 0 2px;
      }
    `,
  ],
})
export class ToolbarComponent {
  readonly service = inject(EditorService);
  readonly playing = () => this.service.mode() === "play";
}
