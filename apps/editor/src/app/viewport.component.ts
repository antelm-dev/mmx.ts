import { AfterViewInit, Component, ElementRef, ViewChild, inject } from "@angular/core";
import { EditorService } from "./editor.service.js";

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
        <div class="viewport-hint">Scroll: zoom · Middle / Space-drag: pan · Del: remove</div>
      }
      @if (mode() === "play") {
        <div class="play-banner">
          ● Play mode — WASD / Arrows move · Space jump · X dash · C fire · Esc to stop
        </div>
      }
    </div>
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
        left: 12px;
        bottom: 12px;
        color: #6b7488;
        background: rgba(10, 13, 20, 0.7);
        border: 1px solid #2a3140;
        border-radius: 6px;
        padding: 5px 9px;
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
    `,
  ],
})
export class ViewportComponent implements AfterViewInit {
  private readonly service = inject(EditorService);
  readonly mode = this.service.mode;

  @ViewChild("host", { static: true }) host!: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    void this.service.attachViewport(this.host.nativeElement);
  }
}
