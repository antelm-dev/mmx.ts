import { describe, expect, it } from "vitest";
import { createLevelDocument, type LevelDocument, setCatalogGameData } from "@mmx/content-schema";
import { validateLevelDocument } from "@mmx/editor-runtime/adapters";
import { decorationBounds } from "@mmx/renderer-pixi";
import { problemAnchors, problemTarget } from "./problemAnchors.js";
import { MMX_GAME_DATA } from "./mmx.test-support.js";

// An MMX project's catalog: these tests place its objects.
setCatalogGameData(MMX_GAME_DATA);

function level(): LevelDocument {
  const doc = createLevelDocument();
  return {
    ...doc,
    objects: [
      ...doc.objects,
      { id: "metool.oob", definitionId: "enemy.metool", x: doc.cols * doc.gridSize + 200, y: 32 },
    ],
    decorations: [
      { id: "deco-1", assetId: "prop.life-capsule", x: 40, y: 50, layer: "foreground" },
    ],
    tileLayers: [
      { id: "tiles-1", tilesetId: "tileset.ground", layer: "background", parallax: 1, cells: [] },
    ],
    imageLayers: [
      { id: "image-1", assetId: "img.sky", layer: "background", x: 8, y: 12, parallax: 1 },
    ],
  };
}

describe("problem anchors", () => {
  it("anchors an out-of-bounds enemy at its top-right corner as an error", () => {
    const doc = level();
    const { issues } = validateLevelDocument(doc);
    const anchor = problemAnchors(doc, issues).find((a) => a.key === "object:metool.oob");
    expect(anchor?.severity).toBe("error");
    expect(anchor?.issues.map((i) => i.code)).toContain("object.out-of-bounds");
    const metool = doc.objects.find((o) => o.id === "metool.oob")!;
    expect(anchor?.target.x).toBeGreaterThan(metool.x);
    expect(anchor?.target.y).toBe(metool.y);
  });

  it("resolves decorations, tile layers and image layers, then the engine position", () => {
    const doc = level();
    const box = decorationBounds(doc.decorations[0]!)!;
    expect(problemTarget(doc, { objectId: "deco-1" })).toEqual({
      kind: "decoration",
      id: "deco-1",
      x: box.x + box.w,
      y: box.y,
    });
    expect(problemTarget(doc, { objectId: "tiles-1" })).toEqual({
      kind: "tileLayer",
      id: "tiles-1",
      x: doc.cols * doc.gridSize,
      y: 0,
    });
    expect(problemTarget(doc, { objectId: "image-1" })).toMatchObject({ kind: "imageLayer", x: 8 });
    expect(problemTarget(doc, { objectId: "gone", position: { x: 3, y: 4 } })).toEqual({
      kind: "position",
      x: 3,
      y: 4,
    });
  });

  it("skips unanchored and non-finite issues, and groups one badge per target", () => {
    const doc = level();
    const anchors = problemAnchors(doc, [
      { severity: "error", code: "spawn.count", message: "No spawn" },
      { severity: "error", code: "x", message: "NaN", position: { x: Number.NaN, y: 0 } },
      { severity: "warning", code: "a", message: "first", objectId: "deco-1" },
      { severity: "error", code: "b", message: "second", objectId: "deco-1" },
      { severity: "warning", code: "c", message: "third", objectId: "tiles-1" },
    ]);
    expect(anchors.map((a) => [a.key, a.severity, a.issues.length])).toEqual([
      ["decoration:deco-1", "error", 2],
      ["tileLayer:tiles-1", "warning", 1],
    ]);
  });
});
