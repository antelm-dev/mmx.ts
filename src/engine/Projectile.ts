import { World } from './World.js';
import { LEMON_SPEED } from '../core/constants.js';

/** Buster shot — simplified port of Lemon.gd / WeaponShot.gd. */
export class Projectile {
  alive = true;
  constructor(
    public x: number,
    public y: number,
    public dir: number,
    public charge: number, // 0 = lemon, 1..3 = charge levels
  ) {}

  get vx(): number {
    // charged shots fly a bit faster
    return LEMON_SPEED * (1 + this.charge * 0.15) * this.dir;
  }

  get radius(): number {
    return 2 + this.charge * 2;
  }

  update(dt: number, world: World): void {
    const dx = this.vx * dt;
    // Cast the whole step instead of sampling only the new position: a fast
    // charged shot would otherwise register its impact several pixels inside the
    // wall (and could skip past thin geometry entirely).
    const hit = world.raycastX(this.x, this.y, dx);
    if (hit !== null) {
      this.x = hit;
      this.alive = false;
      return;
    }
    this.x += dx;
    if (this.x < 0 || this.x > world.widthPx) this.alive = false;
  }
}
