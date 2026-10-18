import { Enemy } from "./Enemy.js";
import { Player } from "./Player.js";
import {
  LifeCapsule,
  WeaponCapsule,
  type LifeCapsuleSpawn,
  type WeaponCapsuleSpawn,
} from "./Pickup.js";
import type { World } from "./World.js";
import { HIT_FX_FPS, HIT_FX_FRAME_COUNT } from "../core/constants.js";
import { COMPILED_GAME_DATA } from "../data/index.js";
import type { CompiledGameData, Knockback } from "../data/types.js";
import { computeDamage, type DamageEvent } from "./damage.js";
import type { DamageInflicter } from "./abilities/Damage.js";
import {
  FallingPlatform,
  MovingPlatform,
  type Conveyor,
  type FallingPlatformSpawn,
  type Hazard,
  type MovingPlatformSpawn,
} from "./Environment.js";

/**
 * A melee impact burst. Same clip timing as a spent shot's hit particle
 * (SpriteEffect, 4 frames at 32 fps); the renderer only reads `frame`.
 */
export interface HitSpark {
  clip: string;
  x: number;
  y: number;
  dir: number;
  age: number;
  frame: number;
}

export interface StageEnvironment {
  hazards?: readonly Hazard[];
  conveyors?: readonly Conveyor[];
  platforms?: readonly MovingPlatformSpawn[];
  fallingPlatforms?: readonly FallingPlatformSpawn[];
  pickups?: readonly LifeCapsuleSpawn[];
  weaponCapsules?: readonly WeaponCapsuleSpawn[];
}

/**
 * The room: the player, the enemies in it, and the interactions between them.
 *
 * Everything Godot expressed as Area2D layer/mask overlaps lives here, because
 * that is what those nodes were — a broadphase the engine ran on the scene's
 * behalf. There is no scene tree to run one, and at this scale there is no need
 * for one either: a handful of enemies against a handful of shots is a pair of
 * nested loops.
 *
 * Keeping it in one place also keeps the ordering explicit, which the Area2D
 * version left to Godot's internals. Damage is resolved *after* both sides have
 * moved, so an enemy cannot be hit by a shot at a position neither of them was
 * ever actually in.
 */
export class Stage {
  readonly enemies: Enemy[] = [];
  readonly hazards: readonly Hazard[];
  readonly conveyors: readonly Conveyor[];
  readonly platforms: MovingPlatform[];
  readonly fallingPlatforms: FallingPlatform[];
  readonly pickups: LifeCapsule[];
  readonly weaponCapsules: WeaponCapsule[];
  readonly sparks: HitSpark[] = [];
  /** The hits resolved on the current tick; cleared at the start of every tick. */
  readonly damageEvents: DamageEvent[] = [];
  /** Index of the current tick (ticks run before it), stamped on its damage events. */
  frame = -1;

  constructor(
    readonly world: World,
    readonly player: Player,
    environment: StageEnvironment = {},
    /** Where capsules read their pickup definitions — the scene's game data. */
    gameData: CompiledGameData = COMPILED_GAME_DATA,
  ) {
    this.hazards = environment.hazards ?? [];
    this.conveyors = environment.conveyors ?? [];
    this.platforms = (environment.platforms ?? []).map((spawn) => new MovingPlatform(spawn));
    this.fallingPlatforms = (environment.fallingPlatforms ?? []).map(
      (spawn) => new FallingPlatform(spawn),
    );
    this.pickups = (environment.pickups ?? []).map((spawn) => new LifeCapsule(spawn, gameData));
    this.weaponCapsules = (environment.weaponCapsules ?? []).map(
      (spawn) => new WeaponCapsule(spawn, gameData),
    );
    this.player.setPlatforms([...this.platforms, ...this.fallingPlatforms]);
  }

  add(enemy: Enemy): Enemy {
    this.enemies.push(enemy);
    return enemy;
  }

  /** Whether a Life Energy or Weapon Energy capsule currently owns the room's recovery pause. */
  get recovering(): boolean {
    return (
      this.pickups.some((pickup) => pickup.collecting) ||
      this.weaponCapsules.some((c) => c.collecting)
    );
  }

