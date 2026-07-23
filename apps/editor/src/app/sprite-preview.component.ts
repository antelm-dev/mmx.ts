import { Component, computed, input } from "@angular/core";
import { previewForDefinition, type SpritePreview } from "../assets/spritePreview.js";

@Component({
  selector: "mmx-sprite-preview",
  template: `
    @if (preview(); as p) {
      <span
        class="frame"
        [class.flip]="flip()"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [title]="definitionId()"
      >
        <span
          class="crop"
          [style.width.px]="p.region[2]"
          [style.height.px]="p.region[3]"
          [style.transform]="cropScale(p)"
        >
          <img
            [src]="p.url"
            [style.left.px]="-p.region[0]"
            [style.top.px]="-p.region[1]"
            alt=""
            draggable="false"
          />
        </span>
      </span>
    } @else if (fallbackColor(); as color) {
      <span
        class="swatch"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [style.background]="color"
      ></span>
    }
  `,
  styles: [
    `
      .frame {
        display: grid;
        place-items: center;
        flex: none;
        overflow: hidden;
        border-radius: 6px;
        background: var(--mmx-surface-raised);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
      }
      .frame.flip {
        transform: scaleX(-1);
      }
      .crop {
        position: relative;
        overflow: hidden;
        flex: none;
        image-rendering: pixelated;
      }
      .crop img {
        position: absolute;
        max-width: none;
        image-rendering: pixelated;
        pointer-events: none;
      }
      .swatch {
        display: block;
        flex: none;
        border-radius: 6px;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
      }
    `,
  ],
})
export class SpritePreviewComponent {
  readonly definitionId = input.required<string>();
  readonly size = input(48);
  readonly flip = input(false);
  readonly fallbackColor = input<string | null>(null);

  readonly preview = computed(() => previewForDefinition(this.definitionId()));

  cropScale(p: SpritePreview): string {
    const box = this.size();
    const [, , w, h] = p.region;
    const s = Math.min(box / w, box / h);
    return `scale(${s})`;
  }
}
