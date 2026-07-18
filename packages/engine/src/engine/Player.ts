import { Character } from "./Character.js";
import { World } from "./World.js";
import { Input } from "../core/Input.js";

import { Idle } from "./abilities/Idle.js";
import { Walk } from "./abilities/Walk.js";
import { Fall } from "./abilities/Fall.js";
import { WallSlide } from "./abilities/WallSlide.js";
import { Dash } from "./abilities/Dash.js";
import { Jump } from "./abilities/Jump.js";
import { DashJump } from "./abilities/DashJump.js";
import { WallJump } from "./abilities/WallJump.js";
import { DashWallJump } from "./abilities/DashWallJump.js";
import { Shot } from "./abilities/Shot.js";
import { Charge } from "./abilities/Charge.js";
import { Damage } from "./abilities/Damage.js";
import { Death } from "./abilities/Death.js";
import type { Actor } from "./Actor.js";
import { AirDash } from "./abilities/AirDash.js";

/**
 * The player "X" — port of Player.tscn's ability node list.
 *
 * Abilities are added in conflict-priority order (as the source Player.tscn lists
 * them). Locomotion priority tie-breaks resolve by this order; independent action
 * abilities (Shot, Charge) run concurrently with movement.
 *
 * Extension points not ported here (documented in README): armor sets (Hermes/Icarus),
 * boss weapons, Ride Armor, subtanks, AirJump double-jump.
 */
export class Player extends Character {
  constructor(world: World, x: number, y: number, input: Input, seed?: number) {
    super(world, x, y, input, seed);

    this.add(new Idle(this));
    this.add(new Walk(this));
    this.add(new Fall(this));
    this.add(new WallSlide(this));
    this.add(new Dash(this));
    this.add(new AirDash(this));
    this.add(new Jump(this));
    this.add(new DashJump(this));
    this.add(new WallJump(this));
    this.add(new DashWallJump(this));

    // high-priority event states (Damage.gd / PlayerDeath.gd, Player.tscn)
    this.add(new Damage(this));
    this.add(new Death(this));

    // independent action layer
    this.add(new Shot(this));
    this.add(new Charge(this));
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

  /** Space-separated names of the currently executing abilities (debug). */
  stateString(): string {
    return this.executing_moves.map((m) => m.name).join(" ") || "-";
  }
}
