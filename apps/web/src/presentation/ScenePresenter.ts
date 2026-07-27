import type { Container } from "pixi.js";
import type { DecorationInstance } from "@mmx/content-schema";
import type { GameplaySounds } from "@mmx/browser-audio";
import type { Enemy, LifeCapsule, Player, Scene, Stage, WeaponCapsule } from "@mmx/engine";
import type { AssetCatalog } from "@mmx/renderer-pixi";
import { createScenePresentation, type ScenePresentation } from "@mmx/renderer-pixi/presentation";
import type { DebugRenderOptions } from "@mmx/renderer-pixi/debug";

export interface ScenePresenterOptions {
  sounds: GameplaySounds;
  onPlayerDeath: () => void;
  onWeaponChanged: (weapon: string) => void;
  assets: AssetCatalog;
  decorations?: readonly DecorationInstance[];
}

export class ScenePresenter {
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
    this.presentation = await createScenePresentation(canvas, scene, {
      assets: this.options.assets,
      decorations: this.options.decorations,
    });
  }

  fit(preferredScale?: number): void {
    this.presentation?.fit(preferredScale);
  }

  get uiLayer(): Container {
    if (!this.presentation) throw new Error("ScenePresenter.create must resolve first");
    return this.presentation.uiLayer;
  }

  attach(scene: Scene): void {
    this.pendingScene = scene;
    this.sounds.attachScene(scene);
    this.attachWebPlayer(scene.player);
    this.presentation?.bindScene(scene);
  }

  private attachWebPlayer(player: Player): void {
    if (this.webPlayers.has(player)) return;
    this.webPlayers.add(player);

    player.events.on("death", () => this.options.onPlayerDeath());
    player.events.on("weapon_changed", (weapon: string) => {
      this.options.onWeaponChanged(weapon);
    });
  }

  attachEnemy(enemy: Enemy): void {
    this.sounds.attachEnemy(enemy);
    this.presentation?.attachEnemy(enemy);
  }

  attachPickup(pickup: LifeCapsule): void {
    this.presentation?.attachPickup(pickup);
  }

  attachWeaponCapsule(capsule: WeaponCapsule): void {
    this.presentation?.attachWeaponCapsule(capsule);
  }

  stepCosmetics(scene: Scene, dt: number): void {
    this.presentation?.stepCosmetics(scene, dt);
  }

  updateOverlay(_scene: Scene, shapesVisible: boolean, spriteVisible: boolean): void {
    this.presentation?.setDebugOptions({
      collisionGeometry: shapesVisible,
      actorBounds: shapesVisible,
      sensors: shapesVisible,
      projectiles: shapesVisible,
      cameraZones: shapesVisible,
      spriteBounds: spriteVisible,
    } satisfies Partial<DebugRenderOptions>);
  }

  render(scene: Scene): void {
    this.presentation?.render(scene);
  }

  stats(): Record<string, string | number> {
    return this.presentation?.stats() ?? {};
  }
}
