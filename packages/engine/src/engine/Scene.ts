import { Input } from "../core/Input.js";
import { DT } from "../core/constants.js";
import { applyInput } from "../core/Replay.js";
import { Camera } from "./Camera.js";
import type { Enemy } from "./Enemy.js";
import { spawnEnemy } from "./enemies/index.js";
import { CAMERA_ZONES, ENEMY_SPAWNS, LEVEL, SPAWN, makeWorld } from "./level.js";
import { Player } from "./Player.js";
import { Stage } from "./Stage.js";
import type { World } from "./World.js";

/**
 * One playthrough, built from a seed and nothing else.
 *
 * This exists so that "start a run" is a single expression rather than twenty
 * lines of wiring copied between main.ts, the headless sim and the tests. That
 * matters more than the deduplication: restart-from-checkpoint works by throwing
 * the whole scene away and building a fresh one, and a debug tool that rebuilds
 * the world *slightly* differently from how the game built it is a tool that
 * reproduces the wrong bug.
 *
 * Everything that varies between runs is derived from `seed`, so two scenes with
 * the same seed fed the same inputs produce byte-identical state. The default
 * seed is the {@link Rng} default, which is what the actors used when they were
 * constructed with no seed at all.
 */

export const DEFAULT_SEED = 0x9e3779b9;

export interface SceneOptions {
  seed?: number;
  /**
   * Called for each enemy as it spawns, before the first tick. The browser uses
   * it to attach clip data and audio; the headless sim passes nothing and the
   * enemies run without either.
   */
  onEnemySpawned?: (enemy: Enemy, index: number) => void;
}

export class Scene {
  readonly world: World;
  readonly player: Player;
  readonly stage: Stage;
  readonly camera: Camera;
  readonly input: Input;
  readonly seed: number;

  /** Fixed steps executed since the scene was built — the simulation frame number. */
  frame = 0;

  private constructor(seed: number, options: SceneOptions) {
    this.seed = seed;
    this.input = new Input();
    this.world = makeWorld();
    this.player = new Player(this.world, SPAWN.x, SPAWN.y, this.input, seed);
    this.camera = new Camera(this.world.widthPx, this.world.heightPx);
    this.camera.setZones(CAMERA_ZONES);
    this.camera.snapTo(this.player.pos.x, this.player.pos.y);
    this.stage = new Stage(this.world, this.player);

    for (const [i, spawn] of ENEMY_SPAWNS.entries()) {
      // Each enemy needs its own stream — they draw from it at different rates,
      // so one shared generator would make a Metool's patrol depend on how often
      // a bat happened to reroll its hover. Derived from the scene seed so the
      // whole run still keys off one number.
      const enemy = spawnEnemy(
        spawn.kind,
        this.world,
        spawn.x,
        spawn.y,
        spawn.facing,
        enemySeed(seed, i),
      );
      options.onEnemySpawned?.(enemy, i);
      this.stage.add(enemy);
    }
  }

  static create(options: SceneOptions = {}): Scene {
    return new Scene(options.seed ?? DEFAULT_SEED, options);
  }

  /** The level this scene was built from — recorded so replays cannot cross levels. */
  get levelId(): string {
    return LEVEL.identifier;
  }

  /**
   * Advance exactly one fixed step under the given input mask.
   *
   * The mask is applied *before* the tick rather than being polled during it,
   * which is the property replay depends on: live play records the mask at this
   * same point, so a recorded run and its replay present identical input to
   * identical state on every tick.
   */
  step(mask: number): void {
    applyInput(this.input, mask);
    this.stage.tick(DT);
    this.camera.followTarget(
      {
        x: this.player.pos.x,
        y: this.player.pos.y,
        velocityX: this.player.final_velocity.x,
        velocityY: this.player.final_velocity.y,
        grounded: this.player.is_on_floor(),
      },
      DT,
    );
    this.frame++;
  }

  /**
   * A compact fingerprint of simulation state, for asserting that a replay
   * landed where it did when it was recorded.
   *
   * Positions are quantised to 1/64px before hashing. Rounding at all is a
   * deliberate weakening: the port is deterministic within a build, but pinning
   * raw float bits would turn any harmless refactor of the physics order into a
   * test failure, and the thing worth guarding is that the run ends in the same
   * *place* with the same health and state, not that every mantissa bit survived.
   */
  digest(): string {
    const parts: (string | number)[] = [
      this.frame,
      q(this.player.pos.x),
      q(this.player.pos.y),
      q(this.player.velocity.x),
      q(this.player.velocity.y),
      this.player.current_health,
      this.player.stateString(),
      this.player.projectiles.length,
    ];
    for (const enemy of this.stage.enemies) {
      parts.push(enemy.kind, q(enemy.pos.x), q(enemy.pos.y), enemy.current_health);
    }
    return fnv1a(parts.join("|"));
  }
}

/** Per-enemy seed, mixed so adjacent indices do not produce correlated streams. */
function enemySeed(seed: number, index: number): number {
  return (Math.imul(seed ^ (index + 1), 0x9e3779b1) >>> 0) >>> 0;
}

function q(v: number): number {
  return Math.round(v * 64) / 64;
}

/** FNV-1a, as an 8-character hex string. Not cryptographic; just stable and short. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
