import { DT, VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine/core/constants.js";
import type { Scene } from "@mmx/engine/game/Scene.js";
import type { AnimData } from "@mmx/asset-schema";
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
      canvas.remove();
      throw error;
    }

    const instance = new PlaytestRenderer(host, canvas, renderer);
    instance.bindScene(scene);
    instance.fit();
    instance.resizeObserver.observe(host);
    return instance;
  }

  bindScene(scene: Scene): void {
    if (this.boundScene === scene) return;
    this.boundScene = scene;

    scene.player.loadAnimations(animData as unknown as AnimData);

    scene.player.events.on("dash_smoke", (clip: string, dir: number) => {
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

  render(scene: Scene): void {
    this.renderer.render(
      scene.stage,
      scene.camera,
      this.trail,
      this.smoke,
      this.explosion,
      this.debris,
    );
  }

  private fit(): void {
    const scale = Math.max(
      1,
      Math.floor(
        Math.min(this.host.clientWidth / VIEW_WIDTH, this.host.clientHeight / VIEW_HEIGHT),
      ),
    );
    this.renderer.fit(scale);
  }

  destroy(): void {
    this.boundScene = null;
    this.resizeObserver.disconnect();
    this.renderer.destroy();
    this.canvas.remove();
  }
}
