import { Input, Action } from "../core/Input.js";
import { BODY_HALF_H, DASH_FX_OFFSET_X, DASH_FX_OFFSET_Y, DT } from "../core/constants.js";
import { packInput } from "../core/Replay.js";
import type { Enemy } from "../engine/Enemy.js";
import type { Player } from "../engine/Player.js";
import type { Scene } from "../engine/Scene.js";
import type { AnimData } from "../engine/Animation.js";
import { DashSmoke } from "./DashSmoke.js";
import { GamepadInput } from "./Gamepad.js";
import { Trail, TrailStyle, DASH_TRAIL, WALLSLIDE_TRAIL } from "./Trail.js";
import { animData, enemyAnims } from "./render/assets.js";
import { Renderer } from "./render/Renderer.js";
import { spriteSnapshot } from "./render/sprite.js";
import { SoundEffects } from "./SoundEffects.js";
import {
  BINDABLE_ACTIONS,
  cloneBindings,
  DEFAULT_BINDINGS,
  DEFAULT_SETTINGS,
  DesktopBridge,
  MAX_WINDOW_SCALE,
  type DesktopSettings,
} from "./DesktopBridge.js";
import { SettingsMenu } from "./ui/SettingsMenu.js";
import { loadUiFont } from "./ui/font.js";
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
let settings: DesktopSettings = { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };

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

/**
 * The pad's half of the same picture, polled once per frame.
 *
 * Held apart from {@link held} rather than merged into it because the two are
 * updated on opposite schedules — the keyboard on events, the pad by a poll that
 * rewrites every action every frame — and a poll that found no pad would clear
 * a key the player is still holding. They are ORed together at pack time, so a
 * player can hold left on the stick and jump on the keyboard.
 */
const pad = new GamepadInput();

let renderer: Renderer | null = null;

const debug = new DebugSession({
  onEnemySpawned: bindEnemy,
  onSceneReplaced: bindScene,
  extraDiagnostics: () => renderer?.stats() ?? {},
  replayFiles: desktop.replays,
});

/**
 * Write the settings out, coalescing a burst into one write.
 *
 * Holding an arrow key on the menu's volume row emits a change per key repeat,
 * and each one is a disk write on desktop. The delay is short enough that a
 * player who closes the menu and quits immediately still keeps their choice,
 * because closing the window does not cancel a pending timer that has already
 * been given the final value.
 */
let saveTimer = 0;
function persistSettings(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void desktop.saveSettings(settings).catch((error: unknown) => {
      console.warn("Could not save desktop settings", error);
      debug.notify(`settings save failed: ${String(error)}`);
    });
  }, 200);
}

function setVolume(volume: number): void {
  settings = { ...settings, masterVolume: Math.max(0, Math.min(1, volume)) };
  sounds.setMasterVolume(settings.masterVolume);
  persistSettings();
}

function adjustVolume(delta: number): void {
  setVolume(Math.round((settings.masterVolume + delta) * 10) / 10);
  debug.notify(`volume ${Math.round(settings.masterVolume * 100)}%`);
}

let maxWindowScale = MAX_WINDOW_SCALE;

function setScale(scale: number): void {
  const next = Math.max(1, Math.min(maxWindowScale, Math.round(scale)));
  if (next === settings.scale && !settings.fullscreen) return;
  const previous = settings;
  settings = { ...settings, scale: next, fullscreen: false };
  void desktop
    .applyWindowScale(next)
    .then(() => {
      fitRenderer();
      persistSettings();
      debug.notify(`scale ${next}x`);
    })
    .catch((error: unknown) => {
      settings = previous;
      debug.notify(`scale failed: ${String(error)}`);
    });
}

/** Prefer the settings zoom when windowed; fill the display in fullscreen. */
function fitRenderer(): void {
  if (!renderer) return;
  if (settings.fullscreen) renderer.fit();
  else renderer.fit(settings.scale);
}

function setFullscreen(fullscreen: boolean): void {
  if (fullscreen === settings.fullscreen) return;
  const previous = settings.fullscreen;
  settings = { ...settings, fullscreen };
  void desktop
    .setFullscreen(fullscreen)
    .then(async () => {
      if (!fullscreen) await desktop.applyWindowScale(settings.scale);
      fitRenderer();
      persistSettings();
      debug.notify(fullscreen ? "fullscreen" : "windowed");
    })
    .catch((error: unknown) => {
      settings = { ...settings, fullscreen: previous };
      debug.notify(`fullscreen failed: ${String(error)}`);
    });
}

