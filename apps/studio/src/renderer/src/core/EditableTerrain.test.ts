import { describe, expect, it } from "vitest";
import { TerrainTile } from "@mmx/content-schema";
import { EditableTerrain } from "./EditableTerrain.js";

describe("EditableTerrain", () => {
  it("reads tiles in row-major order", () => {
    const terrain = new EditableTerrain({
      cols: 3,
      rows: 2,
      gridSize: 16,
      tiles: [
        TerrainTile.Empty,
        TerrainTile.Solid,
        TerrainTile.SlopeUpRight,
        TerrainTile.SlopeUpLeft,
        TerrainTile.Empty,
        TerrainTile.Solid,
      ],
    });
    expect(terrain.tileAt(0, 0)).toBe(TerrainTile.Empty);
    expect(terrain.tileAt(1, 0)).toBe(TerrainTile.Solid);
    expect(terrain.tileAt(2, 0)).toBe(TerrainTile.SlopeUpRight);
    expect(terrain.tileAt(0, 1)).toBe(TerrainTile.SlopeUpLeft);
    expect(terrain.tileAt(2, 1)).toBe(TerrainTile.Solid);
  });

  it("returns Empty for out-of-bounds cells", () => {
    const terrain = new EditableTerrain({
      cols: 2,
      rows: 2,
      gridSize: 16,
      tiles: [TerrainTile.Solid, TerrainTile.Solid, TerrainTile.Solid, TerrainTile.Solid],
    });
    expect(terrain.tileAt(-1, 0)).toBe(TerrainTile.Empty);
    expect(terrain.tileAt(0, -1)).toBe(TerrainTile.Empty);
    expect(terrain.tileAt(2, 0)).toBe(TerrainTile.Empty);
    expect(terrain.tileAt(0, 2)).toBe(TerrainTile.Empty);
  });

  it("prefers an explicit slope profile from the document", () => {
    const terrain = new EditableTerrain({
      cols: 2,
      rows: 1,
      gridSize: 16,
      tiles: [TerrainTile.SlopeUpRight, TerrainTile.Empty],
      slopes: { 0: [2, 10] },
    });
    expect(terrain.slopeProfile(0, 0, TerrainTile.SlopeUpRight)).toEqual({ l: 2, r: 10 });
  });

  it("defaults SlopeUpRight to a full rise using gridSize", () => {
    const terrain = new EditableTerrain({
      cols: 1,
      rows: 1,
      gridSize: 24,
      tiles: [TerrainTile.SlopeUpRight],
    });
    expect(terrain.slopeProfile(0, 0, TerrainTile.SlopeUpRight)).toEqual({ l: 0, r: 24 });
  });

  it("defaults SlopeUpLeft to a full rise using gridSize", () => {
    const terrain = new EditableTerrain({
      cols: 1,
      rows: 1,
      gridSize: 24,
      tiles: [TerrainTile.SlopeUpLeft],
    });
    expect(terrain.slopeProfile(0, 0, TerrainTile.SlopeUpLeft)).toEqual({ l: 24, r: 0 });
  });
});
