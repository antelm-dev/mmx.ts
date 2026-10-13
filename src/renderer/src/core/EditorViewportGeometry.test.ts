import { describe, it, expect } from "vitest";
import {
  normalizeBox,
  boxesIntersect,
  handlePos,
  handleHitTest,
  tileIndexAt,
  tilesIntersecting,
  clampTileDelta,
  hexToNum,
  cellRect,
  floodFill,
  type Box,
  type Handle,
  HANDLES,
  dragTravel,
  environmentGeometry,
  travelEditable,
  travelGrip,
  travelTarget,
  travelsVertically,
} from "./EditorViewportGeometry.js";
import { setProjectDefinitions, type LevelObjectInstance } from "@mmx/content-schema";

describe("normalizeBox", () => {
  it("returns same box when already normalized", () => {
    expect(normalizeBox(0, 0, 10, 20)).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  });

  it("normalizes when second corner is before first", () => {
    expect(normalizeBox(10, 20, 0, 0)).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  });

  it("handles zero-size box", () => {
    expect(normalizeBox(5, 5, 5, 5)).toEqual({ x: 5, y: 5, w: 0, h: 0 });
  });

  it("handles negative coordinates", () => {
    expect(normalizeBox(-5, -5, 5, 5)).toEqual({ x: -5, y: -5, w: 10, h: 10 });
  });
});

