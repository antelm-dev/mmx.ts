import { Character } from "./Character.js";
import { World } from "./World.js";
import { Input } from "../core/Input.js";

import { Damage } from "./abilities/Damage.js";
import { Intro } from "./abilities/Intro.js";
import type { DamageInflicter } from "./abilities/Damage.js";
import type { CompiledGameData, Knockback } from "../data/types.js";
import { buildPlayerLoadout } from "./loadout/PlayerLoadout.js";
import { DEFAULT_DASH_CROUCH } from "../core/constants.js";

/**
 * The loadout a scene plays when its project names none: X's id. The engine ships
 * no loadout; the X pack (`@mmx/pack-mmx-player-x`) provides it.
 */
export const DEFAULT_PLAYER_LOADOUT = "player.x";

/**
 * The player "X" — composed from a compiled loadout ({@link CompiledLoadout})
 * rather than a hand-built ability list. The loadout owns the ability set, their
 * composition order (which tie-breaks locomotion priority), each ability's
 * priority and layer (independent action vs. locomotion/reaction), and the
 * arsenal. The X pack's `player.x` loadout reproduces Player.tscn exactly.
 *
 * Extension points not ported here (documented in README): armor sets (Hermes/Icarus),
 * boss weapons, Ride Armor, subtanks, AirJump double-jump.
 */
export class Player extends Character {
  constructor(
    world: World,
    x: number,
    y: number,
    input: Input,
    seed: number | undefined,
    loadoutId: string,
    gameData: CompiledGameData,
  ) {
    super(world, x, y, input, seed);

    const loadout = gameData.loadouts.get(loadoutId);
    if (!loadout) throw new Error(`Player: unknown loadout '${loadoutId}'.`);
    const { body, maxHealth } = loadout.actor;
    this.hw = body.hw;
    this.hh = this.body_hh = body.hh;
    this.dash_crouch = body.dashCrouch ?? DEFAULT_DASH_CROUCH;
    this.max_health = this.current_health = maxHealth;
    this.armor = loadout.actor.armor ?? 0;
    this.regen_every_frames = loadout.actor.regenEveryFrames ?? 0;
    buildPlayerLoadout(this, loadout, gameData);
  }

  /**
   * Actor.damage routed through Damage.gd's state instead of reducing health inline.
   * `knockback` overrides the Damage config for this hit only. Returns whether the
   * hit landed (Damage accepted it).
   */
  override damage(value: number, inflicter?: DamageInflicter, knockback?: Knockback): boolean {
    this.events.emit("damage", value, inflicter);
    const damage = this.get_ability("Damage");
    const landed = damage instanceof Damage && damage.receiveHit(value, inflicter, knockback);
    // Checked here, after Damage's own _Setup has fully run its knockback, rather
    // than inline in reduce_health(): "zero_health" starts Death synchronously,
    // and interrupting Damage from partway through its own _Setup would leave the
    // rest of that _Setup still running against an ability Death just finalized.
    if (this.current_health <= 0) this.emit_zero_health();
    return landed;
  }

  /** Lethal terrain bypasses ordinary damage protection and invulnerability. */
  kill(): void {
    if (!this.has_health()) return;
    this.emit_zero_health();
  }

  /**
   * Start the beam-down entrance. Called once, by {@link Scene}'s constructor,
   * after the camera has already snapped to the spawn point — Intro is event-
   * started (see Intro.ts) rather than polled, so a player built directly with
   * `new Player(...)` from a pack's loadout (most engine tests, the headless sim)
   * never runs it unless this is called.
   */
  beginIntro(): void {
    const intro = this.get_ability("Intro");
    if (intro instanceof Intro && !intro.hasStarted) intro.ExecuteOnce();
  }

  /** Space-separated names of the currently executing abilities (debug). */
  stateString(): string {
    return this.executing_moves.map((m) => m.name).join(" ") || "-";
  }
}
