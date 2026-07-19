import type { TextStyleOptions } from "pixi.js";
import uiFontUrl from "../../../../resources/fonts/mega-man-x.ttf";

/**
 * The UI typeface: Mega Man X (resources/fonts/mega-man-x.ttf).
 *
 * One module because the face is not a free choice of family name — it carries
 * hard metric constraints that every caller has to respect, and duplicating them
 * at each `new Text` is how a UI ends up with half its labels off the pixel grid.
 *
 * The file is a 6x6 pixel face drawn on a 1024-unit em: ink is 768 units (6px)
 * wide and tall with a 1px descender, and *every* glyph advances a full em. All
 * outline points sit on a 128-unit (1px) grid, so the face is only pixel-exact at
 * whole multiples of 8px — anything else lands glyph edges mid-pixel and the
 * rasteriser smears them. Hence {@link UI_FONT_SIZE}, which is not a taste knob.
 *
 * Coverage is 91 codepoints: ASCII less `% @ \ { } | ~`, plus the yen, copyright
 * and down-arrow. Uncovered characters fall through to the monospace fallback in
 * {@link UI_FONT_FAMILY} and will visibly not match, so prefer wording that stays
 * inside the face over relying on the fallback.
 */

/** Family name as it appears in the font's name table, for `document.fonts`. */
const UI_FONT_NAME = "Mega Man X";

/** Family stack for CSS and Pixi. The fallback only ever draws missing glyphs. */
export const UI_FONT_FAMILY = `"${UI_FONT_NAME}", monospace`;

/** The face's own pixel size. See the note above: multiples of 8 only. */
export const UI_FONT_SIZE = 8;

/**
 * Tightens the full-em advance to a 7px pitch.
 *
 * 6px of ink in an 8px em leaves a 2px gutter between glyphs, which reads as
 * loosely spaced at this size — the SNES HUDs this apes sit at 1px. Pulling one
 * whole pixel back keeps the pitch an integer, so glyphs stay on the grid.
 */
export const UI_LETTER_SPACING = -1;

/** Advance of one character, in view pixels. Use it to budget label widths. */
export const UI_CHAR_W = UI_FONT_SIZE + UI_LETTER_SPACING;

/** Style for a line of UI text. Every `new Text` in the game UI should use it. */
export function uiTextStyle(fill: number): TextStyleOptions {
  return {
    fontFamily: UI_FONT_FAMILY,
    fontSize: UI_FONT_SIZE,
    letterSpacing: UI_LETTER_SPACING,
    fill,
  };
}

/**
 * Wait for the face to be usable before anything rasterises text.
 *
 * Pixi draws Text through the canvas 2D context, which silently substitutes the
 * fallback for a face the document has not loaded yet and caches the result as a
 * texture — a label built one frame too early stays monospace for the rest of the
 * session. Awaiting this during boot, before the first render, is what stops that.
 *
 * A failure here is cosmetic, so it warns rather than throwing: the menu is still
 * navigable in the fallback face, and refusing to boot the game over a font would
 * be a worse trade.
 */
export async function loadUiFont(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    const face = new FontFace(UI_FONT_NAME, `url(${JSON.stringify(uiFontUrl)})`);
    document.fonts.add(face);
    await face.load();
  } catch (error) {
    console.warn("Could not load the UI font; falling back to monospace", error);
  }
}
