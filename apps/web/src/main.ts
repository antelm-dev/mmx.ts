import { LEVEL_CATALOG } from "@mmx/engine/engine/level.js";
import { DesktopBridge } from "./DesktopBridge.js";
import { SoundEffects } from "./SoundEffects.js";
import { DebugPanel } from "./debug/DebugPanel.js";
import { AnimationInspector } from "./debug/AnimationInspector.js";
import { DebugSession } from "./debug/DebugSession.js";
import { InputBinding } from "./input/InputBinding.js";
import { ScenePresenter } from "./presentation/ScenePresenter.js";
import { ReplayIntegration } from "./replay/ReplayIntegration.js";
import { GameRuntime } from "./runtime/GameRuntime.js";
import { AppLifecycle } from "./runtime/AppLifecycle.js";
import { SettingsModel } from "./settings/SettingsModel.js";
import { SettingsMenuController } from "./settings/SettingsMenuController.js";
import { HomeScreen } from "./ui/HomeScreen.js";
import { loadUiFont } from "./ui/font.js";

/**
 * Entry point: construction and wiring only. Every actual concern —
 * rendering, input, window lifecycle, the frame loop, settings, replay
 * I/O — lives in its own module (see runtime/, input/, presentation/,
 * settings/, replay/) with a narrow surface, so this file's only job is to
 * build them and connect the handful of callbacks that only make sense at
 * the composition root: which debug key does what, and how the home screen
 * and the settings menu hand control back and forth.
 */

const sounds = new SoundEffects();
const desktop = new DesktopBridge();

// Forward-declared: each is referenced from a callback constructed before it
// exists (e.g. the settings menu's "back to home" action needs `home`, which
// isn't built until after the menu is). By the time any of these callbacks
// actually runs, every one of them has been assigned below.
let debug: DebugSession;
let home: HomeScreen;
let input: InputBinding;

const model = new SettingsModel({ desktop, onNotice: (message) => debug.notify(message) });

const presenter = new ScenePresenter({
  sounds,
  onPlayerDeath: () => debug.restartLevel(),
});

const lifecycle = new AppLifecycle(desktop, model, presenter, (message) => debug.notify(message));

debug = new DebugSession({
  onEnemySpawned: (enemy) => presenter.attachEnemy(enemy),
  onPickupSpawned: (pickup) => presenter.attachPickup(pickup),
  onSceneReplaced: (scene) => presenter.attach(scene),
  extraDiagnostics: () => presenter.stats(),
  replayFiles: desktop.replays,
});

debug.registerCommand({
  code: "F8",
  label: "F8",
  description: "toggle pause on focus loss",
  run: () => model.setPauseOnBlur(!model.get().pauseOnBlur),
});
debug.registerCommand({
  code: "F9",
  label: "F9",
  description: "volume down",
  run: () => model.adjustVolume(-0.1),
});
debug.registerCommand({
  code: "F10",
  label: "F10",
  description: "volume up",
  run: () => model.adjustVolume(0.1),
});
debug.registerCommand({
  code: "F11",
  label: "F11",
  description: "toggle fullscreen",
  run: () => lifecycle.setFullscreen(!model.get().fullscreen),
});

// --- home and settings menus ------------------------------------------------

let settingsFromHome = false;

const menu = new SettingsMenuController({
  model,
  lifecycle,
  sounds,
  releaseAllKeys: () => input.releaseAll(),
  onMainMenu: () => {
    settingsFromHome = false;
    menu.close();
    input.releaseAll();
    home.open();
  },
  onVisibilityChange: (visible) => {
    // Keys held on the way in would stay held for as long as the menu is up,
    // and X would be mid-run the instant it closes.
    if (visible) {
      input.releaseAll();
      void model.refreshMaxScale();
    } else if (settingsFromHome) {
      settingsFromHome = false;
      home.open();
    }
  },
});

home = new HomeScreen({
  levels: LEVEL_CATALOG,
  onPlay: (level) => {
    debug.loadLevel(level);
    home.close();
    input.releaseAll();
  },
  onSettings: () => {
    settingsFromHome = true;
    home.close();
    // Opaque: there is no run in progress behind the title screen, just the
    // idle scene the game boots into, and showing it through the pause scrim
    // would read as a glitch rather than a paused game.
    menu.open(true);
  },
});

input = new InputBinding({
  getBindings: () => model.get().bindings,
  menu,
  home,
  debug,
  sounds,
  isPauseOnBlur: () => model.get().pauseOnBlur,
});

presenter.attach(debug.scene);

async function main(): Promise<void> {
  await model.load();
  sounds.setMasterVolume(model.get().masterVolume);
  await lifecycle.applyInitial();

  await new ReplayIntegration(desktop, debug).start();

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const panel = new DebugPanel(debug);
  const animationInspector = new AnimationInspector(debug);

  // The UI face loads alongside the atlas and the audio, and is awaited with them:
  // the menu's labels are built at module scope and Pixi rasterises a Text the
  // first time it draws, so the face has to be in before any frame goes out.
  await Promise.all([presenter.create(canvas, debug.scene.stage), sounds.load(), loadUiFont()]);
  presenter.uiLayer.addChild(home.view, menu.view);
  // The title screen is what a fresh launch should show; explicit rather than
  // relying on whatever Pixi's Container.visible defaults to.
  home.open();

  lifecycle.watch();

  new GameRuntime({ debug, input, presenter, panel, animationInspector, menu, home }).start();
}

// Not top-level await: the build targets es2020, which predates it.
void main();

// expose for quick console poking
(window as any).mmx = debug;
