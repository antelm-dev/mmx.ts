import { test } from "node:test";
import assert from "node:assert/strict";

import type { AnimData, ClipData, ClipSegment } from "@mmx/contracts/animation";
import { assertAnimData } from "@mmx/contracts/animation";
import { buildCompileRegistries } from "../src/behaviors/index.js";
import { AnimationCursor, assertTimedClip, type TimedClip } from "../src/core/AnimationCursor.js";
import { Input } from "../src/core/Input.js";
import { DT } from "../src/core/constants.js";
import { compileGameData, type GameData } from "../src/data/index.js";
import { AnimationPlayer } from "../src/game/Animation.js";
import { Stage } from "../src/game/Stage.js";
import { World } from "../src/game/World.js";
import { spawnEnemy } from "../src/game/enemies/index.js";
import { MMX_GAME_DATA, createPlayer } from "./support/mmx.js";

/**
 * Named segments (intro once, loop, end once) let one clip hold its transition
 * frames: the engine chains one-shot segments, wraps a looping one on itself, and
 * `clip#segment` starts playback at a segment.
 */

const SEGMENTS: ClipSegment[] = [
  { name: "intro", start: 0, end: 1, loop: false },
  { name: "loop", start: 2, end: 3, loop: true },
  { name: "end", start: 4, end: 5, loop: false },
];

/** Six 0.1s frames split intro/loop/end. */
function door(): ClipData {
  return {
    loop: false,
    speed: 10,
    frames: Array.from({ length: 6 }, () => ({ region: [0, 0, 1, 1] as const, duration: 1 })),
    segments: structuredClone(SEGMENTS),
  };
}

/** The frame after each of `steps` 0.1s advances, and the steps that completed the clip. */
function trace(advance: (dt: number) => boolean, frame: () => number, steps: number) {
  const frames: number[] = [];
  const done: number[] = [];
  for (let i = 0; i < steps; i++) {
    if (advance(0.1)) done.push(i);
    frames.push(frame());
  }
  return { frames, done };
}

// --- cursor -------------------------------------------------------------------

test("a segmented clip plays its intro once, then loops on the loop segment", () => {
  const cursor = new AnimationCursor();
  cursor.play(door());
  const { frames, done } = trace(
    (dt) => cursor.advance(dt),
    () => cursor.frame,
    8,
  );
  assert.deepEqual(frames, [1, 2, 3, 2, 3, 2, 3, 2]);
  assert.deepEqual(done, [], "a looping segment never finishes the clip");
});

test("seeking into the last one-shot segment plays it out and finishes the clip", () => {
  const cursor = new AnimationCursor();
  cursor.play(door());
  cursor.advance(0.25);
  cursor.seek(4);
  const { frames, done } = trace(
    (dt) => cursor.advance(dt),
    () => cursor.frame,
    3,
  );
  assert.deepEqual(frames, [5, 5, 5]);
  assert.deepEqual(done, [1]);
  assert.equal(cursor.finished, true);
});

test("explicit once/loop modes ignore segments and play the whole frame list", () => {
  const cursor = new AnimationCursor();
  cursor.play(door(), 0, "once");
  assert.deepEqual(
    trace(
      (dt) => cursor.advance(dt),
      () => cursor.frame,
      6,
    ).done,
    [5],
  );

  cursor.play(door(), 0, "loop");
  assert.deepEqual(
    trace(
      (dt) => cursor.advance(dt),
      () => cursor.frame,
      7,
    ).frames,
    [1, 2, 3, 4, 5, 0, 1],
  );
});

test("segments must partition the frames with unique names", () => {
  const bad: [string, unknown][] = [
    ["empty", []],
    [
      "gap",
      [
        { name: "a", start: 0, end: 1, loop: false },
        { name: "b", start: 3, end: 5, loop: false },
      ],
    ],
    [
      "overlap",
      [
        { name: "a", start: 0, end: 2, loop: false },
        { name: "b", start: 2, end: 5, loop: false },
      ],
    ],
    ["short", [{ name: "a", start: 0, end: 4, loop: false }]],
    ["past the end", [{ name: "a", start: 0, end: 6, loop: false }]],
    [
      "duplicate",
      [
        { name: "a", start: 0, end: 2, loop: false },
        { name: "a", start: 3, end: 5, loop: true },
      ],
    ],
    ["hash", [{ name: "a#b", start: 0, end: 5, loop: false }]],
    ["blank", [{ name: "", start: 0, end: 5, loop: false }]],
    ["loop flag", [{ name: "a", start: 0, end: 5 }]],
  ];
  for (const [why, segments] of bad) {
    const clip = { ...door(), segments } as ClipData;
    assert.throws(() => assertTimedClip(clip as TimedClip), /segment/, why);
    assert.throws(() => assertAnimData({ animations: { door: clip } }), /segment/, why);
  }
  assert.doesNotThrow(() => assertTimedClip(door()));
  assert.doesNotThrow(() => assertAnimData({ animations: { door: door() } }));
});

// --- AnimationPlayer: clip#segment --------------------------------------------

function player(animations: AnimData["animations"]) {
  const anim = new AnimationPlayer();
  anim.load({ animations });
  const finished: string[] = [];
  anim.onFinished = (name) => finished.push(name);
  const step = (dt: number) => {
    const before = finished.length;
    anim.advance(dt);
    return finished.length > before;
  };
  return { anim, finished, step };
}

