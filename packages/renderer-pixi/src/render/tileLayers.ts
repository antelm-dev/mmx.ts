import { Container, Sprite } from "pixi.js";
import type { LevelArt, TileLayer } from "@mmx/content-schema";
import { regionTexture, sheetTexture } from "./textures.js";

/**
 * One container of tile sprites for a tile layer: cell `i` sits at whole pixels
 * (col * tileSize, row * tileSize) on the level grid, and empty (-1) cells get no
 * sprite. Null while the tileset sheet, its geometry or the level width is missing.
 */
export function buildTileLayer(layer: TileLayer, art: LevelArt): Container | null {
  const tileset = art.tilesets?.[layer.tilesetId];
  // Sheets are keyed by asset id; build-tools adds every tile layer's tileset to the manifest.
  const sheet = sheetTexture(layer.tilesetId);
  const cols = art.cols;
  if (!tileset || !sheet || !cols) return null;

  const { tileSize } = tileset;
  // Same cap as project validation: a `columns` wider than the sheet cannot add tiles.
  const columns = Math.min(tileset.columns ?? Infinity, Math.floor(sheet.width / tileSize));
  const container = new Container();
  layer.cells.forEach((cell, i) => {
    if (cell < 0) return;
    const region = [
      (cell % columns) * tileSize,
      Math.floor(cell / columns) * tileSize,
      tileSize,
      tileSize,
    ] as const;
    const texture = regionTexture(layer.tilesetId, region);
    if (!texture) return;
    const sprite = new Sprite(texture);
    sprite.position.set((i % cols) * tileSize, Math.floor(i / cols) * tileSize);
    container.addChild(sprite);
  });
  return container;
}

export function tileSignatureOf(art: LevelArt): string {
  return (art.tileLayers ?? [])
    .map((l) => {
      const t = art.tilesets?.[l.tilesetId];
      return `${l.id}|${l.tilesetId}|${l.layer}|${l.parallax}|${t?.tileSize}|${t?.columns}|${l.cells.join(",")}`;
    })
    .join(";")
    .concat(`|cols=${art.cols}`);
}
