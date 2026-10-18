import { COMPILED_GAME_DATA } from "../../src/data/index.js";
import { playerWeapon, type PlayerWeapon } from "../../src/game/Character.js";

/**
 * X's tables, which the engine no longer exports: the runtime reads them from
 * the player's loadout. Read here from the built-in game data, so a test pins
 * the same numbers the default player plays with.
 */

const D = COMPILED_GAME_DATA;

function weapon(id: string): PlayerWeapon {
  const w = D.weapons.get(id);
  if (!w) throw new Error(`test data has no weapon '${id}'`);
  return playerWeapon(w);
}

function config(abilityId: string): Readonly<Record<string, unknown>> {
  const a = D.abilities.get(abilityId);
  if (!a) throw new Error(`test data has no ability '${abilityId}'`);
  return a.config;
}
const num = (abilityId: string, key: string): number => config(abilityId)[key] as number;

export const BUSTER = weapon("buster");
export const DARK_ARROW = weapon("dark_arrow");
export const BUSTER_SHOTS = BUSTER.shots;
export const DARK_ARROW_SHOT = DARK_ARROW.shots[0]!;
export const MAX_SHOTS_ALIVE = BUSTER.maxLiveShots;
export const SUB_WEAPON_MAX_AMMO = DARK_ARROW.maxAmmo;

export const WALK_SPEED = num("player.walk", "speed");
export const JUMP_VELOCITY = num("player.jump", "velocity");
export const DASH_SPEED = num("player.dash", "speed");
export const CHARGE_MIN_TIME = num("player.charge", "minTime");
export const CHARGE_LEVEL_3 = num("player.charge", "level3");
export const CHARGE_LEVEL_4 = num("player.charge", "level4");
export const PLAYER_DAMAGE_DURATION = num("player.damage", "duration");
export const PLAYER_DAMAGE_INVULNERABILITY = num("player.damage", "invulnerability");
export const PLAYER_HIT_INVULNERABILITY = PLAYER_DAMAGE_INVULNERABILITY;
export const PLAYER_KNOCKBACK_SPEED = num("player.damage", "knockbackSpeed");
export const PLAYER_KNOCKBACK_JUMP_VELOCITY = num("player.damage", "knockbackJumpVelocity");
export const PLAYER_DEATH_RESTART_DELAY = num("player.death", "restartDelay");
export const PLAYER_INTRO_DROP_HEIGHT = num("player.intro", "dropHeight");
