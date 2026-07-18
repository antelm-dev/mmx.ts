import { Input, Action } from "../core/Input.js";
import { BODY_HALF_H, DASH_FX_OFFSET_X, DASH_FX_OFFSET_Y, DT } from "../core/constants.js";
import { Player } from "../engine/Player.js";
import { Camera } from "../engine/Camera.js";
import { Stage } from "../engine/Stage.js";
import { spawnEnemy } from "../engine/enemies/index.js";
import { makeWorld, SPAWN, CAMERA_ZONES, ENEMY_SPAWNS } from "../engine/level.js";
import type { AnimData } from "../engine/Animation.js";
import { DashSmoke } from "./DashSmoke.js";
import { Trail, TrailStyle, DASH_TRAIL, WALLSLIDE_TRAIL } from "./Trail.js";
import { animData, enemyAnims } from "./render/assets.js";
import { Renderer } from "./render/Renderer.js";
import { spriteSnapshot } from "./render/sprite.js";
import { SoundEffects } from "./SoundEffects.js";

/**
 * Entry point: input, the fixed-timestep loop, and nothing else. The simulation
 * lives in src/engine (shared unchanged with the headless sim) and the drawing in
 * {@link Renderer} — this file only wires the two together.
 */

const input = new Input();
const world = makeWorld();
const player = new Player(world, SPAWN.x, SPAWN.y, input);
const camera = new Camera(world.widthPx, world.heightPx);
camera.setZones(CAMERA_ZONES);
camera.snapTo(player.pos.x, player.pos.y);

// Clip data (loop flags, per-clip fps, frame sequences and both atlases' regions)
// goes into the engine: the abilities pick and read the current clip exactly as the
// Godot originals do, and the renderer only draws whatever frame that leaves showing.
player.loadAnimations(animData as unknown as AnimData);

// The room the player is in: the enemies placed on the level, and the collision
// between them and him. Its tick drives the player's, so there is one fixed step
// for the whole simulation rather than one per actor.
const stage = new Stage(world, player);
const sounds = new SoundEffects();

// Ability.gd randomizes ordinary ability sounds upward by up to ten percent.
player.events.on("ability_started", (name: string) => {
  if (["Jump", "DashJump", "WallJump", "DashWallJump"].includes(name)) {
    sounds.play("jump", { rate: [1, 1.1] });
  } else if (name === "Dash" || name === "AirDash") {
    sounds.play("dash", { db: -0.676, rate: [1, 1.1] });
  } else if (name === "WallSlide") {
    sounds.play("wallslide", { rate: [1, 1.1] });
  } else if (name === "Damage") {
    sounds.play("damage", { rate: [1, 1.1] });
  }
});
player.events.on("land", () => sounds.play("land", { db: -5.333, rate: [1, 1.1] }));
player.events.on("shot_fired", (charge: number) => {
  if (charge <= 0) sounds.play("lemon", { rate: [0.95, 1] });
  else if (charge === 1) sounds.play("mediumShot", { rate: [0.95, 1] });
  else sounds.play("chargedShot", { rate: [0.95, 1] });
});
player.events.on("charge_started", () => {
  sounds.play("charge", { db: -13.5, loop: true });
});
player.events.on("charge_max", () => sounds.play("chargeMax", { loop: true }));
player.events.on("charge_stopped", () => {
  sounds.stop("charge");
  sounds.stop("chargeMax");
});

for (const [i, spawn] of ENEMY_SPAWNS.entries()) {
  const enemy = spawnEnemy(spawn.kind, world, spawn.x, spawn.y, spawn.facing, 0x51ed + i);
  // Same split as the player's: clip data is engine state, because the abilities
  // read it (Hide waits for "open" to finish before it advances).
  enemy.loadAnimations(enemyAnims.actors[spawn.kind] as unknown as AnimData);
  enemy.events.on("damage", () => sounds.play("enemyHit", { db: -6.832 }));
  enemy.events.on("shield_hit", () => sounds.play("shieldHit", { db: -6.832 }));
  enemy.events.on("guard_break", () => {
    // EnemyShield plays its deflection sound before EnemyStun's break effect.
    sounds.play("shieldHit", { db: -6.832 });
    sounds.play("guardBreak", { db: -8, rate: 0.78 });
  });
  enemy.events.on("zero_health", () => sounds.play("enemyDeath", { db: -4.267 }));
  stage.add(enemy);
}