  /** One fixed step of the whole room. */
  tick(dt: number): void {
    this.frame++;
    this.damageEvents.length = 0;
    // PickUp.gd switches the collecting capsule to PAUSE_MODE_PROCESS before it
    // pauses the scene tree. While its fill ticks continue, absolutely
    // everything else in the room retains its current simulation state — a
    // Life Energy and a Weapon Energy capsule share the same single-pause rule,
    // so only ever one of either kind is "recovery" at a time.
    const recovery =
      this.pickups.find((pickup) => pickup.collecting) ??
      this.weaponCapsules.find((c) => c.collecting);
    if (recovery) {
      recovery.tick(dt, this.player, this.world);
      this.reapConsumedPickups();
      this.reapConsumedWeaponCapsules();
      return;
    }

    for (const platform of this.platforms) platform.tick(dt);
    if (this.fallingPlatforms.length > 0) this.tickFallingPlatforms(dt);
    this.player.conveyor_belt_speed = this.conveyorSpeedUnderPlayer();
    this.player.tick(dt);

    this.resolveHazards();

    this.resolvePickups(dt);
    this.resolveWeaponCapsules(dt);

    // Collection can begin during this step. Pause before enemies, projectiles,
    // or contact damage get another update on the collection frame.
    if (this.recovering) return;

    for (const enemy of this.enemies) {
      // AI.gd's vision Area2D, re-evaluated before the enemy thinks. A dead
      // enemy stops tracking, so its corpse does not steer anything.
      const sees = enemy.has_health() && enemy.canSee(this.player);
      enemy.target = sees ? this.player : null;
      enemy.tick(dt);
    }

    this.ageSparks(dt);
    this.resolveShots();
    this.resolveMelee();
    this.resolveContact();
    this.resolveEnemyShots();

    // EnemyDeath frees the node at the end of its sequence.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    }

    this.reapConsumedPickups();
    this.reapConsumedWeaponCapsules();
  }

  /** Falling platforms drop once stood on and are removed once below the level. */
  private tickFallingPlatforms(dt: number): void {
    const riding = this.player.standingOn;
    for (const platform of this.fallingPlatforms) platform.tick(dt, riding === platform);
    const before = this.fallingPlatforms.length;
    for (let i = before - 1; i >= 0; i--) {
      if (this.fallingPlatforms[i].y > this.world.heightPx) this.fallingPlatforms.splice(i, 1);
    }
    if (this.fallingPlatforms.length !== before) {
      this.player.setPlatforms([...this.platforms, ...this.fallingPlatforms]);
    }
  }

  /**
   * Life Energy capsules — PickUp's area2D overlap against the player, plus
   * the ticking heal it starts once touched. Only one capsule may own the
   * scene-tree-style recovery pause at a time.
   */
  private resolvePickups(dt: number): void {
    if (!this.player.has_health()) return;
    for (const pickup of this.pickups) {
      if (pickup.consumed) continue;
      if (
        this.player.collisions_enabled &&
        !pickup.collecting &&
        bodyOverlapsRect(this.player, pickup)
      ) {
        pickup.beginConsuming();
        pickup.tick(dt, this.player, this.world);
        return;
      }
      pickup.tick(dt, this.player, this.world);
    }
  }