describe("boxesIntersect", () => {
  const a: Box = { x: 0, y: 0, w: 10, h: 10 };

  it("returns true for overlapping boxes", () => {
    expect(boxesIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it("returns false for non-overlapping boxes (right)", () => {
    expect(boxesIntersect(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it("returns false for non-overlapping boxes (below)", () => {
    expect(boxesIntersect(a, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
  });

  it("returns true when one box contains another", () => {
    expect(boxesIntersect(a, { x: 2, y: 2, w: 4, h: 4 })).toBe(true);
  });

  it("returns false for adjacent (edge-touching) boxes", () => {
    expect(boxesIntersect(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });

  it("returns true for partial left overlap", () => {
    expect(boxesIntersect(a, { x: -5, y: 0, w: 10, h: 10 })).toBe(true);
  });
});

describe("handlePos", () => {
  const b: Box = { x: 0, y: 0, w: 100, h: 50 };

  it("nw returns top-left corner", () => {
    expect(handlePos(b, "nw")).toEqual({ x: 0, y: 0 });
  });

  it("se returns bottom-right corner", () => {
    expect(handlePos(b, "se")).toEqual({ x: 100, y: 50 });
  });

  it("n returns top-center", () => {
    expect(handlePos(b, "n")).toEqual({ x: 50, y: 0 });
  });

  it("s returns bottom-center", () => {
    expect(handlePos(b, "s")).toEqual({ x: 50, y: 50 });
  });

  it("e returns right-middle", () => {
    expect(handlePos(b, "e")).toEqual({ x: 100, y: 25 });
  });

  it("w returns left-middle", () => {
    expect(handlePos(b, "w")).toEqual({ x: 0, y: 25 });
  });

  it("ne returns top-right corner", () => {
    expect(handlePos(b, "ne")).toEqual({ x: 100, y: 0 });
  });

  it("sw returns bottom-left corner", () => {
    expect(handlePos(b, "sw")).toEqual({ x: 0, y: 50 });
  });

  it("covers all HANDLES members", () => {
    for (const h of HANDLES) {
      const p = handlePos(b, h);
      expect(p).toBeDefined();
      expect(typeof p.x).toBe("number");
      expect(typeof p.y).toBe("number");
    }
  });
});

describe("handleHitTest", () => {
  // Box at world (100,100) size 200x100, zoom=1, viewport at (0,0)
  const b: Box = { x: 100, y: 100, w: 200, h: 100 };
  const rect = { left: 0, top: 0 } as DOMRect;
  const zoom = 1;
  const vpX = 0;
  const vpY = 0;

  it("hits the nw handle exactly", () => {
    // nw is at world (100,100) => screen (100,100)
    expect(handleHitTest(b, 100, 100, rect, zoom, vpX, vpY)).toBe("nw");
  });

  it("hits the se handle exactly", () => {
    // se is at world (300,200) => screen (300,200)
    expect(handleHitTest(b, 300, 200, rect, zoom, vpX, vpY)).toBe("se");
  });

  it("misses when point is far away", () => {
    expect(handleHitTest(b, 0, 0, rect, zoom, vpX, vpY)).toBeNull();
  });

  it("hits within tolerance (HANDLE_HIT_PX pixels)", () => {
    // nw at screen (100,100), hit at (106,106) — within 7px
    expect(handleHitTest(b, 106, 106, rect, zoom, vpX, vpY)).toBe("nw");
  });

  it("misses just outside tolerance", () => {
    // nw at screen (100,100), hit at (108,108) — just outside 7px
    expect(handleHitTest(b, 108, 108, rect, zoom, vpX, vpY)).toBeNull();
  });

  it("accounts for zoom", () => {
    // zoom=2: nw at world(100,100) => screen(200,200)
    expect(handleHitTest(b, 200, 200, rect, 2, vpX, vpY)).toBe("nw");
  });

  it("accounts for viewport offset", () => {
    // viewport at (50,50), zoom=1: nw at world(100,100) => screen(50,50)
    expect(handleHitTest(b, 50, 50, rect, 1, 50, 50)).toBe("nw");
  });
});

describe("tileIndexAt", () => {
  const cols = 10;
  const rows = 10;
  const gs = 32;

  it("returns correct index for center of tile", () => {
    expect(tileIndexAt(48, 48, cols, rows, gs)).toBe(1 * cols + 1); // col=1, row=1
  });

  it("returns null for out-of-bounds left", () => {
    expect(tileIndexAt(-1, 0, cols, rows, gs)).toBeNull();
  });

  it("returns null for out-of-bounds top", () => {
    expect(tileIndexAt(0, -1, cols, rows, gs)).toBeNull();
  });

  it("returns null for out-of-bounds right", () => {
    expect(tileIndexAt(cols * gs, 0, cols, rows, gs)).toBeNull();
  });

  it("returns null for out-of-bounds bottom", () => {
    expect(tileIndexAt(0, rows * gs, cols, rows, gs)).toBeNull();
  });

  it("returns 0 for top-left cell", () => {
    expect(tileIndexAt(0, 0, cols, rows, gs)).toBe(0);
  });

  it("returns last index for bottom-right cell center", () => {
    expect(tileIndexAt(9 * gs + gs / 2, 9 * gs + gs / 2, cols, rows, gs)).toBe(99);
  });
});

describe("tilesIntersecting", () => {
  const cols = 5;
  const rows = 5;
  const gs = 32;
  // All tiles solid.
  const allSolid = (): boolean => true;
  const noneSolid = (): boolean => false;

  it("returns tile indices for a box covering one tile", () => {
    const box: Box = { x: 0, y: 0, w: 16, h: 16 };
    expect(tilesIntersecting(box, cols, rows, gs, allSolid)).toEqual([0]);
  });

  it("returns multiple tiles for a wider box", () => {
    const box: Box = { x: 0, y: 0, w: gs * 2, h: gs };
    const result = tilesIntersecting(box, cols, rows, gs, allSolid);
    expect(result).toContain(0);
    expect(result).toContain(1);
    expect(result.length).toBe(2);
  });

  it("returns empty array when no solid tiles", () => {
    const box: Box = { x: 0, y: 0, w: gs * 3, h: gs * 3 };
    expect(tilesIntersecting(box, cols, rows, gs, noneSolid)).toEqual([]);
  });

  it("returns empty array for box completely outside grid", () => {
    const box: Box = { x: -100, y: -100, w: 10, h: 10 };
    expect(tilesIntersecting(box, cols, rows, gs, allSolid)).toEqual([]);
  });

  it("respects isSolid predicate", () => {
    // Only tile at index 0 is solid.
    const box: Box = { x: 0, y: 0, w: gs * 2, h: gs };
    const result = tilesIntersecting(box, cols, rows, gs, (i) => i === 0);
    expect(result).toEqual([0]);
  });
});

describe("clampTileDelta", () => {
  const cols = 10;
  const rows = 10;

  it("returns the delta unchanged when within bounds", () => {
    expect(clampTileDelta([11], cols, rows, 3, 3)).toEqual({ dCol: 3, dRow: 3 });
  });

  it("clamps negative delta at left/top boundary", () => {
    // tile at col=0, row=0 — cannot move left or up
    expect(clampTileDelta([0], cols, rows, -5, -5)).toEqual({ dCol: 0, dRow: 0 });
  });

  it("clamps positive delta at right/bottom boundary", () => {
    // tile at col=9, row=9 — cannot move right or down
    expect(clampTileDelta([99], cols, rows, 5, 5)).toEqual({ dCol: 0, dRow: 0 });
  });

  it("allows maximum shift within bounds for left tile", () => {
    // tile at col=0 — can shift right by up to (cols-1)
    expect(clampTileDelta([0], cols, rows, 9, 0)).toEqual({ dCol: 9, dRow: 0 });
    expect(clampTileDelta([0], cols, rows, 10, 0)).toEqual({ dCol: 9, dRow: 0 });
  });

  it("respects the most constrained tile in a multi-tile selection", () => {
    // tiles at col=0 and col=5 — left-most at 0 prevents any leftward shift
    expect(clampTileDelta([0, 5], cols, rows, -3, 0)).toEqual({ dCol: 0, dRow: 0 });
  });
});

describe("hexToNum", () => {
  it("converts a hex color string without #", () => {
    expect(hexToNum("ff0000")).toBe(0xff0000);
  });

  it("converts a hex color string with #", () => {
    expect(hexToNum("#4c8dff")).toBe(0x4c8dff);
  });

  it("handles 000000", () => {
    expect(hexToNum("#000000")).toBe(0);
  });
});

describe("cellRect", () => {
  it("spans the rectangle between two corners in either order", () => {
    expect(cellRect(4, 9, 0)).toEqual([0, 1, 4, 5, 8, 9]);
    expect(cellRect(4, 3, 3)).toEqual([3]);
  });
});

describe("floodFill", () => {
  it("fills the 4-connected region of the start value without wrapping rows", () => {
    // 3 cols: column 2 is a wall of 1s; the fill from 0 stays left of it.
    const cells = [-1, -1, 1, -1, 1, 1, -1, -1, 1];
    expect(floodFill(cells, 3, 0).sort((a, b) => a - b)).toEqual([0, 1, 3, 6, 7]);
    expect(floodFill(cells, 3, 2).sort((a, b) => a - b)).toEqual([2, 4, 5, 8]);
  });
});

describe("environment travel gizmo", () => {
  const platform = (overrides?: Record<string, unknown>): LevelObjectInstance => ({
    id: "p",
    definitionId: "platform.moving",
    x: 32,
    y: 64,
    width: 48,
    height: 8,
    overrides,
  });

  it("maps a horizontal moving platform's travel end rect to a grip at its centre", () => {
    const geometry = environmentGeometry(platform({ Travel: 80 }));
    expect(geometry.map((p) => p.kind)).toEqual(["line", "rect"]);
    expect(travelGrip(geometry)).toEqual({ x: 32 + 80 + 24, y: 64 + 4 });
  });

  it("puts the grip below the platform when it travels vertically", () => {
    const geometry = environmentGeometry(platform({ Travel: 40, Axis: "vertical" }));
    expect(travelGrip(geometry)).toEqual({ x: 32 + 24, y: 64 + 40 + 4 });
  });

  it("uses the definition's default Travel and the box it is drawn at", () => {
    const grip = travelGrip(environmentGeometry(platform(), { x: 0, y: 0, w: 16, h: 16 }));
    expect(grip).toEqual({ x: 96 + 8, y: 8 });
  });

  it("draws nothing for a falling platform, a non-environment or an unknown definition", () => {
    const at = { x: 0, y: 0 };
    expect(environmentGeometry({ id: "f", definitionId: "platform.falling", ...at, width: 32, height: 8 })).toEqual([]);
    expect(environmentGeometry({ id: "e", definitionId: "enemy.metool", ...at })).toEqual([]);
    expect(environmentGeometry({ id: "m", definitionId: "obj.removed", ...at })).toEqual([]);
  });

  it("offers a grip only for a single selected travelling object", () => {
    const p = platform();
    const other: LevelObjectInstance = { id: "e", definitionId: "enemy.metool", x: 0, y: 0 };
    expect(travelTarget([p, other], ["p"])?.inst).toBe(p);
    expect(travelTarget([p, other], ["p", "e"])).toBeNull();
    expect(travelTarget([p, other], ["e"])).toBeNull();
    expect(travelTarget([platform({ Travel: 0 })], ["p"])).toBeNull();
  });

  it("draws the path but offers no grip when a project object fixes Travel", () => {
    setProjectDefinitions([
      { id: "obj.fixed", name: "Fixed", base: "platform.moving", values: { Travel: 64 }, exposed: ["Speed"] },
    ]);
    try {
      const fixed: LevelObjectInstance = { ...platform(), definitionId: "obj.fixed" };
      expect(environmentGeometry(fixed).map((p) => p.kind)).toEqual(["line", "rect"]);
      expect(travelEditable(fixed)).toBe(false);
      expect(travelTarget([fixed], ["p"])).toBeNull();
      expect(travelEditable(platform())).toBe(true);
    } finally {
      setProjectDefinitions([]);
    }
  });

  it("reads the instance's Axis", () => {
    expect(travelsVertically(platform())).toBe(false);
    expect(travelsVertically(platform({ Axis: "vertical" }))).toBe(true);
  });
});

describe("dragTravel", () => {
  const snap16 = (v: number) => Math.round(v / 16) * 16;
  const noSnap = (v: number) => v;

  it("follows the pointer along the horizontal axis only", () => {
    expect(dragTravel(96, 30, 200, false, noSnap)).toBe(126);
  });

  it("follows the pointer along the vertical axis only", () => {
    expect(dragTravel(96, 200, -30, true, noSnap)).toBe(66);
  });

  it("snaps the travel to the grid", () => {
    expect(dragTravel(96, 21, 0, false, snap16)).toBe(112);
    expect(dragTravel(96, 0, 7, true, snap16)).toBe(96);
  });

  it("never goes below zero", () => {
    expect(dragTravel(96, -500, 0, false, snap16)).toBe(0);
    expect(dragTravel(96, 0, -500, true, noSnap)).toBe(0);
  });
});
