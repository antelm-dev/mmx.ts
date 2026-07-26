import type { Container } from "pixi.js";
import type { GameplaySounds } from "@mmx/browser-audio";
import type { Enemy, LifeCapsule, Player, Scene, Stage, WeaponCapsule } from "@mmx/engine";
import {
  createAssetCatalog,
  createScenePresentation,
  type ScenePresentation,
} from "@mmx/renderer-pixi";
import { DebugOverlay } from "../debug/DebugOverlay.js";

/**
 * Web adapter around {@link ScenePresentation}: sounds, player-death / weapon
 * callbacks, debug overlay, and UI-layer access. Shared Pixi cosmetics live in
 * @mmx/renderer-pixi.
 */
export interface ScenePresenterOptions {
  sounds: GameplaySounds;
  /**
   * Death's restart_delay is timed to the death sample, so by the time it
   * fires the death sound has already finished playing out.
   */
  onPlayerDeath: () => void;
  /** WeaponChanger.gd's selection changed — see {@link attachWebPlayer}. */
  onWeaponChanged: (weapon: string) => void;
}

export class ScenePresenter {
  private readonly overlay = new DebugOverlay();
  private presentation: ScenePresentation | null = null;
  private pendingScene: Scene | null = null;
  private readonly webPlayers = new WeakSet<object>();
  private readonly sounds: GameplaySounds;

  constructor(private readonly options: ScenePresenterOptions) {
    this.sounds = options.sounds;
  }

  get pixelScale(): number {
    return this.presentation?.pixelScale ?? 0;
  }

  async create(canvas: HTMLCanvasElement, _stage: Stage): Promise<void> {
    const scene = this.pendingScene;
    if (!scene) throw new Error("ScenePresenter.attach must run before create");
    const presentation = await createScenePresentation(canvas, scene, {
      assets: createAssetCatalog(),
    });
    presentation.worldOverlay.addChild(this.overlay.view);
    this.presentation = presentation;
  }

  /** See {@link ScenePresentation.fit}. A no-op before {@link create} resolves. */
  fit(preferredScale?: number): void {
    this.presentation?.fit(preferredScale);
  }

  /** Screen-space layer for menus — main.ts adds the home/settings views to it. */
  get uiLayer(): Container {
    if (!this.presentation) throw new Error("ScenePresenter.create must resolve first");
    return this.presentation.uiLayer;
  }

  /**
   * Attach to a scene — at startup, and again after every restart or replay load.
   *
   * Before {@link create} resolves, only the latest scene is remembered; bind
   * happens once the shared presentation exists.
   */
  attach(scene: Scene): void {
    this.pendingScene = scene;
    this.sounds.attachScene(scene);
    this.attachWebPlayer(scene.player);
    this.presentation?.bindScene(scene);
    this.overlay.reset();
  }

  private attachWebPlayer(player: Player): void {
    if (this.webPlayers.has(player)) return;
    this.webPlayers.add(player);

    player.events.on("death", () => this.options.onPlayerDeath());
    player.events.on("weapon_changed", (weapon: string) => {
      this.options.onWeaponChanged(weapon);
    });
  }

  /** {@link DebugSession}'s `onEnemySpawned` callback. */
  attachEnemy(enemy: Enemy): void {
    this.sounds.attachEnemy(enemy);
    this.presentation?.attachEnemy(enemy);
  }

  /** {@link DebugSession}'s `onPickupSpawned` callback. */
  attachPickup(pickup: LifeCapsule): void {
    this.presentation?.attachPickup(pickup);
  }

  /** {@link DebugSession}'s `onWeaponCapsuleSpawned` callback. */
  attachWeaponCapsule(capsule: WeaponCapsule): void {
    this.presentation?.attachWeaponCapsule(capsule);
  }

  /**
   * Cosmetic half of a fixed step — advances with the simulation's `dt`.
   */
  stepCosmetics(scene: Scene, dt: number): void {
    this.presentation?.stepCosmetics(scene, dt);
  }

  updateOverlay(scene: Scene, shapesVisible: boolean, spriteVisible: boolean): void {
    this.overlay.update(scene, scene.camera, shapesVisible, spriteVisible);
  }

  render(scene: Scene): void {
    this.presentation?.render(scene);
  }

  stats(): Record<string, string | number> {
    return this.presentation?.stats() ?? {};
  }
}
