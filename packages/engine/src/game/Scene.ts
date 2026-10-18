import { Input } from "../core/Input.js";
import { DT } from "../core/constants.js";
import { applyInput } from "../core/Replay.js";
import type { AnimData } from "@mmx/contracts/animation";
import { hashCanonical } from "../data/index.js";
import type { CompiledGameData } from "../data/types.js";
import { Camera } from "./Camera.js";
import type { Enemy } from "./Enemy.js";
import { spawnEnemy } from "./enemies/index.js";
import { loadLevel } from "./level.js";
import type { LevelData } from "./LevelData.js";
import type { LifeCapsule, WeaponCapsule } from "./Pickup.js";
import { DEFAULT_PLAYER_LOADOUT, Player } from "./Player.js";
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

/** How far below the bottom of the view the player may fall before a pit kills. */
const PIT_MARGIN = 32;

/**
 * Clip tables the scene owns: animation timing (`animation_finished`, so
 * `has_finished_last_animation`) and per-frame hurtboxes/hitboxes come from here
 * for every actor covered, whether or not a renderer attaches. A renderer must
 * not load clips into an actor whose {@link AbilityUser.sceneClips} is set.
 */
export interface SceneClips {
  /** The player's clip table (a renderer manifest's `playerAnims`). */
  player?: AnimData;
  /**
   * Enemy clip tables keyed by the enemy definition's `sheet`. When given, every
   * spawned enemy must have one.
   */
  enemies?: Readonly<Record<string, AnimData>>;
}

export interface SceneOptions {
  seed?: number;
  /** Authored level to instantiate. Core does not ship a built-in game level. */
  level: LevelData;
  /** Compiled player loadout id (a project's `player.loadout`); {@link DEFAULT_PLAYER_LOADOUT} when omitted. */
  loadoutId?: string;
  /**
   * Compiled game data the scene is built from — enemy, pickup, environment and
   * projectile definitions, loadouts. The engine's core ships no player, so this
   * must carry the loadout the scene plays (a project's packs and overlay).
   */
  gameData: CompiledGameData;
  /**
   * Gameplay clip data owned by the engine (see {@link SceneClips}). Absent: actors
   * run clip-less until a renderer attaches clips, as before. Folded into
   * {@link Scene.gameDataHash} so a replay cannot cross different clip timing or boxes.
   */
  clips?: SceneClips;
  /**
   * Called for each enemy as it spawns, before the first tick. The browser uses
   * it to attach clip data and audio; the headless sim passes nothing and the
   * enemies run without either.
   */
  onEnemySpawned?: (enemy: Enemy, index: number) => void;
  /**
   * Called for each Life Energy capsule as it spawns, before the first tick —
   * the browser uses it to attach clip data, same as {@link onEnemySpawned}.
   */
  onPickupSpawned?: (pickup: LifeCapsule, index: number) => void;
  /** Called for each Weapon Energy capsule as it spawns — same as {@link onPickupSpawned}. */
  onWeaponCapsuleSpawned?: (capsule: WeaponCapsule, index: number) => void;
}

export class Scene {
  readonly world: World;
  readonly player: Player;
  readonly stage: Stage;
  readonly camera: Camera;
  readonly input: Input;
  readonly seed: number;
  readonly level: LevelData;
  /**
   * Hash of the compiled game data this scene was built from, combined with the
   * gameplay part of {@link SceneOptions.clips} when given — recorded so replays
   * cannot cross either. Without clips it is exactly `gameData.hash`.
   */
  readonly gameDataHash: string;

  /** Fixed steps executed since the scene was built — the simulation frame number. */
  frame = 0;

  private constructor(seed: number, options: SceneOptions) {
    this.seed = seed;
    const gameData = options.gameData;
    const clips = options.clips;
    this.gameDataHash = clips ? hashWithClips(gameData.hash, clips) : gameData.hash;
    const level = loadLevel(options.level, gameData);
    this.level = level.data;
    this.input = new Input();
    this.world = level.world;
    this.player = new Player(
      this.world,
      level.spawn.x,
      level.spawn.y,
      this.input,
      seed,
      options.loadoutId ?? DEFAULT_PLAYER_LOADOUT,
      gameData,
    );
    if (clips?.player) {
      this.player.loadAnimations(clips.player);
      this.player.sceneClips = true;
    }
    this.camera = new Camera(this.world.widthPx, this.world.heightPx);
    this.camera.setZones(level.cameraZones);
    this.camera.snapTo(this.player.pos.x, this.player.pos.y);
    this.stage = new Stage(
      this.world,
      this.player,
      {
        hazards: level.hazards,
        conveyors: level.conveyors,
        platforms: level.platforms,
        fallingPlatforms: level.fallingPlatforms,
        pickups: level.pickups,
        weaponCapsules: level.weaponCapsules,
      },
      gameData,
    );

    for (const [i, spawn] of level.enemies.entries()) {
      // Each enemy needs its own stream — they draw from it at different rates,
      // so one shared generator would make a Metool's patrol depend on how often
      // a bat happened to reroll its hover. Derived from the scene seed so the
      // whole run still keys off one number.
      const enemy = spawnEnemy(
        gameData.enemies.get(spawn.kind)!,
        this.world,
        spawn.x,
        spawn.y,
        spawn.facing,
        enemySeed(seed, i),
        gameData,
      );
      // Carry the authored entity iid through as the enemy's runtime identity, so
      // an inspector can trace a live enemy back to the object that placed it.
      enemy.runtimeId = spawn.id;
      enemy.sourceEntityId = spawn.id;
      loadSceneEnemyClips(enemy, clips);
      options.onEnemySpawned?.(enemy, i);
      this.stage.add(enemy);
    }

    for (const [i, pickup] of this.stage.pickups.entries()) {
      options.onPickupSpawned?.(pickup, i);
    }
    for (const [i, capsule] of this.stage.weaponCapsules.entries()) {
      options.onWeaponCapsuleSpawned?.(capsule, i);
    }

    // Camera has already snapped to the spawn point above; only now does the
    // player's own position move (see Intro.ts), so the room's framing is fixed
    // while X descends into it instead of following him up off the top of it.
    this.player.beginIntro();
  }

