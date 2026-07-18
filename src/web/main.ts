import { Input, Action } from "../core/Input.js";
import { BODY_HALF_H, DASH_FX_OFFSET_X, DASH_FX_OFFSET_Y, DT } from "../core/constants.js";
import { packInput } from "../core/Replay.js";
import type { Enemy } from "../engine/Enemy.js";
import type { Player } from "../engine/Player.js";
import type { Scene } from "../engine/Scene.js";
import type { AnimData } from "../engine/Animation.js";
import { DashSmoke } from "./DashSmoke.js";
import { Trail, TrailStyle, DASH_TRAIL, WALLSLIDE_TRAIL } from "./Trail.js";
import { animData, enemyAnims } from "./render/assets.js";
import { Renderer } from "./render/Renderer.js";
import { spriteSnapshot } from "./render/sprite.js";
import { SoundEffects } from "./SoundEffects.js";
import { DEFAULT_SETTINGS, DesktopBridge, type DesktopSettings } from "./DesktopBridge.js";
import { DebugOverlay } from "./debug/DebugOverlay.js";
import { DebugPanel } from "./debug/DebugPanel.js";
import { DebugSession } from "./debug/DebugSession.js";

/**
 * Entry point: input, the fixed-timestep loop, and nothing else. The simulation
 * lives in src/engine (shared unchanged with the headless sim) and the drawing in
 * {@link Renderer} — this file only wires the two together.
 *
 * The run itself is owned by {@link DebugSession}, because restart-from-checkpoint
 * and replay loading both *replace* the whole scene. Anything here that hangs off
 * the player or the enemies therefore has to be re-attachable, which is what
 * {@link bindScene} is for: it is called once at startup and again after every
 * rebuild, and there is no other path by which this file learns about a scene.
 */

const sounds = new SoundEffects();
const trail = new Trail();
const smoke = new DashSmoke();
const overlay = new DebugOverlay();
const desktop = new DesktopBridge();
let settings: DesktopSettings = { ...DEFAULT_SETTINGS };

/**
 * The keys physically held right now.
 *
 * Deliberately *not* the scene's own Input. The scene's is derived — every tick
 * it is written from the recorded input mask, including while a rewind replays
 * hundreds of ticks in one frame. If the browser wrote key state there directly,
 * a rewind would leave whatever the last replayed frame held, and a player who
 * was running right would silently stop the moment they restarted a checkpoint.
 * This one is the authority, and each tick packs a mask from it.
 */
const held = new Input();

let renderer: Renderer | null = null;

const debug = new DebugSession({
  onEnemySpawned: bindEnemy,
  onSceneReplaced: bindScene,
  extraDiagnostics: () => renderer?.stats() ?? {},
  replayFiles: desktop.replays,
});

function persistSettings(): void {
  void desktop.saveSettings(settings).catch((error: unknown) => {
    console.warn("Could not save desktop settings", error);
    debug.notify(`settings save failed: ${String(error)}`);
  });
}

function adjustVolume(delta: number): void {
  settings = {
    ...settings,
    masterVolume: Math.round(Math.max(0, Math.min(1, settings.masterVolume + delta)) * 10) / 10,
  };
  sounds.setMasterVolume(settings.masterVolume);
  persistSettings();
  debug.notify(`volume ${Math.round(settings.masterVolume * 100)}%`);
}

debug.registerCommand({
  code: "F8",
  label: "F8",
  description: "toggle pause on focus loss",
  run: () => {
    settings = { ...settings, pauseOnBlur: !settings.pauseOnBlur };
    persistSettings();
    debug.notify(`pause on focus loss ${settings.pauseOnBlur ? "on" : "off"}`);
  },
});
debug.registerCommand({
  code: "F9",
  label: "F9",
  description: "volume down",
  run: () => adjustVolume(-0.1),
});
debug.registerCommand({
  code: "F10",
  label: "F10",
  description: "volume up",
  run: () => adjustVolume(0.1),
});
debug.registerCommand({
  code: "F11",
  label: "F11",
  description: "toggle fullscreen",
  run: () => {
    const previous = settings.fullscreen;
    settings = { ...settings, fullscreen: !settings.fullscreen };
    void desktop
      .setFullscreen(settings.fullscreen)
      .then(() => {
        persistSettings();
        debug.notify(settings.fullscreen ? "fullscreen" : "windowed");
      })
      .catch((error: unknown) => {
        settings = { ...settings, fullscreen: previous };
        debug.notify(`fullscreen failed: ${String(error)}`);
      });
  },
});

