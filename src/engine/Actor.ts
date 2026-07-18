import { Vec2 } from '../core/Vec2.js';
import { EventBus } from '../core/Events.js';
import { World } from './World.js';
import {
  BODY_HALF_H,
  BODY_HALF_W,
  FLOOR_SNAP_LENGTH,
  GRAVITY,
  MAX_FALL_VELOCITY,
  MAX_HEALTH,
} from '../core/constants.js';

/**
 * Physics body — port of Actor.gd.
 *
 * Holds velocity + bonus_velocity, integrates them against the tile World
 * (replacing move_and_slide), exposes floor/ceiling/wall sensors (replacing the
 * RayCast2D columns), tracks facing/direction and health.
 *
 * Gravity is NOT applied here — exactly like the original, the Movement abilities
 * call process_gravity() themselves. Actor only integrates and resolves.
 */
export class Actor {
  readonly gravity = GRAVITY;
  readonly maximum_fall_velocity = MAX_FALL_VELOCITY;

  pos: Vec2;
  velocity = new Vec2(0, 0);
  bonus_velocity = new Vec2(0, 0);
  final_velocity = new Vec2(0, 0);

  hw = BODY_HALF_W;
  hh = BODY_HALF_H;

  // facing / input direction
  direction = new Vec2(0, 0);
  facing_right = true;

  // sensors (recomputed each physics step, read by abilities next frame)
  private _onFloor = false;
  private _onCeiling = false;
  private _wallDir = 0; // is_colliding_with_wall(): +1 wall on right, -1 on left
  private _wallDirExceptFeet = 0;
  private _reachDir = 0; // is_in_reach_for_walljump()

  private _wasOnFloor = false;
  // Large until the actor actually touches ground, so an airborne spawn is not
  // mistaken for "just left the floor" (coyote time).
  time_since_on_floor = 1e9;

  floor_snap_enabled = true;
  conveyor_belt_speed = 0;

  // health
  max_health = MAX_HEALTH;
  current_health = MAX_HEALTH;
  invulnerability = 0;

  readonly events = new EventBus();
  /** Monotonic milliseconds clock (deterministic in sim, wall-clock in browser). */
  clockMs = 0;

  constructor(public world: World, x: number, y: number) {
    this.pos = new Vec2(x, y);
  }

  get_time(): number {
    return this.clockMs;
  }

  // --- velocity helpers (Actor.gd) ---
  set_horizontal_speed(s: number): void {
    this.velocity.x = s;
  }
  add_horizontal_speed(s: number): void {
    this.velocity.x += s;
  }
  get_horizontal_speed(): number {
    return this.velocity.x;
  }
  set_vertical_speed(s: number, floorSnap = true): void {
    this.floor_snap_enabled = s === 0 && floorSnap;
    this.velocity.y = s;
  }
  add_vertical_speed(s: number): void {
    this.velocity.y += s;
  }
  get_vertical_speed(): number {
    return this.velocity.y;
  }
  set_bonus_horizontal_speed(s: number): void {
    this.bonus_velocity.x = s;
  }
  get_bonus_horizontal_speed(): number {
    return this.bonus_velocity.x;
  }
  get_conveyor_belt_speed(): number {
    return this.conveyor_belt_speed;
  }
  get_floor_velocity(): Vec2 {
    return new Vec2(0, 0); // no moving platforms in this port
  }
  stop_all_movement(): void {
    this.velocity.set(0, 0);
    this.bonus_velocity.set(0, 0);
    this.final_velocity.set(0, 0);
  }

  // --- direction / facing (Actor.gd) ---
  set_direction(dir: number): void {
    this.direction.x = dir;
  }
  get_direction(): number {
    return this.direction.x;
  }
  get_facing_direction(): number {
    return this.facing_right ? 1 : -1;
  }
  update_facing_direction(): void {
    if (this.direction.x < 0) this.facing_right = false;
    else if (this.direction.x > 0) this.facing_right = true;
  }

  // --- sensors ---
  is_on_floor(): boolean {
    return this._onFloor;
  }
  is_on_ceiling(): boolean {
    return this._onCeiling;
  }
  is_colliding_with_wall(): number {
    return this._wallDir;
  }
  is_colliding_with_wall_except_feet(): number {
    return this._wallDirExceptFeet;
  }
  is_in_reach_for_walljump(): number {
    return this._reachDir;
  }
  has_just_been_on_floor(leeway: number): boolean {
    return this._onFloor || this.time_since_on_floor < leeway;
  }

  // --- health ---
  is_invulnerable(): boolean {
    return this.invulnerability > 0;
  }
  add_invulnerability(_name: string): void {
    /* toggle set omitted in this movement-focused port */
  }
  remove_invulnerability(_name: string): void {}
  has_health(): boolean {
    return this.current_health > 0;
  }
  /** Actor.gd:is_low_health — drives the "weak" idle stance. */
  is_low_health(): boolean {
    return this.current_health - 1 < this.max_health / 4;
  }
  damage(value: number): void {
    if (!this.is_invulnerable()) {
      this.current_health -= value;
      this.events.emit('damage', value);
    }
  }

