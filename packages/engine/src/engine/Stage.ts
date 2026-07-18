import { Enemy } from "./Enemy.js";
import { Player } from "./Player.js";
import type { Projectile } from "./Projectile.js";
import type { World } from "./World.js";
import {
  MovingPlatform,
  type Conveyor,
  type Hazard,
  type MovingPlatformSpawn,
} from "./Environment.js";

export interface StageEnvironment {
  hazards?: readonly Hazard[];
  conveyors?: readonly Conveyor[];
  platforms?: readonly MovingPlatformSpawn[];
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

  constructor(
    readonly world: World,
    readonly player: Player,
    environment: StageEnvironment = {},
  ) {
    this.hazards = environment.hazards ?? [];
    this.conveyors = environment.conveyors ?? [];
    this.platforms = (environment.platforms ?? []).map((spawn) => new MovingPlatform(spawn));
    this.player.setPlatforms(this.platforms);
  }

  add(enemy: Enemy): Enemy {
    this.enemies.push(enemy);
    return enemy;
  }

  /** One fixed step of the whole room. */
  tick(dt: number): void {
    for (const platform of this.platforms) platform.tick(dt);
    this.player.conveyor_belt_speed = this.conveyorSpeedUnderPlayer();
    this.player.tick(dt);

    if (this.hazards.some((hazard) => bodyOverlapsRect(this.player, hazard))) {
      this.player.kill();
    }

    for (const enemy of this.enemies) {
      // AI.gd's vision Area2D, re-evaluated before the enemy thinks. A dead
      // enemy stops tracking, so its corpse does not steer anything.
      const sees = enemy.has_health() && enemy.canSee(this.player);
      enemy.target = sees ? this.player : null;
      enemy.tick(dt);
    }

    this.resolveShots();
    this.resolveContact();

    // EnemyDeath frees the node at the end of its sequence.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
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
        if (!overlaps(shot, enemy)) continue;

        if (enemy.has_shield()) {
          // Only the charged buster carries `break_guards` in the original.
          enemy.hit_shield(shot.charge >= 2);
        } else if (enemy.can_be_damaged()) {
          enemy.damage(shot.damage);
        } else {
          continue; // invulnerable right now: the shot passes through
        }

        shot.hit(shot.x, shot.y);
        break;
      }
    }
  }

  /**
   * DamageOnTouch — the enemy body against the player's.
   *
   * The original re-applies this every 0.016s while the boxes overlap. The player's
   * Damage state accepts the first hit, becomes invulnerable, and carries him clear;
   * the inflicter is passed through so knockback is always away from the enemy.
   */
  private resolveContact(): void {
    if (!this.player.has_health()) return; // Death is running; nothing can touch a corpse
    for (const enemy of this.enemies) {
      if (!enemy.has_health() || enemy.exploding) continue;
      if (!bodiesOverlap(enemy, this.player)) continue;

      if (!this.player.is_invulnerable()) {
        this.player.damage(enemy.stats.touch_damage, enemy);
      }
      enemy.ai.onTouchedPlayer();
    }
  }
}

/** Projectile damage box against an enemy hurtbox. */
function overlaps(shot: Projectile, enemy: Enemy): boolean {
  const a = shot.bounds;
  const b = enemy.hurtbox;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Enemy body against the player body — both are centre + half-extents. */
function bodiesOverlap(enemy: Enemy, player: Player): boolean {
  return (
    Math.abs(enemy.pos.x - player.pos.x) < enemy.hw + player.hw &&
    Math.abs(enemy.pos.y - player.pos.y) < enemy.hh + player.hh
  );
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
