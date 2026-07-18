import { BaseAbility } from "../ability/BaseAbility.js";
import { GRAVITY } from "../../core/constants.js";
import type { Enemy } from "../Enemy.js";

/**
 * Base for every enemy state — the merge of EnemyAbility.gd and AttackAbility.gd.
 *
 * Those are two classes in Godot only because one adds animation bookkeeping and
 * the other adds the player-relative queries; no enemy ability ever extends just
 * the first. They also inherit Movement.gd, but of its API the enemies use only
 * gravity and forced horizontal movement — the rest is input-driven and belongs
 * to the player, so it stays on {@link Movement} rather than being hoisted.
 *
 * `attack_stage` is the pattern that carries all of them: an enemy state is a
 * little script of numbered beats (hide -> open -> advance -> re-shield), each
 * advancing on a timer or on `animation_finished`. It reads oddly next to a
 * player state machine, and it is exactly right for enemies, whose behaviour is
 * a fixed sequence rather than a response to input.
 */
export abstract class EnemyAbility extends BaseAbility<Enemy> {
  /**
   * Names of the abilities this one refuses to run alongside — the scene's
   * `conflicting_moves`. The relation is directional and that asymmetry is the
   * mechanism: Patrol lists Hide, so Hide interrupts a running Patrol and Patrol
   * cannot start under a running Hide.
   */
  conflicts: string[] = [];

  attack_stage = 0;

  /** The last clip this ability asked for, and whether it has played out. */
  private current_animation = "";
  private finished_animation = "";

  constructor(enemy: Enemy) {
    super(enemy);
    // EnemyAbility.connect_animation_finished_event. Recorded rather than acted
    // on: the abilities *poll* has_finished_last_animation from their _Update,
    // so a clip that ends between two stage checks is not missed.
    enemy.events.on("animation_finished", (name: string) => {
      this.finished_animation = name;
    });
  }

  /** BaseAbility.conflicts_with — Godot matches by substring, so keep that. */
  conflictsWith(other: string): boolean {
    return this.conflicts.some((c) => other.includes(c));
  }

  /**
   * AttackAbility.Should_Execute -> conflicting_abilities. A conflict blocks the
   * start unless it is *mutual*, in which case the newcomer wins (and the
   * interrupt in EnemyAI.launch is what makes room for it).
   */
  override shouldExecute(): boolean {
    for (const move of this.character.executing_moves as EnemyAbility[]) {
      if (move === this) continue;
      if (this.conflictsWith(move.name) && !move.conflictsWith(this.name)) return false;
    }
    return true;
  }

  /** Ability.gd:Initialize — the scene's clip plays before _Setup runs. */
  override Initialize(): void {
    super.Initialize();
    this.attack_stage = 0;
    if (this.animation) this.play_animation(this.animation);
  }

  /** By default a state runs until it ends itself; only _Update decides. */
  override _EndCondition(): boolean {
    return false;
  }

  // --- stage sequencing (EnemyAbility.gd) ---
  // Each hop resets `timer`, so a stage's condition is always written against
  // time spent in *that* stage rather than in the ability as a whole.

  next_attack_stage(): void {
    this.attack_stage += 1;
    this.timer = 0;
  }

  go_to_attack_stage(stage: number): void {
    this.attack_stage = stage;
    this.timer = 0;
  }

  // --- animation bookkeeping (EnemyAbility.gd) ---

  override play_animation(a: string, frame = 0): void {
    super.play_animation(a, frame);
    this.current_animation = a;
    // A restart of a clip that already finished must clear the flag, or the
    // next stage check reads the previous playthrough's completion and the
    // state machine skips a beat.
    this.finished_animation = "";
  }

  override play_animation_once(a: string): void {
    if (this.current_animation === a) return;
    super.play_animation_once(a);
    this.current_animation = a;
    this.finished_animation = "";
  }

  has_finished_last_animation(): boolean {
    return this.current_animation !== "" && this.finished_animation === this.current_animation;
  }

  is_current_animation(a: string): boolean {
    return this.current_animation === a;
  }

  // --- movement helpers (Movement.gd, the parts enemies use) ---

  process_gravity(dt: number, gravity = GRAVITY): void {
    this.character.add_vertical_speed(gravity * dt);
    if (this.character.get_vertical_speed() > this.character.maximum_fall_velocity) {
      this.character.set_vertical_speed(this.character.maximum_fall_velocity);
    }
  }

  /** Movement.force_movement — speed along the way the enemy is facing. */
  force_movement(h: number): void {
    this.character.set_horizontal_speed(h * this.character.get_facing_direction());
  }

  /** BatPursuit's force_movement_regardless_of_direction. */
  set_horizontal_speed(h: number): void {
    this.character.set_horizontal_speed(h);
  }

  set_vertical_speed(v: number): void {
    this.character.set_vertical_speed(v, false);
  }

  set_direction(dir: number): void {
    this.character.set_direction(dir);
    this.character.update_facing_direction();
  }

  /** AttackAbility.turn. */
  turn(): void {
    this.set_direction(-this.character.get_facing_direction());
  }

  override _Interrupt(): void {
    // Movement._Interrupt — a state hands the body over at rest, so the next one
    // starts from a known velocity instead of inheriting the last one's.
    this.character.set_horizontal_speed(0);
    if (this.character.stats.flying) this.character.set_vertical_speed(0, false);
  }

  // --- player-relative queries (AttackAbility.gd) ---

  /**
   * These read the *tracked target* rather than a global player singleton. The
   * original goes through GameManager.get_player_position(), which means an
   * off-screen Metool still reasons about a player it cannot see; here the stage
   * assigns `target` and the queries answer conservatively without one.
   */
  protected get target(): Enemy["target"] {
    return this.character.target;
  }

  get_player_direction_relative(): number {
    const t = this.target;
    if (!t) return this.character.get_facing_direction();
    return t.pos.x > this.character.pos.x ? 1 : -1;
  }

  turn_and_face_player(): void {
    this.set_direction(this.get_player_direction_relative());
  }

  is_facing_player(): boolean {
    return this.character.get_facing_direction() === this.get_player_direction_relative();
  }

  is_player_nearby_horizontally(distance = 24): boolean {
    const t = this.target;
    return !!t && Math.abs(t.pos.x - this.character.pos.x) < distance;
  }

  is_player_nearby_vertically(distance = 24): boolean {
    const t = this.target;
    return !!t && Math.abs(t.pos.y - this.character.pos.y) < distance;
  }

  get_distance_to_player(): number {
    const t = this.target;
    if (!t) return Infinity;
    return Math.hypot(t.pos.x - this.character.pos.x, t.pos.y - this.character.pos.y);
  }
}
