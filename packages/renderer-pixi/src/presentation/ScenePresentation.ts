import type { Container } from "pixi.js";
import type { DecorationInstance } from "@mmx/content-schema";
import type {
  Camera,
  Enemy,
  LifeCapsule,
  Scene,
  Stage,
  WeaponCapsule,
} from "@mmx/engine";
import { DashSmoke } from "../DashSmoke.js";
import { EnemyDebris } from "../EnemyDebris.js";
import { EnemyExplosion } from "../EnemyExplosion.js";
import { createAssetCatalog, type AssetCatalog } from "../editor/catalog.js";
import { spriteSnapshot } from "../render/sprite.js";
import { DASH_TRAIL, Trail } from "../Trail.js";
import { dashSmokeOrigin, selectTrailStyle } from "./cosmetics.js";

export interface ScenePresentation {
  bindScene(scene: Scene): void;
  attachEnemy(enemy: Enemy): void;
  attachPickup(pickup: LifeCapsule): void;
  attachWeaponCapsule(capsule: WeaponCapsule): void;
  stepCosmetics(scene: Scene, dt: number): void;
  render(scene: Scene): void;
  fit(preferredScale?: number): void;
  setDecorations(decorations: readonly DecorationInstance[]): void;
  readonly pixelScale: number;
  stats(): Record<string, string | number>;
  readonly uiLayer: Container;
  readonly worldOverlay: Container;
  destroy(): void;
}

export interface ScenePresentationOptions {
  assets?: AssetCatalog;
  decorations?: readonly DecorationInstance[];
}

export interface ScenePresentationHost {
  setStage(stage: Stage): void;
  render(
    stage: Stage,
    camera: Camera,
    trail: Trail,
    smoke: DashSmoke,
    explosion: EnemyExplosion,
    debris: EnemyDebris,
  ): void;
  destroy(): void;
  fit(preferredScale?: number): void;
  setDecorations(instances: readonly DecorationInstance[]): void;
  readonly pixelScale: number;
  stats(): Record<string, string | number>;
  readonly uiLayer: Container;
  readonly worldOverlay: Container;
}

export interface ScenePresentationEffects {
  trail: Trail;
  smoke: DashSmoke;
  explosion: EnemyExplosion;
  debris: EnemyDebris;
}

export interface CreateScenePresentationWithHostOptions extends ScenePresentationOptions {
  effects?: ScenePresentationEffects;
}

class ScenePresentationImpl implements ScenePresentation {
  private boundScene: Scene | null = null;
  private destroyed = false;
  private readonly attachedPlayers = new WeakSet<object>();
  private readonly attachedEnemies = new WeakSet<object>();
  private readonly attachedPickups = new WeakSet<object>();
  private readonly attachedWeaponCapsules = new WeakSet<object>();
  private readonly trail: Trail;
  private readonly smoke: DashSmoke;
  private readonly explosion: EnemyExplosion;
  private readonly debris: EnemyDebris;

  constructor(
    private readonly host: ScenePresentationHost,
    private readonly assets: AssetCatalog,
    effects?: ScenePresentationEffects,
  ) {
    this.trail = effects?.trail ?? new Trail();
    this.smoke = effects?.smoke ?? new DashSmoke();
    this.explosion = effects?.explosion ?? new EnemyExplosion();
    this.debris = effects?.debris ?? new EnemyDebris();
  }

  get pixelScale(): number {
    return this.host.pixelScale;
  }

  get uiLayer(): Container {
    return this.host.uiLayer;
  }

  get worldOverlay(): Container {
    return this.host.worldOverlay;
  }

  bindScene(scene: Scene): void {
    this.assertLive();
    this.boundScene = scene;
    this.attachPlayer(scene.player);
    for (const enemy of scene.stage.enemies) this.attachEnemy(enemy);
    for (const pickup of scene.stage.pickups) this.attachPickup(pickup);
    for (const capsule of scene.stage.weaponCapsules) this.attachWeaponCapsule(capsule);
    this.trail.clear();
    this.smoke.clear();
    this.explosion.clear();
    this.debris.clear();
    this.host.setStage(scene.stage);
  }

