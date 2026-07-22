import { DT, VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine/core/constants.js";
import { Input, type Action } from "@mmx/engine/core/Input.js";
import { packInput } from "@mmx/engine/core/Replay.js";
import { Scene } from "@mmx/engine/game/Scene.js";
import type { AnimData } from "@mmx/engine/game/Animation.js";
import { documentToLevelData, type LevelDocument } from "@mmx/content-schema";
import {
  DASH_TRAIL,
  DashSmoke,
  EnemyDebris,
  EnemyExplosion,
  Renderer,
  Trail,
  WALLSLIDE_TRAIL,
  animData,
  enemyAnims,
  pickupAnims,
  spriteSnapshot,
} from "@mmx/renderer-pixi";

/**
 * A live playthrough of the current document, driven by the *real* engine and
 * Pixi renderer — the same `Scene`/`Renderer` the game uses.
 *
 * It is built from a fresh {@link LevelDocument} → `LevelData` conversion and
 * never touches the editor document, so stopping returns to the untouched
 * authored level. Audio is intentionally omitted (the editor has no sound stack);
 * everything else — physics, camera, sprites, cosmetics — is the shipping path.
 */
const KEY_MAP: Record<string, Action> = {
  ArrowLeft: "move_left",
  KeyA: "move_left",
  ArrowRight: "move_right",
  KeyD: "move_right",
  ArrowUp: "move_up",
  KeyW: "move_up",
  ArrowDown: "move_down",
  KeyS: "move_down",
  Space: "jump",
  KeyZ: "jump",
  KeyK: "dash",
  KeyX: "dash",
  ShiftLeft: "dash",
  KeyC: "fire",
  KeyJ: "fire",
  KeyQ: "weapon_left",
  KeyE: "weapon_right",
};

const MAX_FRAME_SECONDS = 0.25;

export class PlaySession {
  private raf = 0;
  private acc = 0;
  private last = 0;
  private readonly input = new Input();
  private readonly trail = new Trail();
  private readonly smoke = new DashSmoke();
  private readonly explosion = new EnemyExplosion();
  private readonly debris = new EnemyDebris();
  private stopped = false;

  private constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private readonly renderer: Renderer,
    private readonly onError: (message: string) => void,
  ) {}

  static async start(
    host: HTMLElement,
    doc: LevelDocument,
    onError: (message: string) => void,
  ): Promise<PlaySession> {
    const level = documentToLevelData(doc);
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

    const scene = Scene.create({
      level,
      onEnemySpawned: (enemy) => {
        enemy.loadAnimations(enemyAnims.actors[enemy.stats.sheet] as unknown as AnimData);
      },
      onPickupSpawned: (pickup) => {
        pickup.loadAnimations(pickupAnims.actors[pickup.kind] as unknown as AnimData);
      },
      onWeaponCapsuleSpawned: (capsule) => {
        capsule.loadAnimations(pickupAnims.actors[capsule.sheet] as unknown as AnimData);
      },
    });
    scene.player.loadAnimations(animData as unknown as AnimData);

    const renderer = await Renderer.create(canvas, scene.stage);
    const session = new PlaySession(host, canvas, scene, renderer, onError);
    session.wireCosmetics();
    session.wireInput();
    session.fit();
    session.resizeObserver.observe(host);
    session.start();
    return session;
  }

  private readonly resizeObserver = new ResizeObserver(() => this.fit());

  private fit(): void {
    const scale = Math.max(
      1,
      Math.floor(
        Math.min(this.host.clientWidth / VIEW_WIDTH, this.host.clientHeight / VIEW_HEIGHT),
      ),
    );
    this.renderer.fit(scale);
  }

  private wireCosmetics(): void {
    this.scene.player.events.on("dash_smoke", (clip: string, dir: number) => {
      this.smoke.spawn(this.scene.player.pos.x, this.scene.player.pos.y, clip, dir);
    });
    for (const enemy of this.scene.stage.enemies) {
      enemy.events.on("zero_health", () => {
        this.explosion.spawn(enemy.pos.x, enemy.pos.y);
        this.debris.spawn(enemy.pos.x, enemy.pos.y);
      });
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (action) {
      this.input.setDown(action, true);
      e.preventDefault();
    }
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (action) {
      this.input.setDown(action, false);
      e.preventDefault();
    }
  };

  private wireInput(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private start(): void {
    this.last = performance.now();
    const frame = (now: number): void => {
      if (this.stopped) return;
      const elapsed = Math.min(MAX_FRAME_SECONDS, (now - this.last) / 1000);
      this.last = now;
      this.acc += elapsed;
      try {
        while (this.acc >= DT) {
          this.scene.step(packInput(this.input));
          this.sampleCosmetics();
          this.acc -= DT;
        }
        this.renderer.render(
          this.scene.stage,
          this.scene.camera,
          this.trail,
          this.smoke,
          this.explosion,
          this.debris,
        );
      } catch (error) {
        this.onError(error instanceof Error ? error.message : String(error));
        this.stopped = true;
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private sampleCosmetics(): void {
    const player = this.scene.player;
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

  /** Tear down the run: stop the loop, drop listeners, destroy the renderer. */
  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.destroy();
    this.canvas.remove();
  }
}
