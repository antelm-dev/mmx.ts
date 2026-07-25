import { DT, VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine/core/constants.js";
import type { Scene } from "@mmx/engine/game/Scene.js";
import type { AnimData } from "@mmx/engine/game/Animation.js";
import {
  DASH_TRAIL,
  DashSmoke,
  EnemyDebris,
  EnemyExplosion,
  Renderer,
  Trail,
  WALLSLIDE_TRAIL,
  animData,
  spriteSnapshot,
} from "@mmx/renderer-pixi";

/**
 * The Pixi side of a playtest: the game {@link Renderer}, the cosmetic effect
 * emitters, the canvas, and the {@link ResizeObserver} that keeps the view
 * pixel-perfect. Everything visual and browser-owned lives here; the simulation
 * lives in the engine's tooling session.
 *
 * The one subtlety is scene replacement. A rewind (restart / seek) builds a
 * brand-new {@link Scene} with a new player and new enemies, so the cosmetic
 * event listeners — which are wired onto those objects' event buses — have to be
 * re-bound. {@link bindScene} does that idempotently, tracking which scene it is
 * currently bound to so repeated calls never double-subscribe.
 */
export class PlaytestRenderer {
  private readonly trail = new Trail();
  private readonly smoke = new DashSmoke();
  private readonly explosion = new EnemyExplosion();
  private readonly debris = new EnemyDebris();

  private boundScene: Scene | null = null;
  private readonly resizeObserver: ResizeObserver;

  private constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Renderer,
  ) {
    this.resizeObserver = new ResizeObserver(() => this.fit());
  }

  static async create(host: HTMLElement, scene: Scene): Promise<PlaytestRenderer> {
    const canvas = document.createElement("canvas");
    canvas.id = "play-canvas";
    Object.assign(canvas.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      imageRendering: "pixelated",
    });
    host.append(canvas);

    let renderer: Renderer;
    try {
      renderer = await Renderer.create(canvas, scene.stage);
    } catch (error) {
      // The caller may have unmounted while we awaited the async GPU init; either
      // way, do not leak the canvas we appended.
      canvas.remove();
      throw error;
    }

    const instance = new PlaytestRenderer(host, canvas, renderer);
    instance.bindScene(scene);
    instance.fit();
    instance.resizeObserver.observe(host);
    return instance;
  }

  /**
   * Point the cosmetics (and the player's sprite data) at `scene`, wiring the
   * effect listeners onto its fresh player and enemies. A no-op if already bound
   * to this exact scene instance, so it is safe to call after every rewind.
   */
  bindScene(scene: Scene): void {
    if (this.boundScene === scene) return;
    this.boundScene = scene;

    // A rebuilt scene has a new Player; enemies/pickups get their clip data from
    // the tooling session's spawn callbacks, but the player is loaded here.
    scene.player.loadAnimations(animData as unknown as AnimData);

    scene.player.events.on("dash_smoke", (clip: string, dir: number) => {
      // Only react while this scene is still the bound one — a stale listener on a
      // discarded scene can never fire again once its event bus is gone, but the
      // guard also stops an in-flight event from a just-replaced scene.
      if (this.boundScene !== scene) return;
      this.smoke.spawn(scene.player.pos.x, scene.player.pos.y, clip, dir);
    });
    for (const enemy of scene.stage.enemies) {
      enemy.events.on("zero_health", () => {
        if (this.boundScene !== scene) return;
        this.explosion.spawn(enemy.pos.x, enemy.pos.y);
        this.debris.spawn(enemy.pos.x, enemy.pos.y);
      });
    }
  }

  /** Sample the frame-rate-independent cosmetic emitters after a fixed step. */
  sampleCosmetics(scene: Scene): void {
    const player = scene.player;
    const style = player.is_executing_either(["Dash", "AirDash"])
      ? DASH_TRAIL
      : player.is_executing("WallSlide")
        ? WALLSLIDE_TRAIL
        : null;
    this.trail.sample(DT, style ? spriteSnapshot(player) : null, style ?? DASH_TRAIL);
    this.smoke.tick(DT);
    this.explosion.tick(DT);
    this.debris.tick(DT);
  }

  /** Draw the current state of `scene`. */
  render(scene: Scene): void {
    this.renderer.render(scene.stage, scene.camera, this.trail, this.smoke, this.explosion, this.debris);
  }

  private fit(): void {
    const scale = Math.max(
      1,
      Math.floor(Math.min(this.host.clientWidth / VIEW_WIDTH, this.host.clientHeight / VIEW_HEIGHT)),
    );
    this.renderer.fit(scale);
  }

  /** Tear down: stop observing, destroy the Pixi app, drop the canvas. */
  destroy(): void {
    this.boundScene = null;
    this.resizeObserver.disconnect();
    this.renderer.destroy();
    this.canvas.remove();
  }
}
