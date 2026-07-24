import { VIEW_WIDTH, VIEW_HEIGHT } from "../core/constants.js";

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

export interface CameraConfig {
  deadZone: { left: number; right: number; up: number; down: number };
  followRateX: number;
  followRateY: number;
  maxSpeedX: number;
  maxSpeedY: number;
  /** Distance revealed in the direction of horizontal travel. */
  lookAheadX: number;
  /** Extra space revealed beneath a falling target. */
  fallLookAheadY: number;
  /** Rate at which intent offsets blend in and out. */
  lookAheadRate: number;
  /** Horizontal speed which produces the full horizontal look-ahead. */
  maxLookAheadSpeedX: number;
  /** Downward speed which produces the full falling look-ahead. */
  maxFallSpeedY: number;
  /** What ordinary following does while the target is outside every zone. */
  outsideZone: "hold" | "world";
}

export interface CameraOptions extends Partial<Omit<CameraConfig, "deadZone">> {
  deadZone?: Partial<CameraConfig["deadZone"]>;
}

export interface CameraTarget {
  x: number;
  y: number;
  velocityX?: number;
  velocityY?: number;
  grounded?: boolean;
}

const DEFAULT_CONFIG: CameraConfig = {
  deadZone: {
    left: DEADZONE_HALF_W,
    right: DEADZONE_HALF_W,
    up: DEADZONE_HALF_H,
    down: DEADZONE_HALF_H,
  },
  followRateX: FOLLOW_RATE,
  followRateY: FOLLOW_RATE,
  maxSpeedX: Number.POSITIVE_INFINITY,
  maxSpeedY: Number.POSITIVE_INFINITY,
  lookAheadX: 32,
  fallLookAheadY: 24,
  lookAheadRate: 6,
  maxLookAheadSpeedX: 200,
  maxFallSpeedY: 320,
  outsideZone: "hold",
};

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
  /** Stable authoring identifier for diagnostics and scripted transitions. */
  id?: string;
  /** Top-left, in world pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Constrain the view horizontally to [x, x+w]. Default true. */
  bindX?: boolean;
  /** Constrain the view vertically to [y, y+h]. Default true. */
  bindY?: boolean;
  /** Higher-priority zones win when entering an overlap from outside both. */
  priority?: number;
}

/** Move `from` toward `to` far enough that `to` sits inside ±`half` of it. */
function pullIntoDeadzone(from: number, to: number, before: number, after: number): number {
  if (to > from + after) return to - after;
  if (to < from - before) return to + before;
  return from;
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, -1), 1);
}

