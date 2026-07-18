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

/**
 * A rectangular region of the level that constrains the view while the target
 * is inside it — the "camera bounds" volumes the original games place around
 * each room, corridor and shaft.
 *
 * A zone constrains an axis by default and releases it when the corresponding
 * flag is false, which is the distinction that makes them useful: a long
 * horizontal corridor binds only y, so the view stays locked to the corridor's
 * band while still scrolling freely along it, whereas a boss room binds both.
 */
export interface CameraZone {
  /** Top-left, in world pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Constrain the view horizontally to [x, x+w]. Default true. */
  bindX?: boolean;
  /** Constrain the view vertically to [y, y+h]. Default true. */
  bindY?: boolean;
}

/** Move `from` toward `to` far enough that `to` sits inside ±`half` of it. */
function pullIntoDeadzone(from: number, to: number, half: number): number {
  if (to > from + half) return to - half;
  if (to < from - half) return to + half;
  return from;
}

/**
 * Confine a view centre so the view spans only [lo, hi].
 *
 * A limit range narrower than the view cannot be satisfied, so the view is
 * centred on it instead — the overflow is split evenly rather than dumped on
 * one side, which is what clamping to an inverted range would do.
 */
function confineCenter(center: number, lo: number, hi: number, view: number): number {
  const half = view / 2;
  if (hi - lo < view) return (lo + hi) / 2;
  return Math.min(Math.max(center, lo + half), hi - half);
}

function contains(z: CameraZone, x: number, y: number): boolean {
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

/**
 * A scrolling view onto the world.
 *
 * The level is larger than the screen, so rendering picks a window into it: the
 * camera holds that window's top-left corner in world pixels, and the renderer
 * translates by its negation. It is deliberately engine-side and pure — no
 * canvas, no DOM — so the scroll behaviour is testable headlessly.
 *
 * Two things decide where the view lands. The dead zone decides what the camera
 * *wants* (follow the target, but ignore small movement), and the active
 * {@link CameraZone} decides what it is *allowed* — with the world edges as the
 * fallback when no zone is active.
 */
export class Camera {
  /** View top-left, in world pixels. */
  x = 0;
  y = 0;

  readonly viewW: number;
  readonly viewH: number;
  private readonly worldW: number;
  private readonly worldH: number;

  private zones: readonly CameraZone[] = [];
  private current: CameraZone | null = null;

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

  /** The zone currently constraining the view, or null outside all of them. */
  get activeZone(): CameraZone | null {
    return this.current;
  }

  /**
   * Install the level's camera zones. Overlap is allowed and expected — zones
   * are butted together or overlapped at the seam so the target is never
   * momentarily inside none of them mid-stride.
   */
  setZones(zones: readonly CameraZone[]): void {
    this.zones = zones;
    this.current = null;
  }

  /**
   * Pick the zone governing a target position.
   *
   * Two pieces of hysteresis, both there to stop the framing flickering between
   * two answers on alternate frames:
   *
   *  - the current zone wins while the target is still inside it, so standing on
   *    an overlap does not hand control back and forth;
   *  - a target inside *no* zone keeps the last one rather than falling back to
   *    the world, so a gap between zones — or a jump arcing over a zone's top
   *    edge — does not briefly unlock the view and yank it back.
   */
  private zoneFor(tx: number, ty: number): CameraZone | null {
    if (this.current && contains(this.current, tx, ty)) return this.current;
    for (const z of this.zones) {
      if (contains(z, tx, ty)) return z;
    }
    return this.current;
  }

  /** Horizontal limits imposed by `z`, falling back to the world edges. */
  private limitsX(z: CameraZone | null): [number, number] {
    if (z && z.bindX !== false) return [z.x, z.x + z.w];
    return [0, this.worldW];
  }

  private limitsY(z: CameraZone | null): [number, number] {
    if (z && z.bindY !== false) return [z.y, z.y + z.h];
    return [0, this.worldH];
  }

  /**
   * Confine a view centre to the active zone, then to the world.
   *
   * The world pass is not redundant with the zone pass even though every zone
   * is drawn inside the level: a zone *shorter than the view* cannot be filled,
   * so it centres the view on itself, and centring on a zone hugging the level
   * floor puts the bottom of the screen past the bottom of the level. The world
   * is the outer limit either way, so nothing can make the backdrop show past an
   * edge — a zone only ever tightens the framing, never loosens it.
   */
  private confine(cx: number, cy: number): [number, number] {
    const [lx, hx] = this.limitsX(this.current);
    const [ly, hy] = this.limitsY(this.current);
    return [
      confineCenter(confineCenter(cx, lx, hx, this.viewW), 0, this.worldW, this.viewW),
      confineCenter(confineCenter(cy, ly, hy, this.viewH), 0, this.worldH, this.viewH),
    ];
  }

  /** Centre on a point immediately — for spawns and teleports, not per-frame. */
  snapTo(tx: number, ty: number): void {
    this.current = this.zoneFor(tx, ty);
    const [cx, cy] = this.confine(tx, ty);
    this.x = cx - this.viewW / 2;
    this.y = cy - this.viewH / 2;
  }

  /**
   * Advance one step of dead-zone follow, confined to the active camera zone.
   *
   * The target only drags the camera once it leaves the dead zone, and the
   * camera then eases the rest of the way, so small movements (idle bob, a
   * short hop) leave the framing completely still.
   *
   * Only the *goal* is confined, never the resulting position. That is what
   * makes crossing into a new zone read as a scroll rather than a cut: the
   * camera is briefly outside the new zone's limits, and the same easing that
   * handles ordinary following carries it in over a few frames. Confining the
   * result as well would teleport it to the boundary on the crossing frame.
   */
  follow(tx: number, ty: number, dt: number): void {
    this.current = this.zoneFor(tx, ty);

    const [goalX, goalY] = this.confine(
      pullIntoDeadzone(this.centerX, tx, DEADZONE_HALF_W),
      pullIntoDeadzone(this.centerY, ty, DEADZONE_HALF_H),
    );

    const k = 1 - Math.exp(-FOLLOW_RATE * dt);
    let cx = this.centerX + (goalX - this.centerX) * k;
    let cy = this.centerY + (goalY - this.centerY) * k;

    // Kill the asymptotic tail, which would otherwise leave the camera drifting
    // by a fraction of a pixel forever and flicker the rounded render offset.
    if (Math.abs(goalX - cx) < SETTLE_EPSILON) cx = goalX;
    if (Math.abs(goalY - cy) < SETTLE_EPSILON) cy = goalY;

    this.x = cx - this.viewW / 2;
    this.y = cy - this.viewH / 2;
  }
}
