import type { Character } from "../Character.js";
import type { BaseAbility } from "../ability/BaseAbility.js";
import type { CompiledGameData, CompiledLoadout } from "../../data/types.js";
import { abilityRegistry, type AbilityConfig, type RuntimeContext } from "../../behaviors/index.js";

import { Idle } from "../abilities/Idle.js";
import { Walk, type WalkConfig } from "../abilities/Walk.js";
import { Fall, type FallConfig } from "../abilities/Fall.js";
import { WallSlide, type WallSlideConfig } from "../abilities/WallSlide.js";
import { Dash, type DashConfig } from "../abilities/Dash.js";
import { AirDash, type AirDashConfig } from "../abilities/AirDash.js";
import { Jump, type JumpConfig } from "../abilities/Jump.js";
import { DashJump, type DashJumpConfig } from "../abilities/DashJump.js";
import { WallJump, type WallJumpConfig } from "../abilities/WallJump.js";
import { DashWallJump, type DashWallJumpConfig } from "../abilities/DashWallJump.js";
import { Intro } from "../abilities/Intro.js";
import { Damage, type DamageConfig } from "../abilities/Damage.js";
import { Death, type DeathConfig } from "../abilities/Death.js";
import { Shot, type ShotConfig } from "../abilities/Shot.js";
import { Charge, type ChargeConfig } from "../abilities/Charge.js";

/**
 * Player-ability runtime wiring (Part 5).
 *
 * The behaviour registry (Part 4) already knows every `player.*` id and validates
 * its config; this module — living in the game layer, where the ability classes
 * are — attaches the real `create` to each registered entry. That keeps the
 * behaviours module free of runtime-class imports (and free of the import cycle
 * that would create), while still resolving a `behavior` id to executable code
 * through the one registry.
 *
 * Every configurable ability consumes its typed config from the loadout; only
 * Idle and Intro still read the compat constants. X's configs hold the same
 * values as those constants, so the default X moveset is unchanged.
 */

type Ctor = (owner: Character, config: AbilityConfig, ctx: RuntimeContext) => BaseAbility;

const FACTORIES: Readonly<Record<string, Ctor>> = {
  "player.idle": (o) => new Idle(o),
  "player.walk": (o, c) => new Walk(o, c as unknown as WalkConfig),
  "player.fall": (o, c) => new Fall(o, c as unknown as FallConfig),
  "player.wall-slide": (o, c) => new WallSlide(o, c as unknown as WallSlideConfig),
  "player.dash": (o, c) => new Dash(o, c as unknown as DashConfig),
  "player.air-dash": (o, c) => new AirDash(o, c as unknown as AirDashConfig),
  "player.jump": (o, c) => new Jump(o, c as unknown as JumpConfig),
  "player.dash-jump": (o, c) => new DashJump(o, c as unknown as DashJumpConfig),
  "player.wall-jump": (o, c) => new WallJump(o, c as unknown as WallJumpConfig),
  "player.dash-wall-jump": (o, c) => new DashWallJump(o, c as unknown as DashWallJumpConfig),
  "player.intro": (o) => new Intro(o),
  "player.damage": (o, c) => new Damage(o, c as unknown as DamageConfig),
  "player.death": (o, c) => new Death(o, c as unknown as DeathConfig),
  "player.shot": (o, c) => new Shot(o, c as unknown as ShotConfig),
  "player.charge": (o, c) => new Charge(o, c as unknown as ChargeConfig),
};

// Attach each real create to the registry entry registered in Part 4.
for (const [id, make] of Object.entries(FACTORIES)) {
  const entry = abilityRegistry.get(id);
  abilityRegistry.replace({
    ...entry,
    create: (owner, config, ctx) => make(owner as Character, config as AbilityConfig, ctx),
  });
}

/**
 * Compose a player's moveset from a compiled loadout: instantiate each ability
 * slot in order through the registry, then stamp the loadout's arbitration
 * metadata (priority + independent/action layer) so composition — not the class
 * defaults — is authoritative.
 */
export function buildPlayerLoadout(
  player: Character,
  loadout: CompiledLoadout,
  gameData: CompiledGameData,
): void {
  const ctx: RuntimeContext = { gameData };
  for (const ability of loadout.abilities) {
    const instance = abilityRegistry
      .get(ability.behavior)
      .create(player, ability.config, ctx) as BaseAbility;
    instance.priority = ability.priority;
    instance.independent = ability.layer === "action";
    player.add(instance);
  }
}