function validatePositive(name: string, value: number, allowInfinity = false): void {
  if (
    (allowInfinity && value === Number.POSITIVE_INFINITY) ||
    (Number.isFinite(value) && value > 0)
  ) {
    return;
  }
  throw new RangeError(`${name} must be positive`);
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
  private intentX = 0;
  private intentY = 0;
  readonly config: Readonly<CameraConfig>;

  constructor(
    worldW: number,
    worldH: number,
    viewW = VIEW_WIDTH,
    viewH = VIEW_HEIGHT,
    options: CameraOptions = {},
  ) {
    validatePositive("worldW", worldW);
    validatePositive("worldH", worldH);
    validatePositive("viewW", viewW);
    validatePositive("viewH", viewH);
    this.worldW = worldW;
    this.worldH = worldH;
    this.viewW = viewW;
    this.viewH = viewH;
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
      deadZone: { ...DEFAULT_CONFIG.deadZone, ...options.deadZone },
    };
    for (const [name, value] of Object.entries(this.config.deadZone)) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`deadZone.${name} must be non-negative`);
      }
    }
    validatePositive("followRateX", this.config.followRateX);
    validatePositive("followRateY", this.config.followRateY);
    validatePositive("maxSpeedX", this.config.maxSpeedX, true);
    validatePositive("maxSpeedY", this.config.maxSpeedY, true);
    validatePositive("lookAheadRate", this.config.lookAheadRate);
    validatePositive("maxLookAheadSpeedX", this.config.maxLookAheadSpeedX);
    validatePositive("maxFallSpeedY", this.config.maxFallSpeedY);
    for (const name of ["lookAheadX", "fallLookAheadY"] as const) {
      const value = this.config[name];
      if (!Number.isFinite(value) || value < 0)
        throw new RangeError(`${name} must be non-negative`);
    }
    if (this.config.outsideZone !== "hold" && this.config.outsideZone !== "world") {
      throw new RangeError("outsideZone must be 'hold' or 'world'");
    }
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

  /** Every installed zone — read by the debug overlay to draw the level's framing. */
  get allZones(): readonly CameraZone[] {
    return this.zones;
  }

  /**
   * Install the level's camera zones. Overlap is allowed and expected — zones
   * are butted together or overlapped at the seam so the target is never
   * momentarily inside none of them mid-stride.
   */
  setZones(zones: readonly CameraZone[]): void {
    for (const [index, zone] of zones.entries()) {
      if (![zone.x, zone.y, zone.w, zone.h].every(Number.isFinite) || zone.w <= 0 || zone.h <= 0) {
        throw new RangeError(
          `camera zone ${zone.id ?? index} must have finite coordinates and positive size`,
        );
      }
    }
    this.zones = [...zones];
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
    let match: CameraZone | null = null;
    for (const z of this.zones) {
      if (contains(z, tx, ty) && (match === null || (z.priority ?? 0) > (match.priority ?? 0))) {
        match = z;
      }
    }
    if (match) return match;
    return this.config.outsideZone === "hold" ? this.current : null;
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
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      throw new RangeError("camera target position must be finite");
    }
    // Teleports perform a fresh lookup instead of retaining a zone across a gap.
    this.current = null;
    this.current = this.zoneFor(tx, ty);
    this.intentX = 0;
    this.intentY = 0;
    const [cx, cy] = this.confine(tx, ty);
    // Whole pixels, as in follow(): a spawn should not leave the view parked on a
    // fraction it will never ease off of.
    this.x = Math.round(cx - this.viewW / 2);
    this.y = Math.round(cy - this.viewH / 2);
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
    this.validateStep(tx, ty, dt);
    this.current = this.zoneFor(tx, ty);
    this.advance(tx, ty, dt);
  }

  /** Follow a gameplay target with velocity-aware horizontal and falling look-ahead. */
  followTarget(target: CameraTarget, dt: number): void {
    this.validateStep(target.x, target.y, dt);
    const vx = target.velocityX ?? 0;
    const vy = target.velocityY ?? 0;
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      throw new RangeError("camera target velocity must be finite");
    }

    this.current = this.zoneFor(target.x, target.y);
    const desiredX = clampUnit(vx / this.config.maxLookAheadSpeedX) * this.config.lookAheadX;
    const desiredY =
      target.grounded === false && vy > 0
        ? Math.min(vy / this.config.maxFallSpeedY, 1) * this.config.fallLookAheadY
        : 0;
    const k = 1 - Math.exp(-this.config.lookAheadRate * dt);
    this.intentX += (desiredX - this.intentX) * k;
    this.intentY += (desiredY - this.intentY) * k;
    if (Math.abs(desiredX - this.intentX) < SETTLE_EPSILON) this.intentX = desiredX;
    if (Math.abs(desiredY - this.intentY) < SETTLE_EPSILON) this.intentY = desiredY;

    this.advance(target.x + this.intentX, target.y + this.intentY, dt);
  }

  /** Pixel-perfect world translation, quantised relative to the tracked anchor. */
  renderOffsetX(anchorX: number): number {
    return Math.round(anchorX - this.x) - Math.round(anchorX);
  }

  renderOffsetY(anchorY: number): number {
    return Math.round(anchorY - this.y) - Math.round(anchorY);
  }

  private validateStep(tx: number, ty: number, dt: number): void {
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      throw new RangeError("camera target position must be finite");
    }
    if (!Number.isFinite(dt) || dt < 0) {
      throw new RangeError("camera dt must be finite and non-negative");
    }
  }

  private advance(tx: number, ty: number, dt: number): void {
    const { deadZone } = this.config;

    const [rawX, rawY] = this.confine(
      pullIntoDeadzone(this.centerX, tx, deadZone.left, deadZone.right),
      pullIntoDeadzone(this.centerY, ty, deadZone.up, deadZone.down),
    );

    // The goal is quantised to whole pixels so that a camera which has caught up and
    // settled rests on an integer rather than on whatever fraction the target happened
    // to carry. A view resting at x.5 is the one place the renderer's scroll rounding
    // is ambiguous, and the target still moving inside the dead zone would then tip it
    // back and forth and shake the whole background while the camera is nominally
    // still. Half a pixel of framing is not a visible difference; the shake is.
    const goalX = Math.round(rawX);
    const goalY = Math.round(rawY);

    let cx = this.stepAxis(this.centerX, goalX, this.config.followRateX, this.config.maxSpeedX, dt);
    let cy = this.stepAxis(this.centerY, goalY, this.config.followRateY, this.config.maxSpeedY, dt);

    // Kill the asymptotic tail, which would otherwise leave the camera drifting
    // by a fraction of a pixel forever and flicker the rounded render offset.
    if (Math.abs(goalX - cx) < SETTLE_EPSILON) cx = goalX;
    if (Math.abs(goalY - cy) < SETTLE_EPSILON) cy = goalY;

    this.x = cx - this.viewW / 2;
    this.y = cy - this.viewH / 2;
  }

  private stepAxis(from: number, to: number, rate: number, maxSpeed: number, dt: number): number {
    if (dt === 0) return from;
    const eased = (to - from) * (1 - Math.exp(-rate * dt));
    const maxStep = maxSpeed * dt;
    return from + Math.min(Math.max(eased, -maxStep), maxStep);
  }
}
