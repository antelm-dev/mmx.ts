import { TerrainTile, type LevelDocument } from "@mmx/content-schema";

/** The strip's fixed height; its width follows the level's aspect within the bounds below. */
export const MINIMAP_HEIGHT = 56;
const MIN_WIDTH = 56;
// Narrow enough to sit beside the hint bar in the default 1280 px layout.
const MAX_WIDTH = 128;

/** RGBA of a non-empty terrain cell; empty cells stay transparent over the strip's card. */
export const MINIMAP_SOLID: readonly [number, number, number, number] = [0x4a, 0x6d, 0xa0, 255];

/**
 * The strip's size in px and its world-to-strip scale per axis. Long levels are squeezed
 * horizontally rather than shrunk, so the strip keeps its height.
 */
export function minimapLayout(doc: Pick<LevelDocument, "cols" | "rows" | "gridSize">): {
  width: number;
  height: number;
  sx: number;
  sy: number;
} {
  const worldW = doc.cols * doc.gridSize;
  const worldH = doc.rows * doc.gridSize;
  const width = Math.round(
    Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, (MINIMAP_HEIGHT * worldW) / worldH)),
  );
  return { width, height: MINIMAP_HEIGHT, sx: width / worldW, sy: MINIMAP_HEIGHT / worldH };
}

/** One RGBA pixel per cell (row-major, like `doc.tiles`), for `putImageData`. */
export function terrainPixels(
  doc: Pick<LevelDocument, "cols" | "rows" | "tiles">,
): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(doc.cols * doc.rows * 4);
  for (let i = 0; i < doc.cols * doc.rows; i++) {
    if ((doc.tiles[i] ?? TerrainTile.Empty) !== TerrainTile.Empty) px.set(MINIMAP_SOLID, i * 4);
  }
  return px;
}

/** The current view as a rectangle in strip px, from the store's view and the view size in px. */
export function minimapViewRect(
  layout: { sx: number; sy: number },
  zoom: number,
  viewportPosition: { x: number; y: number },
  viewSize: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  return {
    x: viewportPosition.x * layout.sx,
    y: viewportPosition.y * layout.sy,
    w: (viewSize.w / zoom) * layout.sx,
    h: (viewSize.h / zoom) * layout.sy,
  };
}
