import { LEVEL_CATALOG } from "@mmx/engine";
import { GameplaySounds, SoundEffects } from "@mmx/browser-audio";
import { DesktopBridge } from "./DesktopBridge.js";
import { DebugPanel } from "./debug/DebugPanel.js";
import { AnimationInspector } from "./debug/AnimationInspector.js";
import { DebugSession } from "./debug/DebugSession.js";
import { InputBinding } from "./input/InputBinding.js";
import { ScenePresenter } from "./presentation/ScenePresenter.js";
import {
  createProjectAssetCatalog,
  createProjectSoundAssetResolver,
  decorationsForLevel,
  entryLevel,
  loadProjectBundle,
  projectLevelCatalog,
} from "./project/projectRuntime.js";
import { ReplayIntegration } from "./replay/ReplayIntegration.js";
import { GameRuntime } from "./runtime/GameRuntime.js";
import { AppLifecycle } from "./runtime/AppLifecycle.js";
import { SettingsModel } from "./settings/SettingsModel.js";
import { SettingsMenuController } from "./settings/SettingsMenuController.js";
import { HomeScreen } from "./ui/HomeScreen.js";
import { loadUiFont } from "./ui/font.js";

async function bootstrap(): Promise<void> {
  const projectBundle = await loadProjectBundle();
  const levelCatalog = projectBundle ? projectLevelCatalog(projectBundle) : LEVEL_CATALOG;

  const sounds = projectBundle
    ? new SoundEffects({
        resolver: createProjectSoundAssetResolver(projectBundle),
        soundIds: projectBundle.soundIds,
      })
    : new SoundEffects();
  const gameplaySounds = new GameplaySounds(sounds);
  const desktop = new DesktopBridge();

  let debug: DebugSession;
  let home: HomeScreen;
  let input: InputBinding;

  const model = new SettingsModel({ desktop, onNotice: (message) => debug.notify(message) });

  const presenter = new ScenePresenter({
    sounds: gameplaySounds,
    onPlayerDeath: () => debug.restartLevel(),
    onWeaponChanged: (weapon) => debug.notify(`weapon: ${weapon}`),
    assets: projectBundle ? createProjectAssetCatalog(projectBundle) : undefined,
    decorations: projectBundle
      ? decorationsForLevel(projectBundle, projectBundle.meta.entryLevelId)
      : undefined,
  });

  const lifecycle = new AppLifecycle(desktop, model, presenter, (message) => debug.notify(message));

  debug = new DebugSession({
    onEnemySpawned: (enemy) => presenter.attachEnemy(enemy),
    onPickupSpawned: (pickup) => presenter.attachPickup(pickup),
    onWeaponCapsuleSpawned: (capsule) => presenter.attachWeaponCapsule(capsule),
    onSceneReplaced: (scene) => presenter.attach(scene),
    extraDiagnostics: () => presenter.stats(),
    replayFiles: desktop.replays,
    clipboard: desktop.clipboard,
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
    levels: levelCatalog,
    onPlay: (level) => {
      debug.loadLevel(level);
      home.close();
      input.releaseAll();
    },
    onSettings: () => {
      settingsFromHome = true;
      home.close();
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

  await model.load();
  if (projectBundle) {
    debug.loadLevel(entryLevel(projectBundle));
  }

  const applyVolume = (volume: number): void => {
    sounds.setMasterVolume(volume);
  };
  applyVolume(model.get().masterVolume);
  model.storeRef.subscribe((settings) => applyVolume(settings.audio.masterVolume));
  await lifecycle.applyInitial();

  await new ReplayIntegration(desktop, debug).start();

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const panel = new DebugPanel(debug);
  const animationInspector = new AnimationInspector(debug);

  await Promise.all([presenter.create(canvas, debug.scene.stage), sounds.load(), loadUiFont()]);
  presenter.uiLayer.addChild(home.view, menu.view);
  home.open();

  lifecycle.watch();

  new GameRuntime({ debug, input, presenter, panel, animationInspector, menu, home }).start();

  (window as any).mmx = debug;
}

void bootstrap();