// --- per-scene wiring -------------------------------------------------------

/**
 * Ability.gd randomizes ordinary ability sounds upward by up to ten percent.
 * Re-subscribed per scene: the events live on the player, and a rebuilt scene has
 * a new one.
 */
function bindPlayer(player: Player): void {
  // Clip data (loop flags, per-clip fps, frame sequences and both atlases' regions)
  // goes into the engine: the abilities pick and read the current clip exactly as the
  // Godot originals do, and the renderer only draws whatever frame that leaves showing.
  player.loadAnimations(animData as unknown as AnimData);

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
    // MMX - Charge.wav.import: forward loop from PCM frame 51645 to 56497.
    sounds.play("charge", { db: -13.5, loop: true, loopFrames: [51645, 56497] });
  });
  player.events.on("charge_max", () => sounds.play("chargeMax", { tracked: true }));
  player.events.on("charge_stopped", () => {
    sounds.stop("charge");
    sounds.stop("chargeMax");
  });

  // --- dash kick-up smoke ---
  // Unlike the trail this is not sampled: Dash.gd emits a single puff at the moment it
  // pushes off, so the ability announces it and the effect is spawned from the signal.
  // The puff is pinned to where the body was on that frame and left there.
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
}

function bindEnemy(enemy: Enemy): void {
  // Same split as the player's: clip data is engine state, because the abilities
  // read it (Hide waits for "open" to finish before it advances).
  enemy.loadAnimations(enemyAnims.actors[enemy.stats.sheet] as unknown as AnimData);
  enemy.events.on("damage", () => sounds.play("enemyHit", { db: -6.832 }));
  enemy.events.on("shield_hit", () => sounds.play("shieldHit", { db: -6.832 }));
  enemy.events.on("guard_break", () => {
    // EnemyShield plays its deflection sound before EnemyStun's break effect.
    sounds.play("shieldHit", { db: -6.832 });
    sounds.play("guardBreak", { db: -8, rate: 0.78 });
  });
  enemy.events.on("zero_health", () => sounds.play("enemyDeath", { db: -4.267 }));
}

/**
 * Attach to a scene — at startup, and again after every restart or replay load.
 *
 * The cosmetic buffers are cleared rather than left to age out: they hold frozen
 * copies of the previous run's sprite, so a rewind would otherwise leave a
 * handful of afterimages hanging in the air where the player used to be.
 */
function bindScene(scene: Scene): void {
  bindPlayer(scene.player);
  trail.clear();
  smoke.clear();
  overlay.reset();
  // A charge loop is the one sound that outlives the frame that started it, so a
  // rewind mid-charge would leave it droning over a scene that is no longer
  // charging anything.
  sounds.stop("charge");
  sounds.stop("chargeMax");
}

bindScene(debug.scene);

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
  // Debug keys first, and none of them share a code with the gameplay map above.
  if (!e.repeat && debug.handleKey(e.code)) {
    e.preventDefault();
    return;
  }
  const a = KEYMAP[e.code];
  if (a) {
    held.setDown(a, true);
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  const a = KEYMAP[e.code];
  if (a) {
    held.setDown(a, false);
    e.preventDefault();
  }
});
window.addEventListener("blur", () => {
  for (const action of Object.values(KEYMAP)) held.setDown(action, false);
  if (settings.pauseOnBlur && !debug.paused) {
    debug.paused = true;
    debug.notify("paused — focus lost");
  }
});

// --- afterimage trail ---
// Dash.gd keeps its ghost sprite synchronized with the live one every frame
// (synchronize_sprite_effect) and Wallslide.gd emits from the wall; both are sampled
// off the fixed tick so ghost spacing follows the body's motion, not the display's
// refresh rate.

/** Which move, if any, is currently laying down a trail — and how it should look. */
function trailStyle(player: Player): TrailStyle | null {
  if (player.is_executing_either(["Dash", "AirDash"])) return DASH_TRAIL;
  if (player.is_executing("WallSlide")) return WALLSLIDE_TRAIL;
  return null;
}

