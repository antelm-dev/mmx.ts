/** Axis-aligned authored rectangle in world pixels. */
export interface EnvironmentRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A lethal volume. Touching one starts the player's death sequence immediately. */
export interface Hazard extends EnvironmentRect {}

/** A non-solid strip that adds horizontal speed while the player stands on it. */
export interface Conveyor extends EnvironmentRect {
  speed: number;
}

export interface MovingPlatformSpawn extends EnvironmentRect {
  /** Horizontal distance from the authored origin, in pixels. */
  travel: number;
  /** Travel speed in pixels per second. */
  speed: number;
}

/**
 * Deterministic horizontal, one-way moving floor.
 *
 * The platform moves between its authored x and x + travel. Overshoot is folded
 * back into the range so its position is independent of frame-rate rounding.
 */
export class MovingPlatform implements EnvironmentRect {
  readonly id: string;
  readonly originX: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly travel: number;
  readonly speed: number;

  x: number;
  previousX: number;
  direction = 1;

  constructor(spawn: MovingPlatformSpawn) {
    this.id = spawn.id;
    this.originX = spawn.x;
    this.x = spawn.x;
    this.previousX = spawn.x;
    this.y = spawn.y;
    this.w = spawn.w;
    this.h = spawn.h;
    this.travel = Math.max(0, spawn.travel);
    this.speed = Math.max(0, spawn.speed);
  }

  get deltaX(): number {
    return this.x - this.previousX;
  }

  tick(dt: number): void {
    this.previousX = this.x;
    if (this.travel === 0 || this.speed === 0) return;

    let offset = this.x - this.originX + this.direction * this.speed * dt;
    while (offset < 0 || offset > this.travel) {
      if (offset > this.travel) {
        offset = this.travel * 2 - offset;
        this.direction = -1;
      } else {
        offset = -offset;
        this.direction = 1;
      }
    }
    this.x = this.originX + offset;
  }
}