  static create(options: SceneOptions): Scene {
    return new Scene(options.seed ?? DEFAULT_SEED, options);
  }

  /** The level this scene was built from — recorded so replays cannot cross levels. */
  get levelId(): string {
    return this.level.identifier;
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
    const recoveryWasActive = this.stage.recovering;
    this.stage.tick(DT);
    // Intro moves the player's own y off the floor and back down again (see
    // Intro.ts); the camera has to hold the room's framing rather than track that
    // scripted descent as if it were normal falling.
    if (!recoveryWasActive && !this.stage.recovering && !this.player.is_executing("Intro")) {
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
    }
    // MMX pit rule (zero-x-mashup Stage::in_pit): falling 32px past the bottom of
    // the screen in the current camera section is death. The reference measures
    // from the section's camera top (max_y + 224 + 32); a CameraZone bounds the
    // view itself, so its bottom is already max_y + 224.
    if (this.player.pos.y > this.camera.bottomLimit + PIT_MARGIN) this.player.kill();
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
      this.player.activeWeapon ?? "",
    ];
    for (const { id } of this.player.weapons) {
      const ammo = this.player.getWeaponAmmo(id);
      if (Number.isFinite(ammo)) parts.push("ammo", id, ammo);
    }
    for (const enemy of this.stage.enemies) {
      parts.push(enemy.kind, q(enemy.pos.x), q(enemy.pos.y), enemy.current_health);
    }
    for (const platform of this.stage.platforms) {
      parts.push("platform", q(platform.x), platform.direction);
      // Only vertical platforms add y, so horizontal-only digests are unchanged.
      if (platform.axis === "vertical") parts.push(q(platform.y));
    }
    for (const platform of this.stage.fallingPlatforms) {
      parts.push("falling", platform.id, q(platform.y), q(platform.elapsed ?? -1));
    }
    for (const pickup of this.stage.pickups) {
      parts.push("pickup", pickup.id, pickup.collecting ? 1 : 0);
    }
    for (const capsule of this.stage.weaponCapsules) {
      parts.push("weaponCapsule", capsule.id, capsule.collecting ? 1 : 0);
    }
    return fnv1a(parts.join("|"));
  }
}

/**
 * Load `enemy`'s table from `clips.enemies`, as the scene does at spawn. When
 * `clips.enemies` is given, every enemy's sheet must have one.
 */
export function loadSceneEnemyClips(enemy: Enemy, clips: SceneClips | undefined): void {
  if (!clips?.enemies) return;
  const table = clips.enemies[enemy.stats.sheet];
  if (!table) throw new Error(`scene clips have no table for enemy sheet '${enemy.stats.sheet}'`);
  enemy.loadAnimations(table);
  enemy.sceneClips = true;
}

/**
 * Only what gameplay reads goes into the hash — timing and boxes, keyed by clip
 * name — so re-cropping art (regions, anchors) does not invalidate replays.
 */
function hashWithClips(gameDataHash: string, clips: SceneClips): string {
  const gameplay = (data: AnimData | undefined, boxes: boolean) =>
    data &&
    Object.fromEntries(
      Object.entries(data.animations).map(([name, clip]) => [
        name,
        {
          loop: clip.loop,
          loopStart: clip.loopStart ?? 0,
          speed: clip.speed,
          frames: clip.frames.map((f) =>
            boxes
              ? { duration: f.duration, hurtbox: f.hurtbox ?? null, hitboxes: f.hitboxes ?? [] }
              : { duration: f.duration },
          ),
          // Only when present: stableStringify writes `undefined` as null, changing every hash.
          ...(clip.segments && {
            segments: clip.segments.map(({ name, start, end, loop }) => ({
              name,
              start,
              end,
              loop,
            })),
          }),
        },
      ]),
    );
  return hashCanonical({
    gameData: gameDataHash,
    // Timing only: include the player's boxes once Player/Stage read them.
    player: gameplay(clips.player, false) ?? null,
    enemies: clips.enemies
      ? Object.fromEntries(Object.entries(clips.enemies).map(([k, v]) => [k, gameplay(v, true)]))
      : null,
  });
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
