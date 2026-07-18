import { Character } from './Character.js';
import { World } from './World.js';
import { Input } from '../core/Input.js';

import { Idle } from './abilities/Idle.js';
import { Walk } from './abilities/Walk.js';
import { Fall } from './abilities/Fall.js';
import { WallSlide } from './abilities/WallSlide.js';
import { Dash } from './abilities/Dash.js';
import { AirDash } from './abilities/AirDash.js';
import { Jump } from './abilities/Jump.js';
import { DashJump } from './abilities/DashJump.js';
import { WallJump } from './abilities/WallJump.js';
import { DashWallJump } from './abilities/DashWallJump.js';
import { Shot } from './abilities/Shot.js';
import { Charge } from './abilities/Charge.js';
import { Damage } from './abilities/Damage.js';
import type { Actor } from './Actor.js';

/**
 * The player "X" — port of Player.tscn's ability node list.
 *
 * Abilities are added in conflict-priority order (as the source Player.tscn lists
 * them). Locomotion priority tie-breaks resolve by this order; independent action
 * abilities (Shot, Charge) run concurrently with movement.
 *
 * Extension points not ported here (documented in README): armor sets (Hermes/Icarus),
 * boss weapons, Ride Armor, death, subtanks, AirJump double-jump.
 */
export class Player extends Character {
  constructor(world: World, x: number, y: number, input: Input, seed?: number) {
    super(world, x, y, input, seed);

    this.add(new Idle(this));
    this.add(new Walk(this));
    this.add(new Fall(this));
    this.add(new WallSlide(this));
    this.add(new Dash(this));
    // this.add(new AirDash(this));
    this.add(new Jump(this));
    this.add(new DashJump(this));
    this.add(new WallJump(this));
    this.add(new DashWallJump(this));

    // high-priority event state (Damage.gd / Player.tscn)
    this.add(new Damage(this));

    // independent action layer
    this.add(new Shot(this));
    this.add(new Charge(this));
  }

  /** Actor.damage routed through Damage.gd's state instead of reducing health inline. */
  override damage(value: number, inflicter?: Actor): void {
    this.events.emit('damage', value, inflicter);
    const damage = this.get_ability('Damage');
    if (damage instanceof Damage) damage.receiveHit(value, inflicter);
  }

  /** Space-separated names of the currently executing abilities (debug). */
  stateString(): string {
    return this.executing_moves.map((m) => m.name).join(' ') || '-';
  }
}