  /** PickUp.queue_free once amount_to_heal is spent. */
  private reapConsumedPickups(): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (this.pickups[i].consumed) this.pickups.splice(i, 1);
    }
  }

  /**
   * Weapon Energy capsules — AmmoPickup's half of the same PickUp.gd overlap
   * behaviour as {@link resolvePickups}. Guarded on `this.recovering` because
   * it runs *after* resolvePickups in the same tick: without the guard, a Life
   * Energy capsule that just started collecting would not stop a Weapon Energy
   * capsule from also starting one this same frame, and the single-recovery
   * invariant `tick()`'s top branch relies on would leave whichever one loses
   * that race frozen mid-collection forever.
   */
  private resolveWeaponCapsules(dt: number): void {
    if (!this.player.has_health()) return;
    if (this.recovering) return;
    for (const capsule of this.weaponCapsules) {
      if (capsule.consumed) continue;
      if (
        this.player.collisions_enabled &&
        !capsule.collecting &&
        bodyOverlapsRect(this.player, capsule)
      ) {
        capsule.beginConsuming();
        capsule.tick(dt, this.player, this.world);
        return;
      }
      capsule.tick(dt, this.player, this.world);
    }
  }

  private reapConsumedWeaponCapsules(): void {
    for (let i = this.weaponCapsules.length - 1; i >= 0; i--) {
      if (this.weaponCapsules[i].consumed) this.weaponCapsules.splice(i, 1);
    }
  }

  private conveyorSpeedUnderPlayer(): number {
    if (!this.player.is_on_floor()) return 0;
    const feet = this.player.pos.y + this.player.hh;
    const belt = this.conveyors.find(
      (conveyor) =>
        this.player.pos.x + this.player.hw > conveyor.x &&
        this.player.pos.x - this.player.hw < conveyor.x + conveyor.w &&
        feet >= conveyor.y - 2 &&
        feet <= conveyor.y + conveyor.h,
    );
    return belt?.speed ?? 0;
  }

  /**
   * Spikes. Invulnerability protects; otherwise a lethal hazard kills outright
   * (past death protection) and a non-lethal one is an ordinary hit pushing away
   * from its centre.
   */
  private resolveHazards(): void {
    const p = this.player;
    if (!p.collisions_enabled || !p.has_health() || p.is_invulnerable()) return;
    const hazard = this.hazards.find((h) => bodyOverlapsRect(p, h));
    if (!hazard) return;
    const source = { kind: "hazard", runtimeId: hazard.id };
    if (hazard.lethal !== false) {
      const health = p.current_health;
      p.kill();
      this.log("hazard", source, PLAYER, health, { armor: p.armor, dealt: health }, "killed");
      return;
    }
    const centre = { pos: { x: hazard.x + hazard.w / 2, y: hazard.y + hazard.h / 2 } };
    this.hitPlayer("hazard", hazard.damage ?? 4, source, centre);
  }

  /**
   * Player projectiles against enemy hurtboxes — EnemyDamage's area2D overlap.
   *
   * A shot is spent on the first enemy it reaches, including when that enemy is
   * shielded: hitting a raised guard consumes the shot without damaging anything,
   * which is what makes a Metool's helmet feel solid rather than transparent.
   */
  private resolveShots(): void {
    for (const shot of this.player.projectiles) {
      if (!shot.isLive) continue;
      for (const enemy of this.enemies) {
        if (!enemy.has_health()) continue;
        if (!rectsOverlap(shot.bounds, enemy.hurtbox)) continue;
        // Only the charged buster carries `break_guards` in the original.
        const attack = {
          id: shot.stats.id,
          base: shot.damage,
          breaksGuard: shot.charge >= 2,
          weapon: shot.weapon,
          charge: shot.charge,
          element: shot.stats.element,
        };
        if (!this.strike(enemy, attack)) continue; // passes through

        shot.hit(shot.x, shot.y);
        break;
      }
    }
  }

  /**
   * The player's melee box against enemy hurtboxes, through the same reaction
   * as a shot. A swing is not spent on its first enemy: it can cut several, but
   * each one only once, including a raised shield it bounced off.
   */
  private resolveMelee(): void {
    const swing = this.player.melee;
    const box = this.player.meleeBounds;
    if (!swing || !box) return;
    for (const enemy of this.enemies) {
      if (!enemy.has_health() || swing.hit.has(enemy)) continue;
      if (!rectsOverlap(box, enemy.hurtbox)) continue;
      // ponytail: the saber never breaks guards; add a spec flag if one should.
      if (!this.strike(enemy, { id: "melee", base: swing.damage, breaksGuard: false })) continue;
      swing.hit.add(enemy);
      const hurt = enemy.hurtbox;
      if (swing.hitFx) {
        // Centre of the blade/hurtbox overlap, at the enemy's centre height.
        const x = (Math.max(box.left, hurt.left) + Math.min(box.right, hurt.right)) / 2;
        const dir = this.player.get_facing_direction();
        this.sparks.push({ clip: swing.hitFx, x, y: enemy.pos.y, dir, age: 0, frame: 0 });
      }
    }
  }

  private ageSparks(dt: number): void {
    for (const spark of this.sparks) {
      spark.age += dt;
      spark.frame = Math.floor(spark.age * HIT_FX_FPS);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      if (this.sparks[i].frame >= HIT_FX_FRAME_COUNT) this.sparks.splice(i, 1);
    }
  }

  /**
   * DamageOnTouch — the enemy body against the player's.
   *
   * The original re-applies this every 0.016s while the boxes overlap. The player's
   * Damage state accepts the first hit, becomes invulnerable, and carries him clear;
   * the inflicter is passed through so knockback is always away from the enemy.
   * The enemy's current frame `hitboxes` deal the same touch damage as its body.
   */
  private resolveContact(): void {
    if (!this.player.has_health()) return; // Death is running; nothing can touch a corpse
    if (!this.player.collisions_enabled) return;
    for (const enemy of this.enemies) {
      if (!enemy.has_health() || enemy.exploding) continue;
      if (!bodiesOverlap(enemy, this.player) && !hitboxesTouch(enemy, this.player)) continue;

      if (!this.player.is_invulnerable()) {
        const source = { kind: enemy.kind, runtimeId: enemy.runtimeId };
        const base = enemy.stats.touch_damage;
        this.hitPlayer("touch", base, source, enemy, enemy.def.touchKnockback);
      }
      enemy.ai.onTouchedPlayer();
    }
  }

  /**
   * Enemy shots against the player's body. A shot is spent only when it lands;
   * during invulnerability it flies on through, as in the original.
   */
  private resolveEnemyShots(): void {
    if (!this.player.has_health() || !this.player.collisions_enabled) return;
    const p = this.player;
    const body = {
      left: p.pos.x - p.hw,
      right: p.pos.x + p.hw,
      top: p.pos.y - p.hh,
      bottom: p.pos.y + p.hh,
    };
    for (const enemy of this.enemies) {
      for (const shot of enemy.projectiles) {
        if (!shot.isLive || p.is_invulnerable() || !rectsOverlap(shot.bounds, body)) continue;
        const source = { kind: enemy.kind, runtimeId: enemy.runtimeId };
        const { id, knockback, element } = shot.stats;
        this.hitPlayer(id, shot.damage, source, enemy, knockback, element);
        shot.hit(shot.x, shot.y);
      }
    }
  }

  /**
   * EnemyShield/EnemyDamage reaction to one player hit, through the damage
   * chain. Returns false when the enemy is invulnerable right now, so the hit
   * should pass through; a shield or an immunity still spends it.
   */
  private strike(enemy: Enemy, attack: PlayerAttack): boolean {
    const target = { kind: enemy.kind, runtimeId: enemy.runtimeId };
    const log = (dealt: number, result: DamageEvent["result"]): void =>
      this.log(
        attack.id,
        PLAYER,
        target,
        attack.base,
        { armor: enemy.armor, dealt },
        result,
        attack,
      );
    if (enemy.has_shield()) {
      log(0, enemy.hit_shield(attack.breaksGuard) ? "guard_break" : "shielded");
      return true;
    }
    if (!enemy.can_be_damaged()) return false;
    const { dealt, result } = computeDamage({ base: attack.base, armor: enemy.armor });
    if (result === "immune") {
      enemy.events.emit("deflect");
      log(0, "immune");
      return true;
    }
    enemy.damage(dealt);
    log(dealt, enemy.has_health() ? "hit" : "killed");
    return true;
  }

  /** One hit on the player through the damage chain; logged only when it lands. */
  private hitPlayer(
    attack: string,
    base: number,
    source: DamageEvent["source"],
    inflicter: DamageInflicter,
    knockback?: Knockback,
    element?: string,
  ): void {
    const p = this.player;
    const { dealt } = computeDamage({ base, armor: p.armor });
    if (!p.damage(dealt, inflicter, knockback)) return;
    const result = p.has_health() ? "hit" : "killed";
    this.log(attack, source, PLAYER, base, { armor: p.armor, dealt }, result, { element });
  }

  private log(
    attack: string,
    source: DamageEvent["source"],
    target: DamageEvent["target"],
    base: number,
    { armor, dealt }: { armor: number; dealt: number },
    result: DamageEvent["result"],
    extra: { weapon?: string; charge?: number; element?: string } = {},
  ): void {
    const event: DamageEvent = {
      frame: this.frame,
      attack,
      source,
      target,
      base,
      multiplier: 100,
      armor,
      dealt,
      result,
    };
    // Optional keys only when set, so events compare and serialise cleanly.
    if (extra.weapon) event.weapon = extra.weapon;
    if (extra.charge !== undefined) event.charge = extra.charge;
    if (extra.element !== undefined) event.element = extra.element;
    this.damageEvents.push(event);
  }
}