// --- keyboard -> actions ---
const KEYMAP: Record<string, Action> = {
  ArrowLeft: "move_left",
  KeyA: "move_left",
  ArrowRight: "move_right",
  KeyD: "move_right",
  ArrowUp: "move_up",
  KeyW: "move_up",
  ArrowDown: "move_down",
  KeyS: "move_down",
  Space: "jump",
  KeyK: "jump",
  ShiftLeft: "dash",
  KeyL: "dash",
  KeyJ: "fire",
  KeyF: "fire",
};

window.addEventListener("keydown", (e) => {
  sounds.unlock();
  const a = KEYMAP[e.code];
  if (a) {
    input.setDown(a, true);
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  const a = KEYMAP[e.code];
  if (a) {
    input.setDown(a, false);
    e.preventDefault();
  }
});

// --- afterimage trail ---
// Dash.gd keeps its ghost sprite synchronized with the live one every frame
// (synchronize_sprite_effect) and Wallslide.gd emits from the wall; both are sampled
// off the fixed tick so ghost spacing follows the body's motion, not the display's
// refresh rate.
const trail = new Trail();

/** Which move, if any, is currently laying down a trail — and how it should look. */
function trailStyle(): TrailStyle | null {
  if (player.is_executing_either(["Dash", "AirDash"])) return DASH_TRAIL;
  if (player.is_executing("WallSlide")) return WALLSLIDE_TRAIL;
  return null;
}

// --- dash kick-up smoke ---
// Unlike the trail this is not sampled: Dash.gd emits a single puff at the moment it
// pushes off, so the ability announces it and the effect is spawned from the signal.
// The puff is pinned to where the body was on that frame and left there.
const smoke = new DashSmoke();
player.events.on("dash_smoke", (clip: string, dir: number) => {
  // The emitter hangs off the player *root*, whose origin is the unshrunk body
  // centre — which is not pos.y here, because reduce_hitbox trims the dash hitbox
  // from the top and slides the centre down while the feet stay planted. Anchor off
  // the feet instead, exactly as spriteSnapshot does, or the puff drops 4px the
  // instant the dash hitbox comes in.
  smoke.spawn(
    player.pos.x + DASH_FX_OFFSET_X * dir,
    player.pos.y + player.hh - BODY_HALF_H + DASH_FX_OFFSET_Y,
    clip,
    dir,
  );
});

async function main(): Promise<void> {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const [renderer] = await Promise.all([Renderer.create(canvas, world), sounds.load()]);

  window.addEventListener("resize", () => renderer.fit());
  // Dragging the window to a monitor with a different scaling factor changes dpr
  // without necessarily resizing the viewport, and the media query only matches the
  // dpr it was created with — so re-arm it against the new value on every change.
  function watchDpr(): void {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener(
      "change",
      () => {
        renderer.fit();
        watchDpr();
      },
      { once: true },
    );
  }
  watchDpr();

  // --- fixed-timestep loop ---
  let acc = 0;
  let last = performance.now();
  function frame(now: number): void {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= DT) {
      stage.tick(DT); // player, enemies and the damage between them; sprites too
      camera.follow(player.pos.x, player.pos.y, DT); // same fixed step, so scrolling is deterministic
      const style = trailStyle();
      trail.sample(DT, style ? spriteSnapshot(player) : null, style ?? DASH_TRAIL);
      smoke.tick(DT); // SpriteEffect ages in _physics_process, so on the fixed step
      acc -= DT;
    }
    renderer.render(stage, camera, trail, smoke);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Not top-level await: the build targets es2020, which predates it.
void main();

// expose for quick console poking
(window as any).player = player;
