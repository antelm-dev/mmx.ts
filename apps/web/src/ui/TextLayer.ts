import { Container, Text } from "pixi.js";
import { uiTextStyle } from "./font.js";

/**
 * Bookkeeping shared by every menu screen's labels: build a {@link Text} with
 * the UI face, park it in the screen's container, and keep every label's
 * rasterisation resolution in lockstep with the renderer's integer zoom.
 *
 * Home and Settings used to each carry their own copy of this; factored out
 * because the two copies could only ever drift, never usefully differ.
 */
export class TextLayer {
  readonly texts: Text[] = [];
  private resolution = 1;

  constructor(private readonly container: Container) {}

  add(content: string, x: number, y: number, color: number): Text {
    const text = new Text({ text: content, style: uiTextStyle(color) });
    text.x = x;
    text.y = y;
    text.resolution = this.resolution;
    this.texts.push(text);
    this.container.addChild(text);
    return text;
  }

  /** See {@link SettingsMenu.setPixelScale} for why this matches the zoom. */
  setPixelScale(scale: number): void {
    if (scale === this.resolution || scale <= 0) return;
    this.resolution = scale;
    for (const text of this.texts) text.resolution = scale;
  }
}