/** The player as a damage event's source or target (its snapshot identity). */
const PLAYER = { kind: "player", runtimeId: "player" } as const;

/** One player hit on an enemy: a shot (by projectile id) or the saber ("melee"). */
interface PlayerAttack {
  id: string;
  base: number;
  breaksGuard: boolean;
  weapon?: string;
  charge?: number;
  element?: string;
}

type Rect = { left: number; right: number; top: number; bottom: number };

/** A damage box (shot or melee) against an enemy hurtbox. */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Enemy body against the player body — both are centre + half-extents. */
function bodiesOverlap(enemy: Enemy, player: Player): boolean {
  return (
    Math.abs(enemy.pos.x - player.pos.x) < enemy.hw + player.hw &&
    Math.abs(enemy.pos.y - player.pos.y) < enemy.hh + player.hh
  );
}

/** Any of the enemy's frame hitboxes against the player body. */
function hitboxesTouch(enemy: Enemy, player: Player): boolean {
  const body = {
    left: player.pos.x - player.hw,
    right: player.pos.x + player.hw,
    top: player.pos.y - player.hh,
    bottom: player.pos.y + player.hh,
  };
  return enemy.hitboxes.some((box) => rectsOverlap(box, body));
}

function bodyOverlapsRect(
  body: { pos: { x: number; y: number }; hw: number; hh: number },
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    body.pos.x + body.hw > rect.x &&
    body.pos.x - body.hw < rect.x + rect.w &&
    body.pos.y + body.hh > rect.y &&
    body.pos.y - body.hh < rect.y + rect.h
  );
}
