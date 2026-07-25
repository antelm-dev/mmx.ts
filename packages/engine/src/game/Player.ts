import { Character } from "./Character.js";
import { World } from "./World.js";
import { Input } from "../core/Input.js";

import { Damage } from "./abilities/Damage.js";
import { Intro } from "./abilities/Intro.js";
import type { Actor } from "./Actor.js";
import { COMPILED_GAME_DATA } from "../data/index.js";
import { buildPlayerLoadout } from "./loadout/PlayerLoadout.js";

/** The loadout the default player is composed from — Player.tscn's ability list, as data. */
export const DEFAULT_PLAYER_LOADOUT = "player.x";

/**
 * The player "X" — composed from a compiled loadout ({@link CompiledLoadout})
 * rather than a hand-built ability list. The loadout owns the ability set, their
 * composition order (which tie-breaks locomotion priority), each ability's
 * priority and layer (independent action vs. locomotion/reaction), and the
 * arsenal. The default `player.x` loadout reproduces Player.tscn exactly.
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
    seed?: number,
    loadoutId: string = DEFAULT_PLAYER_LOADOUT,
  ) {
    super(world, x, y, input, seed);

    const loadout = COMPILED_GAME_DATA.loadouts.get(loadoutId);
    if (!loadout) throw new Error(`Player: unknown loadout '${loadoutId}'.`);
    buildPlayerLoadout(this, loadout, COMPILED_GAME_DATA);
  }

  /** Actor.damage routed through Damage.gd's state instead of reducing health inline. */
  override damage(value: number, inflicter?: Actor): void {
    this.events.emit("damage", value, inflicter);
    const damage = this.get_ability("Damage");
    if (damage instanceof Damage) damage.receiveHit(value, inflicter);
    // Checked here, after Damage's own _Setup has fully run its knockback, rather
    // than inline in reduce_health(): "zero_health" starts Death synchronously,
    // and interrupting Damage from partway through its own _Setup would leave the
    // rest of that _Setup still running against an ability Death just finalized.
    if (this.current_health <= 0) this.emit_zero_health();
  }

  /** Lethal terrain bypasses ordinary damage protection and invulnerability. */
  kill(): void {
    if (!this.has_health()) return;
    this.emit_zero_health();
  }

  /**
   * Start the beam-down entrance. Called once, by {@link Scene}'s constructor,
   * after the camera has already snapped to the spawn point — Intro is event-
   * started (see Intro.ts) rather than polled, so a bare `new Player()` (every
   * engine test, the headless sim) never runs it unless this is called.
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
