import { playerWeapon, type Character } from "../Character.js";
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
import { Intro, type IntroConfig } from "../abilities/Intro.js";
import { Damage, type DamageConfig } from "../abilities/Damage.js";
import { Death, type DeathConfig } from "../abilities/Death.js";
import { Shot, type ShotConfig } from "../abilities/Shot.js";
import { Charge, type ChargeConfig } from "../abilities/Charge.js";
import { Slash, type SlashConfig } from "../abilities/Slash.js";

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
 * Every configurable ability consumes its typed config from the loadout, and
 * the player's weapons come from the loadout too: nothing reads a constant.
 */

/**
 * Subclasses that inherit their parent slots' configs under their own (an
 * AirDash is a Dash, a DashWallJump a WallJump, and so on).
 */
const INHERITS: Readonly<Record<string, readonly string[]>> = {
  "player.air-dash": ["player.dash"],
  "player.dash-jump": ["player.jump"],
  "player.wall-jump": ["player.jump"],
  "player.dash-wall-jump": ["player.jump", "player.wall-jump"],
};

/** Fall and its Jump subclasses, which share the loadout's air control and dash fall. */
const FALLS: ReadonlySet<string> = new Set([
  "player.fall",
  "player.jump",
  "player.dash-jump",
  "player.wall-jump",
  "player.dash-wall-jump",
]);

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
  "player.intro": (o, c) => new Intro(o, c as unknown as IntroConfig),
  "player.damage": (o, c) => new Damage(o, c as unknown as DamageConfig),
  "player.death": (o, c) => new Death(o, c as unknown as DeathConfig),
  "player.shot": (o, c) => new Shot(o, c as unknown as ShotConfig),
  "player.charge": (o, c) => new Charge(o, c as unknown as ChargeConfig),
  "player.slash": (o, c) => new Slash(o, c as unknown as SlashConfig),
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
 * Compose a player from a compiled loadout: instantiate each ability slot in
 * order through the registry, then stamp the loadout's arbitration metadata
 * (priority + independent/action layer) so composition — not the class
 * defaults — is authoritative; then equip the loadout's weapons.
 */
export function buildPlayerLoadout(
  player: Character,
  loadout: CompiledLoadout,
  gameData: CompiledGameData,
): void {
  const ctx: RuntimeContext = { gameData };
  // Merged after validation, so each schema keeps its exact keys.
  const configOf = (behavior: string) =>
    loadout.abilities.find((a) => a.behavior === behavior)?.config;
  // Fall.gd's air control is the walk speed (Movement.gd's horizontal_velocity);
  // a loadout without the walk or fall slot has none.
  const air = {
    airSpeed: configOf("player.walk")?.speed ?? 0,
    dashFallSpeed: configOf("player.fall")?.dashFallSpeed ?? 0,
  };
  for (const ability of loadout.abilities) {
    const config = Object.assign(
      {},
      FALLS.has(ability.behavior) ? air : {},
      ...(INHERITS[ability.behavior] ?? []).map(configOf),
      ability.config,
    );
    const instance = abilityRegistry
      .get(ability.behavior)
      .create(player, config, ctx) as BaseAbility;
    instance.priority = ability.priority;
    instance.independent = ability.layer === "action";
    player.add(instance);
  }
  player.equipWeapons(
    loadout.weapons.map((id) => {
      const weapon = gameData.weapons.get(id);
      if (!weapon) throw new Error(`loadout '${loadout.id}': unknown weapon '${id}'`);
      return playerWeapon(weapon);
    }),
    loadout.initialWeapon,
  );
}
