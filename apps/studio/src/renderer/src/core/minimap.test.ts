import { describe, expect, it } from "vitest";
import { TerrainTile } from "@mmx/content-schema";
import {
  MINIMAP_HEIGHT,
  MINIMAP_SOLID,
  minimapLayout,
  minimapViewRect,
  terrainPixels,
} from "./minimap.js";

describe("minimap", () => {
  it("colours every non-empty cell and leaves empty cells transparent", () => {
    const { Empty, Solid, OneWay } = TerrainTile;
    const px = terrainPixels({ cols: 2, rows: 2, tiles: [Solid, Empty, Empty, OneWay] });
    expect([...px.slice(0, 4)]).toEqual([...MINIMAP_SOLID]);
    expect([...px.slice(4, 12)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...px.slice(12, 16)]).toEqual([...MINIMAP_SOLID]);
  });

  it("keeps the height and caps the width of a long level", () => {
    const short = minimapLayout({ cols: 40, rows: 20, gridSize: 16 });
    expect(short).toMatchObject({ width: MINIMAP_HEIGHT * 2, height: MINIMAP_HEIGHT });
    const long = minimapLayout({ cols: 400, rows: 15, gridSize: 16 });
    expect(long.height).toBe(MINIMAP_HEIGHT);
    expect(long.width).toBe(128);
    expect(long.sx * 400 * 16).toBeCloseTo(128);
    expect(long.sy * 15 * 16).toBeCloseTo(MINIMAP_HEIGHT);
  });

  it("maps the view to strip px from the zoom, position and view size", () => {
    const layout = { sx: 0.1, sy: 0.2 };
    const rect = minimapViewRect(layout, 2, { x: 100, y: 50 }, { w: 800, h: 400 });
    expect(rect).toEqual({ x: 10, y: 10, w: 40, h: 40 });
  });
});
