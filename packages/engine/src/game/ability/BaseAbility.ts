import { PHYSICS_FPS } from "../../core/constants.js";
import type { AbilityUser } from "../AbilityUser.js";

/**
 * Lifecycle base — port of BaseAbility.gd.
 *
 * ExecuteOnce -> Initialize -> _Setup, then each frame ExecuteEachFrame ->
 * _ResetCondition / _EndCondition / _Update, and EndAbility -> Finalize -> _Interrupt.
 *
 * The Godot conflict system (conflicting_moves arrays defined in Player.tscn, which
 * are not available as source) is replaced by the `independent` + `priority` fields,
 * resolved centrally in AbilityUser. Behaviour is documented in the README.
 *
 * The owner is a type parameter because the lifecycle is shared by two families
 * that do *not* share an interface: the player's abilities are driven by input and
 * need a {@link Character}, the enemies' are driven by an AI and need an
 * {@link Enemy}. Everything this class itself touches lives on AbilityUser, so the
 * state machine in AbilityUser can still hold them in one list.
 */
export abstract class BaseAbility<TOwner extends AbilityUser = AbilityUser> {
  active = true;
  executing = false;
  timer = 0;
  last_time_used = 0;
  animation = "";

  /** Independent action layer (Shot/Charge): runs concurrently, never blocks movement. */
  independent = false;
  /** Locomotion selection priority — higher interrupts lower (see AbilityUser). */
  priority = 0;

  abstract readonly name: string;

  constructor(protected character: TOwner) {}

  get_time(): number {
    return this.character.get_time();
  }

  // --- overridable hooks ---
  _StartCondition(): boolean {
    return true;
  }
  _Setup(): void {}
  _Update(_dt: number): void {}
  _EndCondition(): boolean {
    return true;
  }
  _ResetCondition(): boolean {
    return false;
  }
  _Interrupt(): void {}

  /** Ability adds the input check; base is always eligible. */
  shouldExecute(): boolean {
    return true;
  }

  /** Central start gate used by AbilityUser. */
  wantsToStart(): boolean {
    return this.active && !this.executing && this._StartCondition() && this.shouldExecute();
  }

  ExecuteOnce(): void {
    if (!this.active) return;
    this.Initialize();
    this._Setup();
  }

  Initialize(): void {
    this.executing = true;
    this.timer = 0;
    this.last_time_used = this.get_time();
    if (!this.character.executing_moves.includes(this)) {
      this.character.executing_moves.push(this);
    }
    // Ability.gd plays its configured sound during Initialize. Keep the engine
    // renderer-agnostic and announce the same lifecycle point for browser audio.
    this.character.events.emit("ability_started", this.name);
  }

  BeforeEveryFrame(dt: number): void {
    this.timer += dt;
  }

  /** Runs every frame for every moveset ability, executing or not (a few Godot
   *  abilities had their own _physics_process for background timers). */
  alwaysTick(_dt: number): void {}

  ExecuteEachFrame(dt: number): void {
    if (!this.executing) return;
    this.BeforeEveryFrame(dt);
    if (this._ResetCondition()) this.ResetAbility();
    else if (this._EndCondition()) this.EndAbility();
    else this._Update(dt);
  }

  EndAbility(): void {
    this.Finalize();
    this.character.remove_from_executing_list(this);
    this.character.enable_floor_snap();
    // BaseAbility.gd emits `ability_end` here. The player port had no listener
    // for it so it was dropped; the bat's patrol re-anchors on it (see
    // BeePatrol.ability_who_updates_patrol_area), so it is emitted again.
    this.character.events.emit("ability_end", this.name);
  }

  ResetAbility(): void {
    this.Finalize();
    this.ExecuteOnce();
  }

  Finalize(): void {
    this.executing = false;
    this.timer = 0;
    this._Interrupt();
  }

  Interrupt(_by: string): void {
    this.EndAbility();
  }

  is_initial_frame(): boolean {
    return this.timer < 1.1 / PHYSICS_FPS;
  }

  play_animation(a: string, frame = 0): void {
    this.character.play_animation(a, frame);
  }

  play_animation_once(a: string): void {
    this.character.play_animation_once(a);
  }
}
