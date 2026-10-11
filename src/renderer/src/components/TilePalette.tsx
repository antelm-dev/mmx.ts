import { chakra } from "@chakra-ui/react";
import { TerrainTile } from "@mmx/content-schema";
import type { TilesetAsset } from "@mmx/project-schema";
import { tileGrid } from "../core/EditorViewportGeometry.js";

/** Collision mark drawn in a palette tile's corner. */
const GLYPH: Partial<Record<number, string>> = {
  [TerrainTile.Solid]: "■",
  [TerrainTile.OneWay]: "=",
  [TerrainTile.SlopeUpRight]: "/",
  [TerrainTile.SlopeUpLeft]: "\\",
};

/** The tileset image cut into tile buttons; each shows its collision and whether it is selected. */
export function TilePalette({
  tileset,
  image,
  selected,
  onPick,
}: {
  tileset: TilesetAsset;
  image: { url: string; w: number; h: number };
  selected: readonly number[];
  /** `additive`: Shift/Ctrl/Cmd-click toggles the tile in a multi-selection. */
  onPick: (tile: number, additive: boolean) => void;
}) {
  const { columns, rows } = tileGrid(tileset, image);
  // Whole-pixel zoom that fits the dock width.
  const scale = Math.max(1, Math.floor(240 / Math.max(1, columns * tileset.tileSize)));
  const cell = tileset.tileSize * scale;
  return (
    <chakra.div
      position="relative"
      w={`${columns * cell}px`}
      h={`${rows * cell}px`}
      maxW="full"
      overflow="auto"
      boxSizing="content-box"
      border="1px solid"
      borderColor="studio.border"
      bg="studio.raised"
      data-testid="tile-palette"
    >
      <chakra.img
        src={image.url}
        alt=""
        draggable={false}
        position="absolute"
        top="0"
        left="0"
        maxW="none"
        w={`${image.w * scale}px`}
        h={`${image.h * scale}px`}
        css={{ imageRendering: "pixelated" }}
      />
      {Array.from({ length: columns * rows }, (_, tile) => {
        const collision = tileset.collision[tile] ?? TerrainTile.Empty;
        const isSelected = selected.includes(tile);
        return (
          <chakra.button
            key={tile}
            type="button"
            aria-label={`Tile ${tile}`}
            aria-pressed={isSelected}
            data-tile={tile}
            data-collision={collision}
            onClick={(e) => onPick(tile, e.shiftKey || e.ctrlKey || e.metaKey)}
            position="absolute"
            left={`${(tile % columns) * cell}px`}
            top={`${Math.floor(tile / columns) * cell}px`}
            w={`${cell}px`}
            h={`${cell}px`}
            p="0"
            cursor="pointer"
            border={isSelected ? "2px solid" : "1px solid"}
            borderColor={isSelected ? "studio.accent" : "rgba(255,255,255,0.12)"}
            bg="transparent"
            display="flex"
            alignItems="flex-start"
            justifyContent="flex-end"
            fontSize="9px"
            lineHeight="1"
            fontWeight="bold"
            color="white"
            textShadow="0 0 2px black"
          >
            {GLYPH[collision]}
          </chakra.button>
        );
      })}
    </chakra.div>
  );
}
