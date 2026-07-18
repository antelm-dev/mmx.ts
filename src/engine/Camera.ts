import { VIEW_WIDTH, VIEW_HEIGHT } from '../core/constants.js';

/**
 * Half-extents of the dead zone: the box around the view centre the target can
 * move inside without dragging the camera. Wider than it is tall because the
 * original scrolls freely while walking but holds the vertical framing steady —
 * a jump should not shove the whole screen down and back.
 */
const DEADZONE_HALF_W = 24;
const DEADZONE_HALF_H = 32;

/**
 * Catch-up rate, in "e-folds per second". The camera closes the remaining gap
 * to its target by `1 - e^(-RATE*dt)` each step, which is framerate-independent
 * (plain `gap * k` per frame is not) and never overshoots.
 */
const FOLLOW_RATE = 10;

/** Below this many pixels the camera is snapped onto its target outright. */
const SETTLE_EPSILON = 0.05;

/** Move `from` toward `to` far enough that `to` sits inside ±`half` of it. */
function pullIntoDeadzone(from: number, to: number, half: number): number {
  if (to > from + half) return to - half;
  if (to < from - half) return to + half;
  return from;
}

/**
 * A scrolling view onto the world.
 *
 * The level is larger than the screen, so rendering picks a window into it: the
 * camera holds that window's top-left corner in world pixels, and the renderer
 * translates by its negation. It is deliberately engine-side and pure — no
 * canvas, no DOM — so the scroll behaviour is testable headlessly.
 */
export class Camera {
  /** View top-left, in world pixels. */
  x = 0;
  y = 0;

  readonly viewW: number;
  readonly viewH: number;
  private readonly worldW: number;
  private readonly worldH: number;

  constructor(worldW: number, worldH: number, viewW = VIEW_WIDTH, viewH = VIEW_HEIGHT) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.viewW = viewW;
    this.viewH = viewH;
  }

  get centerX(): number {
    return this.x + this.viewW / 2;
  }
  get centerY(): number {
    return this.y + this.viewH / 2;
  }

  /**
   * Clamp the view to the world bounds, so the backdrop never shows past an
   * edge. An axis where the world is smaller than the view is centred instead —
   * clamping it would jam the short side against 0 and leave the overflow all
   * on one side.
   */
  private clamp(x: number, y: number): void {
    const maxX = this.worldW - this.viewW;
    const maxY = this.worldH - this.viewH;
    this.x = maxX < 0 ? maxX / 2 : Math.min(Math.max(x, 0), maxX);
    this.y = maxY < 0 ? maxY / 2 : Math.min(Math.max(y, 0), maxY);
  }

  /** Centre on a point immediately — for spawns and teleports, not per-frame. */
  snapTo(tx: number, ty: number): void {
    this.clamp(tx - this.viewW / 2, ty - this.viewH / 2);
  }

  /**
   * Advance one step of dead-zone follow.
   *
   * The target only drags the camera once it leaves the dead zone, and the
   * camera then eases the rest of the way, so small movements (idle bob, a
   * short hop) leave the framing completely still.
   */
  follow(tx: number, ty: number, dt: number): void {
    const goalX = pullIntoDeadzone(this.centerX, tx, DEADZONE_HALF_W);
    const goalY = pullIntoDeadzone(this.centerY, ty, DEADZONE_HALF_H);

    const k = 1 - Math.exp(-FOLLOW_RATE * dt);
    let cx = this.centerX + (goalX - this.centerX) * k;
    let cy = this.centerY + (goalY - this.centerY) * k;

    // Kill the asymptotic tail, which would otherwise leave the camera drifting
    // by a fraction of a pixel forever and flicker the rounded render offset.
    if (Math.abs(goalX - cx) < SETTLE_EPSILON) cx = goalX;
    if (Math.abs(goalY - cy) < SETTLE_EPSILON) cy = goalY;

    this.clamp(cx - this.viewW / 2, cy - this.viewH / 2);
  }
}
