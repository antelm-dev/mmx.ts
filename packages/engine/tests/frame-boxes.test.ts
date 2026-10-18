import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { AnimData, Box, FrameData } from "@mmx/contracts/animation";
import { Input } from "../src/core/Input.js";
import { DT } from "../src/core/constants.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { Recorder } from "../src/game/Recorder.js";
import { Scene, type SceneClips } from "../src/game/Scene.js";
import { Stage } from "../src/game/Stage.js";
import { Tile, World } from "../src/game/World.js";
import { ENEMY_STATS, MMX_COMPILED, makeBat, makeMetool, createPlayer } from "./support/mmx.js";

/**
 * Per-frame hurtboxes/hitboxes and engine-owned clip data (SceneOptions.clips).
 * Boxes are measured from the feet in the frame as authored and mirror with the
 * sprite, which for enemies is flipped against facing.
 */

const X_ANIMS = JSON.parse(
  readFileSync(new URL("./fixtures/x_anims.json", import.meta.url), "utf8"),
) as AnimData;

/** Every clip an enemy may play, all built from `frames`. */
function enemyClips(frames: Partial<FrameData>[], speed = 1): AnimData {
  const clip = {
    loop: true,
    speed,
    frames: frames.map((f) => ({ region: [0, 0, 1, 1] as const, duration: 1, ...f })),
  };
  const names = ["idle", "walk", "open", "defense", "stun", "hit", "shoot", "explode"];
  return { animations: Object.fromEntries(names.map((name) => [name, clip])) };
}

const GROUND_ROW = 10;
const FLOOR_Y = GROUND_ROW * 16;

function makeStage(playerX = 70 * 16) {
  const rows: string[] = [];
  for (let y = 0; y < GROUND_ROW; y++) rows.push("#" + ".".repeat(78) + "#");
  rows.push("#".repeat(80));
  const world = World.fromRows(rows);
  const input = new Input();
  const player = createPlayer(world, playerX, FLOOR_Y - 14, input);
  return { world, input, player, stage: new Stage(world, player) };
}

function run(stage: Stage, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stage.tick(DT);
}

/** The enemy.test.ts shot: a lemon fired at a bat from 60px away. */
function shootBat(clips?: AnimData): { before: number; after: number } {
  const { world, stage, player, input } = makeStage();
  const bat = stage.add(makeBat(world, 24 * 16, FLOOR_Y - 60, -1, 99));
  if (clips) bat.loadAnimations(clips);
  bat.max_health = 10;
  bat.current_health = 10;
  player.pos.x = bat.pos.x + 60;
  player.pos.y = bat.pos.y;
  player.set_direction(-1);
  player.update_facing_direction();
  input.setDown("fire", true);
  stage.tick(DT);
  input.setDown("fire", false);
  const before = bat.current_health;
  run(stage, 0.5);
  return { before, after: bat.current_health };
}

test("a frame with a smaller hurtbox makes a shot miss that would otherwise hit", () => {
  const control = shootBat();
  assert.equal(control.after, control.before - 1, "precondition: the definition hurtbox is hit");

  // A 2x2 hurtbox 40px above the feet: the lemon flies underneath it.
  const small = shootBat(enemyClips([{ hurtbox: { x: -1, y: -40, w: 2, h: 2 } }]));
  assert.equal(small.after, small.before, "the shot passes the frame's hurtbox by");
});

test("Enemy.hurtbox uses the current frame's box, mirrored with the sprite", () => {
  const { world } = makeStage();
  const metool = makeMetool(world, 100, FLOOR_Y - ENEMY_STATS.metool.hh, -1, 1);
  const def = metool.hurtbox;
  assert.equal(def.right - def.left, ENEMY_STATS.metool.hurt_hw * 2, "no clips: the definition");

  const box: Box = { x: 2, y: -10, w: 6, h: 4 };
  metool.loadAnimations(enemyClips([{ hurtbox: box }]));
  const feet = metool.pos.y + metool.hh;
  // Facing left the sprite is drawn unflipped (the scenes set flip_h), so +x is right.
  assert.deepEqual(metool.hurtbox, { left: 102, right: 108, top: feet - 10, bottom: feet - 6 });
  metool.set_direction(1);
  metool.update_facing_direction();
  assert.deepEqual(metool.hurtbox, { left: 92, right: 98, top: feet - 10, bottom: feet - 6 });
});

