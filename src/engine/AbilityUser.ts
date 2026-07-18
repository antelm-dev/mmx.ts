import { Actor } from './Actor.js';
import { BaseAbility } from './ability/BaseAbility.js';
import { Ability } from './ability/Ability.js';
import { AnimationPlayer, AnimData, AnimationLayer, Region } from './Animation.js';
import type { World } from './World.js';

/**
 * Moveset owner + state-machine driver — port of AbilityUser.gd.
 *
 * The Godot original tries to start every ability each frame and lets a substring/
 * priority conflict system (configured in Player.tscn) interrupt conflicting moves.
 * Those conflict arrays are not in source, so this port resolves locomotion centrally:
 *
 *   - `independent` abilities (Shot, Charge) run concurrently and never block movement.
 *   - Exactly one locomotion ability is active at a time; a higher-`priority` candidate
 *     interrupts the current one, and a candidate also takes over when the current
 *     ability's _EndCondition() fires. This reproduces the intended MMX transitions
 *     (Idle<Walk<WallSlide<Dash/AirDash<Jump<Wall/DashJump).
 */
export class AbilityUser extends Actor {
  moveset: BaseAbility[] = [];
  executing_moves: BaseAbility[] = [];
  last_used_ability: BaseAbility | null = null;

  /** The AnimatedSprite the Godot abilities drive (AbilityUser.gd `animatedSprite`). */
  readonly anim = new AnimationPlayer();

  constructor(world: World, x: number, y: number) {
    super(world, x, y);
    this.anim.onFinished = (animation) => this.events.emit('animation_finished', animation);
  }

  add(ability: BaseAbility): void {
    this.moveset.push(ability);
  }

  get_ability(name: string): BaseAbility | undefined {
    return this.moveset.find((m) => m.name === name);
  }

  // --- animation (AbilityUser.gd's animatedSprite wrappers) ---

  /** Load the exported SpriteFrames data; without it clips have no frames and the
   *  engine keeps behaving as it did when animation was a bare string. */
  loadAnimations(data: AnimData): void {
    this.anim.load(data);
  }

  play_animation(anim: string, frame = 0): void {
    this.anim.play(anim, frame);
  }
  play_animation_once(anim: string): void {
    this.anim.play_once(anim);
  }
  get_animation(): string {
    return this.anim.animation;
  }
  set_animation_frame(frame: number): void {
    this.anim.set_frame(frame);
  }

  /** Shot.gd swaps the whole SpriteFrames resource while the buster is out. */
  set_animation_layer(layer: AnimationLayer): void {
    this.anim.animation_layer = layer;
  }
  get_animation_layer(): AnimationLayer {
    return this.anim.animation_layer;
  }

  /** Atlas region for the frame on screen, or null when no clip data is loaded. */
  currentRegion(): Region | null {
    return this.anim.currentRegion();
  }

  /** Advance the sprite and re-emit Godot's `animation_finished` signal. */
  protected stepAnimation(dt: number): void {
    this.anim.advance(dt);
  }

  // --- executing-list bookkeeping ---
  remove_from_executing_list(move: BaseAbility): void {
    const i = this.executing_moves.indexOf(move);
    if (i >= 0) this.executing_moves.splice(i, 1);
    if (!move.independent) this.last_used_ability = move;
  }

  get_last_used_ability(): string {
    return this.last_used_ability ? this.last_used_ability.name : '';
  }

  is_executing(name: string): boolean {
    return this.executing_moves.some((m) => m.name === name);
  }
  is_executing_either(names: string[]): boolean {
    return this.executing_moves.some((m) => names.includes(m.name));
  }
  get_executing_ability(name: string): BaseAbility | undefined {
    return this.executing_moves.find((m) => m.name === name);
  }
  currentLocomotion(): BaseAbility | null {
    return this.executing_moves.find((m) => !m.independent) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------
  stepAbilities(dt: number): void {
    for (const m of this.moveset) {
      m.alwaysTick(dt);
      if (m instanceof Ability) m.pollBuffer();
    }
    this.startMoves();
    this.processMoves(dt);
  }

  private startMoves(): void {
    // Independent action layer (concurrent).
    for (const a of this.moveset) {
      if (a.independent && !a.executing && a.wantsToStart()) a.ExecuteOnce();
    }

    // Locomotion layer (mutually exclusive).
    const loco = this.moveset.filter((a) => !a.independent);
    const current = this.currentLocomotion();
    const best = this.pickBest(loco.filter((a) => a !== current && a.wantsToStart()));

    if (!current) {
      if (best) best.ExecuteOnce();
      return;
    }

    const currentEnding = current._EndCondition();
    if (best && (best.priority > current.priority || currentEnding)) {
      current.Interrupt(best.name);
      best.ExecuteOnce();
    } else if (currentEnding) {
      current.EndAbility();
      const fallback = this.pickBest(loco.filter((a) => a.wantsToStart()));
      if (fallback) fallback.ExecuteOnce();
    }
  }

  /** Highest priority wins; ties resolved by moveset order (first stays). */
  private pickBest(cands: BaseAbility[]): BaseAbility | null {
    let best: BaseAbility | null = null;
    for (const c of cands) {
      if (best === null || c.priority > best.priority) best = c;
    }
    return best;
  }

  private processMoves(dt: number): void {
    // snapshot: abilities may end/remove themselves during their update
    for (const m of [...this.executing_moves]) {
      m.ExecuteEachFrame(dt);
    }
  }
}