// --- settings menu (Escape) -------------------------------------------------

const menu = new SettingsMenu({
  getSettings: () => settings,
  setVolume: (volume) => {
    setVolume(volume);
    // The point of a volume slider is hearing the result, and the meter alone
    // says nothing about how loud that actually is.
    sounds.play("lemon");
  },
  setScale,
  setFullscreen,
  getMaxScale: () => maxWindowScale,
  setBinding: (action, slot, code) => {
    const bindings = cloneBindings(settings.bindings);
    // A key can only mean one thing: taking it for this slot releases it
    // everywhere else, or the earlier action would keep winning the lookup and
    // the rebind would look like it silently failed.
    if (code) {
      for (const other of BINDABLE_ACTIONS) {
        for (let i = 0; i < bindings[other].length; i++) {
          if (bindings[other][i] === code) bindings[other][i] = "";
        }
      }
    }
    bindings[action][slot] = code;
    settings = { ...settings, bindings };
    // The key that was physically down when it was captured belongs to the old
    // mapping, and no keyup will ever arrive for it under the new one.
    releaseAllKeys();
    persistSettings();
  },
  onVisibilityChange: (visible) => {
    // Keys held on the way in would stay held for as long as the menu is up,
    // and X would be mid-run the instant it closes.
    if (visible) {
      releaseAllKeys();
      void desktop.maxWindowScale().then((max) => {
        maxWindowScale = max;
      });
    }
  },
});

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
  run: () => setFullscreen(!settings.fullscreen),
});

// --- per-scene wiring -------------------------------------------------------

/**
 * MMX - Charge.wav.import declares a forward loop over PCM frames 51645..56497
 * of a 32 kHz file — the tail of the hum, which is what should sustain while the
 * shot holds. Kept in seconds because that is what the Web Audio source wants
 * and the decoded buffer no longer carries the file's rate.
 */
const CHARGE_LOOP: [number, number] = [51645 / 32000, 56497 / 32000];

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
      // Keep the scrape alive for as long as the sustained ability is active.
      // It remains routed through SoundEffects' master gain, so changing the
      // volume while wall-sliding takes effect immediately.
      sounds.play("wallslide", { loop: true, rate: [1, 1.1] });
    } else if (name === "Damage") {
      sounds.play("damage", { rate: [1, 1.1] });
    } else if (name === "Death") {
      sounds.play("playerDeath");
    }
  });
  player.events.on("ability_end", (name: string) => {
    if (name === "WallSlide") sounds.stop("wallslide");
  });
  // Death's restart_delay is timed to this sample, so by the time it fires the
  // death sound has already finished playing out.
  player.events.on("death", () => debug.restartLevel());
  player.events.on("land", () => sounds.play("land", { db: -5.333, rate: [1, 1.1] }));
  player.events.on("shot_fired", (charge: number) => {
    if (charge <= 0) sounds.play("lemon", { rate: [0.95, 1] });
    else if (charge === 1) sounds.play("mediumShot", { rate: [0.95, 1] });
    else sounds.play("chargedShot", { rate: [0.95, 1] });
  });
  player.events.on("charge_started", () => {
    sounds.play("charge", { db: -13.5, loop: true, loopSeconds: CHARGE_LOOP });
  });
  // Topping out is a visual-only cue: the hum just keeps looping. Layering a
  // second sample over it only read as louder, not as a threshold being crossed.
  player.events.on("charge_stopped", () => sounds.stop("charge"));

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
  // Sustained sounds outlive the frame that started them, so a restart or replay
  // load must not leave a loop from the previous scene playing.
  sounds.stop("wallslide");
  sounds.stop("charge");
}

bindScene(debug.scene);

// --- keyboard -> actions ---

/**
 * Which action a key means right now, from the player's own bindings.
 *
 * A lookup over seven actions rather than a prebuilt code->action map, because
 * the map is now editable at runtime and a cached one would need rebuilding on
 * every rebind. Fourteen string compares per key event is nothing next to that.
 */
function actionFor(code: string): Action | undefined {
  return BINDABLE_ACTIONS.find((action) => settings.bindings[action].includes(code));
}

function releaseAllKeys(): void {
  for (const action of BINDABLE_ACTIONS) held.setDown(action, false);
}