/** A Metool facing left with the player standing `gap` px to its right, out of body contact. */
function touchSetup(clips?: AnimData, facing = -1) {
  const { world, stage, player } = makeStage();
  const metool = stage.add(makeMetool(world, 24 * 16, FLOOR_Y - ENEMY_STATS.metool.hh, facing, 1));
  if (clips) metool.loadAnimations(clips);
  player.pos.x = metool.pos.x + 40;
  player.pos.y = metool.pos.y;
  const full = player.current_health;
  stage.tick(DT);
  return { full, health: player.current_health };
}

test("an enemy frame hitbox damages the player on touch", () => {
  const reach = enemyClips([{ hitboxes: [{ x: 20, y: -16, w: 40, h: 16 }] }]);

  const control = touchSetup();
  assert.equal(control.health, control.full, "precondition: 40px away the body does not touch");

  const hit = touchSetup(reach);
  assert.equal(hit.health, hit.full - ENEMY_STATS.metool.touch_damage, "the hitbox reaches him");

  const mirrored = touchSetup(reach, 1);
  assert.equal(mirrored.health, mirrored.full, "facing the other way, the box points away");
});

// --- engine-owned clips -------------------------------------------------------

const COLS = 40;
const ROWS = 12;

function level(): LevelData {
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
  const metool = (iid: string, col: number): LevelEntity => ({
    id: "Enemy",
    iid,
    x: col * 16,
    y: (ROWS - 2) * 16,
    w: 16,
    h: 16,
    fields: { Kind: "metool" },
  });
  return {
    identifier: "frame-box-room",
    gridSize: 16,
    cols: COLS,
    rows: ROWS,
    tiles,
    entities: [
      { id: "Spawn", iid: "spawn", x: 32, y: (ROWS - 2) * 16, w: 16, h: 16, fields: {} },
      metool("m1", 10),
      metool("m2", 20),
    ],
  };
}

/** Multi-frame metool clips, so Hide/Stun actually wait on them. */
const METOOL_CLIPS = enemyClips(
  [{ hurtbox: { x: -6, y: -14, w: 12, h: 14 } }, { duration: 2 }, { duration: 3 }],
  6,
);
const CLIPS: SceneClips = { player: X_ANIMS, enemies: { metool: METOOL_CLIPS } };

/** Walk right, hop, shoot, stand: enough to provoke Hide, open and contact. */
function script(frame: number): number {
  const RIGHT = 1 << 1;
  const JUMP = 1 << 4;
  const FIRE = 1 << 6;
  let mask = frame < 240 ? RIGHT : 0;
  if (frame % 50 === 10) mask |= JUMP;
  if (frame % 17 < 2) mask |= FIRE;
  return mask;
}

function runScene(scene: Scene, frames = 600): string {
  for (let i = 0; i < frames; i++) scene.step(script(i));
  return scene.digest();
}

test("a headless scene with clips matches a run whose clips a renderer attached", () => {
  const owned = Scene.create({ level: level(), gameData: MMX_COMPILED, seed: 3, clips: CLIPS });
  assert.equal(owned.player.sceneClips, true);
  assert.ok(owned.stage.enemies.every((e) => e.sceneClips));

  // The pre-clips path: onEnemySpawned attaches enemy clips, the presenter the player's.
  const attached = Scene.create({
    level: level(),
    gameData: MMX_COMPILED,
    seed: 3,
    onEnemySpawned: (enemy) => enemy.loadAnimations(CLIPS.enemies![enemy.stats.sheet]!),
  });
  attached.player.loadAnimations(X_ANIMS);
  assert.equal(attached.player.sceneClips, false);

  const ownedDigest = runScene(owned);
  assert.equal(ownedDigest, runScene(attached));
  assert.notEqual(
    ownedDigest,
    runScene(Scene.create({ level: level(), gameData: MMX_COMPILED, seed: 3 })),
    "and the clips matter: a clip-less run of the same script ends elsewhere",
  );
});

