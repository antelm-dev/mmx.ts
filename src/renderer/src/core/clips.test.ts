import { describe, expect, it } from "vitest";
import { canDeleteClip, feetAnchor, moveItem, requiredPlayerClips } from "./clips.js";

describe("clips helpers", () => {
  it("anchors the feet at the bottom-centre of the opaque pixels", () => {
    const width = 8;
    const px = new Uint8ClampedArray(width * 8 * 4);
    // Opaque block x 2..4, y 1..5 inside the region [1, 0, 6, 8].
    for (let y = 1; y <= 5; y++) for (let x = 2; x <= 4; x++) px[(y * width + x) * 4 + 3] = 255;
    expect(feetAnchor(px, width, [1, 0, 6, 8])).toEqual([3, 6]);
    expect(feetAnchor(new Uint8ClampedArray(px.length), width, [0, 0, 6, 8])).toEqual([3, 8]);
  });

  it("keeps the last clip of the bound player animation", () => {
    expect(canDeleteClip(1, true)).toBe(false);
    expect(canDeleteClip(2, true)).toBe(true);
    expect(canDeleteClip(1, false)).toBe(true);
  });

  it("moves a frame", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });

  it("lists the clips each loadout plays", () => {
    expect(requiredPlayerClips().sort()).toEqual(
      ["beam", "beam_equip", "beam_in", "damage", "dash", "fall", "idle", "jump", "recover", "slide", "walk", "walk_start", "walljump", "weak"],
    );
    expect(requiredPlayerClips("player.zero")).toEqual(expect.arrayContaining(["walk", "slash_1", "wall_slash"]));
    expect(requiredPlayerClips("player.x")).not.toContain("slash_1");
  });
});
