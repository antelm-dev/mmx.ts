import type { Enemy } from './Enemy.js';
import type { EnemyAbility } from './enemy/EnemyAbility.js';

/**
 * The event lists an enemy scene declares on its AI node, by ability name.
 *
 * In Godot these are `on_idle = [ NodePath("../Patrol") ]` style exports, i.e.
 * the scene author wires *which* abilities answer *which* event. Keeping that
 * shape — rather than hard-coding the transitions into each enemy — is what lets
 * a Metool and a bat share one AI: the Metool answers "saw the player" with Hide
 * and the bat answers it with Pursuit, and neither one needs its own dispatcher.
 */
export interface AIEvents {
  /** Fires while nothing is executing (AI.handle_idle_ability_calls). */
  on_idle?: string[];
  /** Fires every frame the player is inside the vision box. */
  on_see_player?: string[];
  /** Fires when the enemy's contact damage lands on the player. */
  on_touch_player?: string[];
  /** Fires when a shot breaks the shield (Enemy `guard_break`). */
  on_guard_break?: string[];
  /** Fires when the enemy takes damage but survives (`got_hit`). */
  on_get_hit?: string[];
  /** Fires once at zero health; the AI deactivates itself first. */
  on_death?: string[];
  /** Fires when the enemy walks into a wall it is facing. */
  on_hit_wall?: string[];
}

/**
 * Port of AI.gd.
 *
 * Each frame it raises whatever events are true and starts the abilities wired
 * to them. Starting is not forcing: an ability still has to pass its own
 * `_StartCondition` and the conflicting_moves check, so a Metool that is stunned
 * ignores "I can see the player" until the stun releases it.
 */
export class EnemyAI {
  active = true;
  events: AIEvents = {};
  timer = 0;

  constructor(private readonly enemy: Enemy) {
    // AI.gd wires these in _ready. The AI reacts to what happened to the
    // character; it never polls the character's health or shield itself.
    enemy.events.on('guard_break', () => this.fire(this.events.on_guard_break));
    enemy.events.on('got_hit', () => this.fire(this.events.on_get_hit));
    enemy.events.on('zero_health', () => this.onZeroHealth());
  }

  /** Declare the scene's event wiring. Returns the AI so enemies can chain it. */
  configure(events: AIEvents): this {
    this.events = events;
    return this;
  }

  /** AI.gd:deactivate — stops the AI and drops whatever it was doing. */
  deactivate(): void {
    this.enemy.interrupt_all_moves();
    this.active = false;
  }

  /** DamageOnTouch.touch_target, forwarded by the stage that detected the hit. */
  onTouchedPlayer(): void {
    this.fire(this.events.on_touch_player);
  }

  private onZeroHealth(): void {
    if (!this.active) return;
    // Order matters and is taken from AI.on_zero_health: deactivate first so the
    // idle/vision events cannot restart a patrol underneath the death sequence,
    // *then* start the death ability — which is why `fire` below bypasses the
    // active check that everything else goes through.
    this.deactivate();
    this.start(this.events.on_death);
  }

  /**
   * AI._physics_process — the per-frame event sweep, in the original's order.
   */
  step(dt: number): void {
    if (!this.active) {
      // The death ability still has to run out its explosion; it is executing,
      // so processMoves in Enemy.tick keeps driving it.
      return;
    }
    this.timer += dt;

    this.handleVision();
    this.handleWallHit();
    this.handleIdle();
  }

  private handleVision(): void {
    const target = this.enemy.target;
    if (target && this.enemy.canSee(target)) this.fire(this.events.on_see_player);
  }

  private handleWallHit(): void {
    const wall = this.enemy.wall_ahead(20);
    if (wall !== 0 && wall === this.enemy.get_facing_direction()) {
      this.fire(this.events.on_hit_wall);
    }
  }

  /**
   * AI.handle_idle_ability_calls — idle means "nothing is executing", not "the
   * enemy is standing still". A patrol that ends therefore restarts on the very
   * next frame, which is how a Metool paces back and forth forever from a single
   * ability that only knows how to walk one leg of it.
   */
  private handleIdle(): void {
    if (this.enemy.executing_moves.length === 0) this.fire(this.events.on_idle);
  }

  private fire(names: string[] | undefined): void {
    if (!this.active) return;
    this.start(names);
  }

  /**
   * AI.activate_ability. The health gate is the original's, and it is why the
   * on_death list is started through here too: it is the one list raised at the
   * moment health hits zero, before anything else can slip in behind it.
   */
  private start(names: string[] | undefined): void {
    if (!names) return;
    for (const name of names) {
      const ability = this.enemy.abilities.find((a) => a.name === name);
      if (!ability) throw new Error(`${this.enemy.kind}: AI names unknown ability '${name}'`);
      if (ability.executing) continue;
      if (ability.wantsToStart()) this.launch(ability);
    }
  }

  /**
   * BaseAbility.StopAnyConflictingMoves + ExecuteOnce.
   *
   * The interrupt runs *before* the new ability sets itself up, so the outgoing
   * ability's `_Interrupt` (which zeroes velocity) cannot wipe the speed the
   * incoming one just asked for.
   */
  private launch(ability: EnemyAbility): void {
    for (const move of [...this.enemy.executing_moves] as EnemyAbility[]) {
      if (move !== ability && move.conflictsWith(ability.name)) move.Interrupt(ability.name);
    }
    ability.ExecuteOnce();
  }
}