window.addEventListener("keydown", (e) => {
  sounds.unlock();
  // The menu first: while it is open it swallows everything, including the keys
  // that are also gameplay bindings, and while it is closed it takes only Escape.
  if (!e.repeat || menu.visible) {
    if (menu.handleKey(e.code)) {
      e.preventDefault();
      return;
    }
  }

  // Gameplay before debug, so a key the player has explicitly bound always does
  // what they bound it to. The default map shares no code with a debug command,
  // and the menu refuses to bind the function keys, so the debug layer survives
  // any rebind that can be made from inside the game.
  const a = actionFor(e.code);
  if (a) {
    held.setDown(a, true);
    e.preventDefault();
    return;
  }
  if (!e.repeat && debug.handleKey(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  const a = actionFor(e.code);
  if (a) {
    held.setDown(a, false);
    e.preventDefault();
  }
});
window.addEventListener("blur", () => {
  releaseAllKeys();
  pad.releaseAll();
  if (settings.pauseOnBlur && !debug.paused) {
    debug.paused = true;
    debug.notify("paused — focus lost");
  }
});

// --- gamepad -> actions ---

// A pad is not enumerable until it reports something, so these are the only
// notice the player gets that it was seen at all.
window.addEventListener("gamepadconnected", (e) => {
  debug.notify(`gamepad ${e.gamepad.index}: ${e.gamepad.id.slice(0, 40)}`);
});
window.addEventListener("gamepaddisconnected", (e) => {
  // Whatever was held at the moment the cable came out is held forever otherwise:
  // the poll only ever sees pads that are still there.
  pad.releaseAll();
  debug.notify(`gamepad ${e.gamepad.index} disconnected`);
});

/** Feed the frame's pad presses to the settings menu as the key codes it speaks. */
function applyPadMenuCodes(): void {
  const codes = pad.takeMenuCodes();
  if (codes.length > 0) sounds.unlock();
  for (const code of codes) {
    // A capturing slot takes the next code as a binding, and these codes are
    // synthesized — binding one would write a key into the settings file that no
    // keyboard can ever press again. Only the cancel gets through.
    if (menu.isCapturing && code !== "Escape") continue;
    menu.handleKey(code);
  }
}

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
  debug.recorder.step(packInput(held) | packInput(pad.actions));

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
  maxWindowScale = await desktop.maxWindowScale().catch(() => MAX_WINDOW_SCALE);
  settings = { ...settings, scale: Math.min(settings.scale, maxWindowScale) };
  if (settings.fullscreen) {
    await desktop.setFullscreen(true).catch((error: unknown) => {
      settings = { ...settings, fullscreen: false };
      console.warn("Could not restore fullscreen", error);
    });
  } else {
    await desktop.applyWindowScale(settings.scale).catch((error: unknown) => {
      console.warn("Could not apply window scale", error);
    });
  }
  await desktop.onReplayDropped((file) => debug.loadReplayText(file.contents, file.path));

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const panel = new DebugPanel(debug);

  // The UI face loads alongside the atlas and the audio, and is awaited with them:
  // the menu's labels are built at module scope and Pixi rasterises a Text the
  // first time it draws, so the face has to be in before any frame goes out.
  const [created] = await Promise.all([
    Renderer.create(canvas, debug.scene.world),
    sounds.load(),
    loadUiFont(),
  ]);
  renderer = created;
  renderer.worldOverlay.addChild(overlay.view);
  renderer.uiLayer.addChild(menu.view);

  window.addEventListener("resize", () => fitRenderer());
  // Dragging the window to a monitor with a different scaling factor changes dpr
  // without necessarily resizing the viewport, and the media query only matches the
  // dpr it was created with — so re-arm it against the new value on every change.
  function watchDpr(): void {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener(
      "change",
      () => {
        fitRenderer();
        watchDpr();
      },
      { once: true },
    );
  }
  watchDpr();
  fitRenderer();

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

    // Before the accumulator, so the steps below run against this frame's pad
    // state rather than the previous one's. The repeat clock is clamped for the
    // same reason the accumulator is: a tab that was backgrounded for ten seconds
    // must not come back and scroll the menu to the bottom.
    pad.poll(Math.min(frameTime / 1000, MAX_FRAME_SECONDS), menu.visible);
    applyPadMenuCodes();

    // Scaled before clamping, so slow motion buys a longer wall-clock budget
    // rather than being cut off at the same quarter second real time is.
    // An open menu contributes no simulation time, for the same reason a pause
    // does: the accumulator must not fill behind it and then discharge the whole
    // backlog the moment it closes.
    const elapsed = menu.visible ? 0 : debug.scaleElapsed((now - last) / 1000);
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
    // A no-op unless the window moved to a display that changed the integer zoom.
    menu.setPixelScale(created.pixelScale);

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