test("clip#end plays the end segment, then reports the requested name finished", () => {
  const { anim, finished, step } = player({ door: door() });
  anim.play("door");
  trace(step, () => anim.frame, 6);
  assert.deepEqual(finished, [], "plain `door` stays in its loop");

  anim.play("door#end");
  assert.equal(anim.animation, "door#end");
  assert.equal(anim.frame, 4);
  const { frames, done } = trace(step, () => anim.frame, 3);
  assert.deepEqual(frames, [5, 5, 5]);
  assert.deepEqual(done, [1]);
  assert.deepEqual(finished, ["door#end"]);
});

test("clip#loop starts at that segment; the frame argument counts from it", () => {
  const { anim } = player({ door: door() });
  anim.play("door#loop");
  assert.equal(anim.frame, 2);
  anim.play("door#loop", 1);
  assert.equal(anim.frame, 3);
});

test("set_frame takes a clip frame and plays from the segment holding it", () => {
  const { anim, finished, step } = player({ door: door() });
  anim.play("door");
  anim.set_frame(5);
  assert.deepEqual(trace(step, () => anim.frame, 2).done, [0]);
  assert.deepEqual(finished, ["door"]);
});

test("an unknown segment behaves like a missing clip", () => {
  const { anim, finished, step } = player({ door: door() });
  anim.play("door#nope");
  assert.equal(anim.currentFrame(), null);
  assert.deepEqual(trace(step, () => anim.frame, 3).done, [0], "finished once, on the next tick");
  assert.deepEqual(finished, ["door#nope"]);

  anim.play("idle#end");
  assert.equal(anim.currentFrame(), null, "no such clip");
});

test("an exact clip name wins over a segment, and the split is on the last '#'", () => {
  const plain: ClipData = { ...door(), segments: undefined, loop: true };
  delete plain.segments;
  const { anim } = player({ "door#end": plain, door: door(), "a#b": door() });
  anim.play("door#end");
  assert.equal(anim.frame, 0, "the clip literally named door#end");
  anim.play("a#b#loop");
  assert.equal(anim.frame, 2, "clip a#b, segment loop");
});

// --- an enemy ability playing clip#segment ------------------------------------

const GROUND_ROW = 10;
const FLOOR_Y = GROUND_ROW * 16;
const STUN_SECONDS = 0.5;

/** A Metool body that does nothing but Stun, recovering on its `stun#end` segment. */
function stunner() {
  const data: GameData = structuredClone(MMX_GAME_DATA);
  const metool = data.enemies.metool!;
  data.enemies.stunner = {
    ...metool,
    id: "stunner",
    sheet: "stunner",
    shield: undefined,
    abilities: ["Stun", "Death"],
    abilityConfig: {
      Stun: {
        ...metool.abilityConfig!.Stun,
        duration: STUN_SECONDS,
        animation: "stun",
        recoverAnimation: "stun#end",
      },
      Death: metool.abilityConfig!.Death!,
    },
    reactions: { idle: ["Stun"] },
  };
  const result = compileGameData(data, buildCompileRegistries());
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  const gameData = result.value;

  const rows: string[] = [];
  for (let y = 0; y < GROUND_ROW; y++) rows.push("#" + ".".repeat(78) + "#");
  rows.push("#".repeat(80));
  const world = World.fromRows(rows);
  const stage = new Stage(world, createPlayer(world, 70 * 16, FLOOR_Y - 14, new Input()));
  const def = gameData.enemies.get("stunner")!;
  const enemy = stage.add(
    spawnEnemy(def, world, 20 * 16, FLOOR_Y - def.actor.body.hh, -1, 1234, gameData),
  );
  // `stun`: hold (looping) then end; every other clip the enemy asks for is missing.
  enemy.loadAnimations({
    animations: {
      stun: {
        ...door(),
        segments: [
          { name: "hold", start: 0, end: 1, loop: true },
          { name: "end", start: 2, end: 5, loop: false },
        ],
      },
    },
  });
  return { stage, enemy };
}

test("an enemy ability that plays clip#segment waits for that segment to finish", () => {
  const { stage, enemy } = stunner();
  const finished: { name: string; tick: number }[] = [];
  let tick = 0;
  enemy.events.on("animation_finished", (name: string) => finished.push({ name, tick }));

  let recoverTick = -1;
  let endTick = -1;
  for (; tick < Math.round(2 / DT); tick++) {
    const was = enemy.get_animation();
    stage.tick(DT);
    if (was !== "stun#end" && enemy.get_animation() === "stun#end") recoverTick = tick;
    if (recoverTick >= 0 && endTick < 0 && !enemy.is_executing("Stun")) endTick = tick;
    if (endTick >= 0) break;
  }

  assert.ok(recoverTick > 0, "Stun moved on to its recovery segment");
  const ends = finished.filter((f) => f.name === "stun#end");
  assert.equal(ends.length, 1, JSON.stringify(finished));
  assert.ok(
    !finished.some((f) => f.name === "stun"),
    "the looping hold segment never finishes the clip",
  );
  // end = 4 frames of 0.1s; Stun polls the flag on its next update.
  const endSeconds = (ends[0]!.tick - recoverTick) * DT;
  assert.ok(Math.abs(endSeconds - 0.4) <= DT + 1e-9, `end segment took ${endSeconds}s`);
  assert.ok(endTick - ends[0]!.tick <= 1, "and Stun ends right after it");
});