test("without clips a scene keeps the game data hash; with clips the hash covers them", () => {
  const plain = Scene.create({ level: level(), gameData: MMX_COMPILED });
  assert.equal(plain.gameDataHash, MMX_COMPILED.hash);

  const withClips = Scene.create({ level: level(), gameData: MMX_COMPILED, clips: CLIPS });
  assert.notEqual(withClips.gameDataHash, MMX_COMPILED.hash);

  // Art-only edits (regions, anchors) do not move it; timing and boxes do.
  const recropped = structuredClone(METOOL_CLIPS);
  for (const clip of Object.values(recropped.animations)) {
    clip.frames = clip.frames.map((f) => ({ ...f, region: [8, 8, 4, 4], anchor: [2, 4] }));
  }
  const sameHash = Scene.create({
    level: level(),
    gameData: MMX_COMPILED,
    clips: { ...CLIPS, enemies: { metool: recropped } },
  }).gameDataHash;
  assert.equal(sameHash, withClips.gameDataHash);

  const moved = structuredClone(METOOL_CLIPS);
  moved.animations.idle!.frames[0]!.hurtbox = { x: -6, y: -14, w: 12, h: 13 };
  assert.notEqual(
    Scene.create({
      level: level(),
      gameData: MMX_COMPILED,
      clips: { ...CLIPS, enemies: { metool: moved } },
    }).gameDataHash,
    withClips.gameDataHash,
  );
});

test("player frame boxes stay out of the hash until the engine reads them", () => {
  const base = Scene.create({ level: level(), gameData: MMX_COMPILED, clips: CLIPS }).gameDataHash;
  const boxed = structuredClone(X_ANIMS);
  for (const clip of Object.values(boxed.animations)) {
    clip.frames = clip.frames.map((f) => ({
      ...f,
      hurtbox: { x: -4, y: -20, w: 8, h: 20 },
      hitboxes: [{ x: 0, y: -10, w: 6, h: 6 }],
    }));
  }
  assert.equal(
    Scene.create({ level: level(), gameData: MMX_COMPILED, clips: { ...CLIPS, player: boxed } })
      .gameDataHash,
    base,
  );

  // Player timing still counts.
  const slower = structuredClone(X_ANIMS);
  slower.animations.idle!.frames[0]!.duration += 1;
  assert.notEqual(
    Scene.create({ level: level(), gameData: MMX_COMPILED, clips: { ...CLIPS, player: slower } })
      .gameDataHash,
    base,
  );
});

test("a replay recorded with different clip boxes is refused", () => {
  const recorder = new Recorder({ level: level(), gameData: MMX_COMPILED, seed: 5, clips: CLIPS });
  for (let i = 0; i < 30; i++) recorder.step(script(i));
  const replay = recorder.toReplay();

  assert.equal(
    Recorder.replay(replay, { level: level(), gameData: MMX_COMPILED, clips: CLIPS }).digest(),
    recorder.scene.digest(),
    "same clips: it replays",
  );

  const other = structuredClone(METOOL_CLIPS);
  other.animations.idle!.frames[0]!.hitboxes = [{ x: 0, y: -8, w: 8, h: 8 }];
  assert.throws(
    () =>
      Recorder.replay(replay, {
        level: level(),
        gameData: MMX_COMPILED,
        clips: { ...CLIPS, enemies: { metool: other } },
      }),
    /recorded with game data/,
  );
  assert.throws(
    () => Recorder.replay(replay, { level: level(), gameData: MMX_COMPILED }),
    /recorded with game data/,
  );
});

test("scene clips must cover every spawned enemy's sheet", () => {
  assert.throws(
    () => Scene.create({ level: level(), gameData: MMX_COMPILED, clips: { enemies: {} } }),
    /no table for enemy sheet 'metool'/,
  );
});

test("clips without segments keep their hash; segments enter it and replay", () => {
  // Frozen on the base before segments existed (4f94232); re-frozen when the core
  // hazard prefab gained its Lethal and Damage fields (the game-data hash moved).
  const plain = Scene.create({ level: level(), gameData: MMX_COMPILED, clips: CLIPS }).gameDataHash;
  assert.equal(plain, "c3248746ca567d8a");

  const segmented = structuredClone(METOOL_CLIPS);
  for (const clip of Object.values(segmented.animations)) {
    clip.segments = [
      { name: "rise", start: 0, end: 0, loop: false },
      { name: "up", start: 1, end: 2, loop: true },
    ];
  }
  const clips: SceneClips = { ...CLIPS, enemies: { metool: segmented } };
  const recorder = new Recorder({ level: level(), gameData: MMX_COMPILED, seed: 5, clips });
  assert.notEqual(recorder.scene.gameDataHash, plain, "segments are gameplay");
  for (let i = 0; i < 600; i++) recorder.step(script(i));
  assert.equal(
    Recorder.replay(recorder.toReplay(), {
      level: level(),
      gameData: MMX_COMPILED,
      clips,
    }).digest(),
    recorder.scene.digest(),
    "a run with segmented clips replays identically",
  );
});
