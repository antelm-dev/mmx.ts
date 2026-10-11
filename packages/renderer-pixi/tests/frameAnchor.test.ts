import assert from "node:assert/strict";
import { test } from "node:test";
import type { FrameData, Region } from "@mmx/contracts/animation";
import type { Player } from "@mmx/engine";
import { Rectangle, Sprite, Texture, TextureSource } from "pixi.js";
import { place, spriteSnapshot } from "../src/render/sprite.js";
import { Trail } from "../src/Trail.js";

// AC-ANCHOR: a 34x39 frame anchored at (19, 35), and the same pixels repacked into
// a 72x54 cell (implicit anchor), must put the feet on the same screen pixel.
const BODY_HH = 15;
const FRAME_W = 34;
const ANCHORED: FrameData = {
  region: [0, 0, FRAME_W, 39],
  armRegion: [40, 0, FRAME_W, 39],
  duration: 1,
  anchor: [19, 35],
};
// Where the frame sits inside the cell so its anchor lands on the cell's implicit
// registration point: centre column, and SPRITE_OFFSET_Y + body_hh above the bottom.
const CELL_X = 36 - 19;
const CELL_Y = 27 + BODY_HH + 4 - 35;
const CELL: FrameData = {
  region: [0, 100, 72, 54],
  armRegion: [80, 100, 72, 54],
  duration: 1,
};

const sheet = new TextureSource({ width: 256, height: 256 });

function fakePlayer(frame: FrameData, facing: number, layer: string): Player {
  const current = (): Region =>
    layer === "pointing_cannon" && frame.armRegion ? frame.armRegion : frame.region;
  return {
    pos: { x: 100.25, y: 50 },
    hh: BODY_HH,
    body_hh: BODY_HH,
    anim: { currentFrame: () => frame },
    currentRegion: current,
    get_sprite_facing: () => facing,
    get_animation_layer: () => layer,
  } as unknown as Player;
}

/** Screen position of a point given in the region's own pixel coordinates. */
function drawnAt(player: Player, u: number, v: number): [number, number] {
  const snap = spriteSnapshot(player)!;
  const [x, y, w, h] = snap.region;
  const sprite = new Sprite();
  place(
    sprite,
    new Texture({ source: sheet, frame: new Rectangle(x, y, w, h) }),
    snap.x,
    snap.y,
    snap.facing,
    false,
    snap.anchor,
  );
  return [
    sprite.position.x + sprite.scale.x * (u - sprite.anchor.x * w),
    sprite.position.y + sprite.scale.y * (v - sprite.anchor.y * h),
  ];
}

for (const layer of ["normal", "pointing_cannon"]) {
  for (const facing of [1, -1]) {
    test(`anchored frame and repacked cell share feet and edges (${layer}, facing ${facing})`, () => {
      const anchored = fakePlayer(ANCHORED, facing, layer);
      const cell = fakePlayer(CELL, facing, layer);
      assert.equal(
        spriteSnapshot(anchored)!.region,
        layer === "normal" ? ANCHORED.region : ANCHORED.armRegion,
      );
      // The anchor pixel, and both frame edges so the mirror turns about the anchor.
      for (const [u, v] of [
        [19, 35],
        [0, 0],
        [FRAME_W, 39],
      ] as const) {
        assert.deepEqual(
          drawnAt(anchored, u, v),
          drawnAt(cell, u + CELL_X, v + CELL_Y),
          `(${u}, ${v})`,
        );
      }
      assert.deepEqual(drawnAt(anchored, 19, 35), [100, 50 + BODY_HH]);
    });
  }
}

test("unanchored frames keep the fixed cell and a centre anchor", () => {
  const snap = spriteSnapshot(fakePlayer(CELL, 1, "normal"))!;
  assert.equal(snap.anchor, undefined);
  assert.deepEqual([snap.x, snap.y], [100.25, 50 - 4]);
  const sprite = new Sprite();
  sprite.anchor.set(0.2, 0.9);
  place(sprite, new Texture({ source: sheet, frame: new Rectangle(0, 0, 72, 54) }), 1, 2, 1);
  assert.deepEqual([sprite.anchor.x, sprite.anchor.y], [0.5, 0.5]);
});

test("dash ghosts keep the anchor of the pose they froze", () => {
  const trail = new Trail();
  trail.sample(1, spriteSnapshot(fakePlayer(ANCHORED, -1, "normal")), {
    interval: 0,
    life: 1,
    alpha: 1,
  });
  assert.deepEqual(trail.ghosts[0]?.anchor, [19, 35]);
  assert.deepEqual([trail.ghosts[0]?.x, trail.ghosts[0]?.y], [100.25, 50 + BODY_HH]);
});
