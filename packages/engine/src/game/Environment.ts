import { GRAVITY, MAX_FALL_VELOCITY } from "../core/constants.js";

/** Axis-aligned authored rectangle in world pixels. */
export interface EnvironmentRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A spike volume. Lethal (the default) kills the player outright on touch; with
 * `lethal: false` it deals `damage` through the damage chain instead. Either
 * way it does nothing while the player is invulnerable.
 */
export interface Hazard extends EnvironmentRect {
  /** Default true. */
  lethal?: boolean;
  /** Damage of a non-lethal hazard. Default 4. */
  damage?: number;
}

/** A non-solid strip that adds horizontal speed while the player stands on it. */
export interface Conveyor extends EnvironmentRect {
  speed: number;
}

export type PlatformAxis = "horizontal" | "vertical";

/** A solid, one-way floor the {@link Actor} can stand on and be carried by. */
export interface Platform extends EnvironmentRect {
  readonly previousX: number;
  readonly previousY: number;
  /** Movement over the last tick, which a rider is carried by. */
  readonly deltaX: number;
  readonly deltaY: number;
}

export interface MovingPlatformSpawn extends EnvironmentRect {
  /** Distance from the authored origin along {@link axis} (rightward or downward), in pixels. */
  travel: number;
  /** Travel speed in pixels per second. */
  speed: number;
  /** Default "horizontal". */
  axis?: PlatformAxis;
}

/**
 * Deterministic one-way moving floor on one axis.
 *
 * The platform moves between its authored origin and origin + travel along its
 * axis (x for horizontal, y for vertical). Overshoot is folded back into the
 * range so its position is independent of frame-rate rounding.
 */
export class MovingPlatform implements Platform {
  readonly id: string;
  readonly originX: number;
  readonly originY: number;
  readonly w: number;
  readonly h: number;
  readonly travel: number;
  readonly speed: number;
  readonly axis: PlatformAxis;

  x: number;
  y: number;
  previousX: number;
  previousY: number;
  direction = 1;

  constructor(spawn: MovingPlatformSpawn) {
    this.id = spawn.id;
    this.originX = spawn.x;
    this.originY = spawn.y;
    this.x = spawn.x;
    this.y = spawn.y;
    this.previousX = spawn.x;
    this.previousY = spawn.y;
    this.w = spawn.w;
    this.h = spawn.h;
    this.travel = Math.max(0, spawn.travel);
    this.speed = Math.max(0, spawn.speed);
    this.axis = spawn.axis ?? "horizontal";
  }

  get deltaX(): number {
    return this.x - this.previousX;
  }

  get deltaY(): number {
    return this.y - this.previousY;
  }

  tick(dt: number): void {
    this.previousX = this.x;
    this.previousY = this.y;
    if (this.travel === 0 || this.speed === 0) return;

    const vertical = this.axis === "vertical";
    let offset =
      (vertical ? this.y - this.originY : this.x - this.originX) + this.direction * this.speed * dt;
    while (offset < 0 || offset > this.travel) {
      if (offset > this.travel) {
        offset = this.travel * 2 - offset;
        this.direction = -1;
      } else {
        offset = -offset;
        this.direction = 1;
      }
    }
    if (vertical) this.y = this.originY + offset;
    else this.x = this.originX + offset;
  }
}

export interface FallingPlatformSpawn extends EnvironmentRect {
  /** Seconds between the first time the player stands on it and the start of its fall. */
  delay: number;
}

/**
 * A one-way floor that drops once stood on. The countdown starts the first
 * frame a rider stands on it and runs on even if the rider leaves; then it
 * falls under actor gravity (capped at the actor fall speed) until the stage
 * removes it below the level. It never respawns.
 */
export class FallingPlatform implements Platform {
  readonly id: string;
  readonly x: number;
  readonly previousX: number;
  readonly w: number;
  readonly h: number;
  readonly delay: number;
  readonly deltaX = 0;

  y: number;
  previousY: number;
  /** Seconds since first stood on; null until then. */
  elapsed: number | null = null;
  velocityY = 0;

  constructor(spawn: FallingPlatformSpawn) {
    this.id = spawn.id;
    this.x = spawn.x;
    this.previousX = spawn.x;
    this.y = spawn.y;
    this.previousY = spawn.y;
    this.w = spawn.w;
    this.h = spawn.h;
    this.delay = Math.max(0, spawn.delay);
  }

  get deltaY(): number {
    return this.y - this.previousY;
  }

  /** `stoodOn`: whether a rider stood on it at the end of the previous step. */
  tick(dt: number, stoodOn: boolean): void {
    this.previousY = this.y;
    if (this.elapsed === null) {
      if (!stoodOn) return;
      this.elapsed = 0;
    }
    this.elapsed += dt;
    if (this.elapsed <= this.delay) return;
    this.velocityY = Math.min(MAX_FALL_VELOCITY, this.velocityY + GRAVITY * dt);
    this.y += this.velocityY * dt;
  }
}