  // hitbox resize during dash (Player.reduce_hitbox / increase_hitbox).
  // Shrink from the top only: keep the feet (bottom edge) planted so the floor
  // sensor stays valid while dashing.
  reduce_hitbox(): void {
    if (this.hh === BODY_HALF_H) {
      this.pos.y += 4;
      this.hh = BODY_HALF_H - 4;
    }
  }
  increase_hitbox(): void {
    if (this.hh !== BODY_HALF_H) {
      this.pos.y -= 4;
      this.hh = BODY_HALF_H;
    }
  }

  enable_floor_snap(): void {
    this.floor_snap_enabled = true;
  }

  // ---------------------------------------------------------------------------
  // Physics integration (replaces Actor.process_movement + move_and_slide)
  // ---------------------------------------------------------------------------
  physicsStep(dt: number): void {
    this.final_velocity.set(
      this.velocity.x + this.bonus_velocity.x,
      this.velocity.y + this.bonus_velocity.y,
    );

    this.moveXResolve(this.final_velocity.x * dt);
    this.moveYResolve(this.final_velocity.y * dt);
    this.applyFloorSnap();

    this.updateSensors();

    // land / coyote bookkeeping (Character.check_for_land)
    if (this._onFloor) {
      if (!this._wasOnFloor) this.events.emit('land');
      this.time_since_on_floor = 0;
    } else {
      this.time_since_on_floor += dt;
    }
    if (this._onCeiling) this.events.emit('headbump');
    this._wasOnFloor = this._onFloor;

    this.update_facing_direction();
  }

  /**
   * Swept horizontal move. The world scans every tile column the leading edge
   * crosses, so the body cannot tunnel through thin geometry no matter how large
   * the step, and it lands flush against the blocking face instead of somewhere
   * within a quarter pixel of it.
   */
  private moveXResolve(dx: number): void {
    if (dx === 0) return;
    const { pos, hit } = this.world.sweepX(this.pos.x, this.pos.y, this.hw, this.hh, dx);
    this.pos.x = pos;
    if (hit) this.velocity.x = 0;
  }

  private moveYResolve(dy: number): void {
    if (dy === 0) return;
    const { pos, hit } = this.world.sweepY(this.pos.x, this.pos.y, this.hw, this.hh, dy);
    this.pos.y = pos;
    if (hit) this.velocity.y = 0;
  }

  /**
   * Actor.gd floor snap (FLOOR_SNAP_LENGTH) — previously declared but never
   * applied. Without it, walking off the lip of a step or over a one-tile dip
   * launches the actor into Fall for a few frames; with it, a grounded actor
   * that would otherwise leave the ground is pulled back down onto it.
   *
   * Only runs when already grounded and not moving upward, so it can never
   * cancel a jump (set_vertical_speed also clears the flag for any non-zero
   * vertical speed).
   *
   * This also keeps a standing body *flush* with the ground. The floor sensor
   * has a 2px tolerance, so an actor that stopped just short of the surface
   * would report is_on_floor, have its vertical speed zeroed by the grounded
   * ability, and hover there indefinitely. Snapping every grounded frame is
   * idempotent once contact is exact.
   */
  private applyFloorSnap(): void {
    if (!this.floor_snap_enabled || !this._wasOnFloor) return;
    if (this.final_velocity.y < 0) return;

    const { pos, hit } = this.world.sweepY(
      this.pos.x,
      this.pos.y,
      this.hw,
      this.hh,
      FLOOR_SNAP_LENGTH,
    );
    if (hit) {
      this.pos.y = pos;
      this.velocity.y = 0; // landed, same as a normal floor contact
    }
  }

  /** Is there solid ground within `probe` pixels below the feet? */
  private groundBelow(probe: number): boolean {
    const half = probe / 2;
    return this.world.overlaps(this.pos.x, this.pos.y + this.hh + half, this.hw - 1, half);
  }

  private updateSensors(): void {
    const { hw, hh } = this;

    // Floor / ceiling: thin full-width probe boxes rather than two corner
    // points, so geometry narrower than the body still registers.
    this._onFloor = this.groundBelow(2);
    this._onCeiling = this.world.overlaps(this.pos.x, this.pos.y - hh - 1, hw - 1, 1);

    // Walls: thin full-height probe boxes beside the body. The vertical insets
    // match the original raycast columns — the "except feet" variant stops above
    // the feet so a floor tile is not read as a wall, and the walljump reach
    // probe extends one pixel further out and stops slightly higher.
    this._wallDir = this.sampleWall(hw + 1, -hh + 2, hh - 2);
    this._wallDirExceptFeet = this.sampleWall(hw + 1, -hh + 2, 0);
    this._reachDir = this.sampleWall(hw + 2, -hh + 2, hh - 4);
  }

  /**
   * Returns +1 (wall on right), -1 (wall on left), 0 (none). Right takes priority.
   * `top`/`bottom` are offsets from the body centre bounding the probed span.
   */
  private sampleWall(xOffset: number, top: number, bottom: number): number {
    const cy = this.pos.y + (top + bottom) / 2;
    const half = (bottom - top) / 2;
    if (this.world.overlaps(this.pos.x + xOffset, cy, 1, half)) return 1;
    if (this.world.overlaps(this.pos.x - xOffset, cy, 1, half)) return -1;
    return 0;
  }
}