  attachEnemy(enemy: Enemy): void {
    this.assertLive();
    if (this.attachedEnemies.has(enemy)) return;
    this.attachedEnemies.add(enemy);
    this.assets.attachEnemyAnimations(enemy);
    enemy.events.on("zero_health", () => {
      if (this.destroyed) return;
      const bound = this.boundScene;
      if (!bound?.stage.enemies.includes(enemy)) return;
      this.explosion.spawn(enemy.pos.x, enemy.pos.y);
      this.debris.spawn(enemy.pos.x, enemy.pos.y);
    });
  }

  attachPickup(pickup: LifeCapsule): void {
    this.assertLive();
    if (this.attachedPickups.has(pickup)) return;
    this.attachedPickups.add(pickup);
    this.assets.attachLifeCapsuleAnimations(pickup);
  }

  attachWeaponCapsule(capsule: WeaponCapsule): void {
    this.assertLive();
    if (this.attachedWeaponCapsules.has(capsule)) return;
    this.attachedWeaponCapsules.add(capsule);
    this.assets.attachWeaponCapsuleAnimations(capsule);
  }

  stepCosmetics(scene: Scene, dt: number): void {
    this.assertLive();
    const style = selectTrailStyle(scene.player);
    this.trail.sample(dt, style ? spriteSnapshot(scene.player) : null, style ?? DASH_TRAIL);
    this.smoke.tick(dt);
    this.explosion.tick(dt);
    this.debris.tick(dt);
  }

  render(scene: Scene): void {
    this.assertLive();
    this.host.render(scene.stage, scene.camera, this.trail, this.smoke, this.explosion, this.debris);
  }

  fit(preferredScale?: number): void {
    this.assertLive();
    this.host.fit(preferredScale);
  }

  setDecorations(decorations: readonly DecorationInstance[]): void {
    this.assertLive();
    this.host.setDecorations(decorations);
  }

  stats(): Record<string, string | number> {
    this.assertLive();
    return this.host.stats();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.boundScene = null;
    this.trail.clear();
    this.smoke.clear();
    this.explosion.clear();
    this.debris.clear();
    this.host.destroy();
  }

  private attachPlayer(player: Scene["player"]): void {
    if (this.attachedPlayers.has(player)) return;
    this.attachedPlayers.add(player);
    this.assets.attachPlayerAnimations(player);
    player.events.on("dash_smoke", (clip: string, dir: number) => {
      if (this.destroyed) return;
      if (this.boundScene?.player !== player) return;
      const origin = dashSmokeOrigin(player, dir);
      this.smoke.spawn(origin.x, origin.y, clip, dir);
    });
  }

  private assertLive(): void {
    if (this.destroyed) throw new Error("ScenePresentation has been destroyed");
  }
}

export function createScenePresentationWithHost(
  host: ScenePresentationHost,
  scene: Scene,
  options: CreateScenePresentationWithHostOptions = {},
): ScenePresentation {
  const assets = options.assets ?? createAssetCatalog();
  const presentation = new ScenePresentationImpl(host, assets, options.effects);
  if (options.decorations) presentation.setDecorations(options.decorations);
  presentation.bindScene(scene);
  return presentation;
}

export async function createScenePresentation(
  canvas: HTMLCanvasElement,
  scene: Scene,
  options: ScenePresentationOptions = {},
): Promise<ScenePresentation> {
  const assets = options.assets ?? createAssetCatalog();
  await assets.load();
  const { Renderer } = await import("../render/Renderer.js");
  const renderer = await Renderer.create(canvas, scene.stage);
  try {
    return createScenePresentationWithHost(renderer, scene, { ...options, assets });
  } catch (error) {
    renderer.destroy();
    throw error;
  }
}