/**
 * One fixed step of everything: the recorded simulation, then the cosmetics that
 * ride on it. Both are inside the step so a slowed or single-stepped frame
 * advances the afterimages by exactly one tick too.
 */
function stepOnce(): void {
  debug.beforeStep();
  debug.recorder.step(packInput(held));

  const { player } = debug.scene;
  const style = trailStyle(player);
  trail.sample(DT, style ? spriteSnapshot(player) : null, style ?? DASH_TRAIL);
  smoke.tick(DT); // SpriteEffect ages in _physics_process, so on the fixed step
}

/**
 * Longest slice of wall clock a single frame may contribute to the accumulator.
 *
 * Without it, a tab that was backgrounded for ten seconds returns with six
 * hundred queued steps and fast-forwards through them — and if catching up takes
 * longer than the time it is catching up on, it never converges. The time past
 * this cap is discarded, which is what {@link FrameStats.droppedFrames} counts.
 */
const MAX_FRAME_SECONDS = 0.25;

async function main(): Promise<void> {
  settings = await desktop.loadSettings();
  sounds.setMasterVolume(settings.masterVolume);
  if (settings.fullscreen) {
    await desktop.setFullscreen(true).catch((error: unknown) => {
      settings = { ...settings, fullscreen: false };
      console.warn("Could not restore fullscreen", error);
    });
  }
  await desktop.onReplayDropped((file) => debug.loadReplayText(file.contents, file.path));

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const panel = new DebugPanel(debug);

  const [created] = await Promise.all([Renderer.create(canvas, debug.scene.world), sounds.load()]);
  renderer = created;
  renderer.worldOverlay.addChild(overlay.view);

  window.addEventListener("resize", () => renderer?.fit());
  // Dragging the window to a monitor with a different scaling factor changes dpr
  // without necessarily resizing the viewport, and the media query only matches the
  // dpr it was created with — so re-arm it against the new value on every change.
  function watchDpr(): void {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener(
      "change",
      () => {
        renderer?.fit();
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
    const frameTime = now - last;
    for (const name of ["mmx:frame-work", "mmx:simulation", "mmx:render"]) {
      performance.clearMeasures(name);
      performance.clearMarks(`${name}:start`);
      performance.clearMarks(`${name}:end`);
    }
    performance.mark("mmx:frame-work:start");

    // Scaled before clamping, so slow motion buys a longer wall-clock budget
    // rather than being cut off at the same quarter second real time is.
    const elapsed = debug.scaleElapsed((now - last) / 1000);
    if (elapsed > MAX_FRAME_SECONDS) debug.stats.droppedFrames++;
    acc += Math.min(MAX_FRAME_SECONDS, elapsed);
    last = now;

    let simulationSteps = 0;
    performance.mark("mmx:simulation:start");
    while (acc >= DT) {
      stepOnce();
      acc -= DT;
      simulationSteps++;
    }
    // Frame advance runs outside the budget: the point is exactly one tick, not
    // DT worth of injected wall clock.
    while (debug.shouldStep()) {
      stepOnce();
      simulationSteps++;
    }
    performance.mark("mmx:simulation:end");
    const simulation = performance.measure(
      "mmx:simulation",
      "mmx:simulation:start",
      "mmx:simulation:end",
    ).duration;

    const scene = debug.scene;
    overlay.setVisible(debug.overlayVisible);
    overlay.update(scene, scene.camera);

    performance.mark("mmx:render:start");
    created.render(scene.stage, scene.camera, trail, smoke);
    performance.mark("mmx:render:end");
    const rendering = performance.measure(
      "mmx:render",
      "mmx:render:start",
      "mmx:render:end",
    ).duration;
    performance.mark("mmx:frame-work:end");
    const frameWork = performance.measure(
      "mmx:frame-work",
      "mmx:frame-work:start",
      "mmx:frame-work:end",
    ).duration;

    debug.stats.record({
      frameTime,
      simulation,
      rendering,
      frameWork,
      simulationSteps,
      accumulator: acc,
    });
    panel.update(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Not top-level await: the build targets es2020, which predates it.
void main();

// expose for quick console poking
(window as any).mmx = debug;
