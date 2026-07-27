import type { TextStyleOptions } from "pixi.js";

const UI_FONT_NAME = "Mega Man X";

export const UI_FONT_FAMILY = `"${UI_FONT_NAME}", monospace`;

export const UI_FONT_SIZE = 8;

export const UI_LETTER_SPACING = -1;

export const UI_CHAR_W = UI_FONT_SIZE + UI_LETTER_SPACING;

export function uiTextStyle(fill: number): TextStyleOptions {
  return {
    fontFamily: UI_FONT_FAMILY,
    fontSize: UI_FONT_SIZE,
    letterSpacing: UI_LETTER_SPACING,
    fill,
  };
}

export async function loadUiFont(fontUrl?: string): Promise<void> {
  if (!fontUrl) return;
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    const face = new FontFace(UI_FONT_NAME, `url(${JSON.stringify(fontUrl)})`);
    document.fonts.add(face);
    await face.load();
  } catch (error) {
    console.warn("Could not load the UI font; falling back to monospace", error);
  }
}
