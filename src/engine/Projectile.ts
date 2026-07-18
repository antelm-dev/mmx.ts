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
    this.x += this.vx * dt;
    if (this.x < 0 || this.x > world.widthPx) this.alive = false;
    if (world.isSolidAt(this.x, this.y)) this.alive = false;
  }
}
