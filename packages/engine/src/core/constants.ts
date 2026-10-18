/**
 * Gameplay constants ported 1:1 from the Godot project where a value existed.
 * Source references are noted per constant.
 *
 * NOTE (data-driven refactor): gravity and fall speed are COMPATIBILITY EXPORTS
 * read from the compiled default physics ({@link COMPILED_GAME_DATA}). Editing a
 * value means editing data/physics.ts, not here.
 *
 * Nothing here reads a player, an enemy or a pickup: the runtime takes those
 * from the player's compiled loadout and the scene's game data, so the engine
 * loads without them.
 *
 * The genuine global invariants — the fixed step, tile size, and framebuffer
 * dimensions, whose configurability would violate simulation assumptions — stay
 * defined here as real constants.
 */

import { COMPILED_GAME_DATA } from "../data/index.js";
import type { CompiledEnemy, ProjectileDefinition } from "../data/types.js";

// Fixed physics tick — Godot _physics_process default is 60 Hz. A true invariant:
// changing it redefines what one recorded tick means. Stays in core.
export const PHYSICS_FPS = 60;
export const DT = 1 / PHYSICS_FPS;

// --- Actor.gd (→ data/physics.ts) ---
const _D = COMPILED_GAME_DATA;
export const GRAVITY = _D.physics.gravity; // Actor.gd:12
export const MAX_FALL_VELOCITY = _D.physics.maxFallVelocity; // Actor.gd:13
export const FLOOR_SNAP_LENGTH = _D.physics.floorSnapLength; // Actor.gd:16
/**
 * Physics ticks a body ignores OneWay tiles after "down + jump" on one, so the
 * floor sensor and snap do not catch it again before gravity has moved its feet
 * below the tile's top edge.
 */
export const ONE_WAY_DROP_TICKS = 8;

// Character.gd:32 — the "Shot Position" node muzzle offset, in character-local
// pixels. x is mirrored by facing direction; y is not.
export const SHOT_POSITION = { x: 18, y: -2 } as const;

/**
 * Per-ability muzzle adjustments, added to SHOT_POSITION while that ability runs
 * (Ability.gd:176 adjust_shot_position_on_initialize, undone on ability end) —
 * a crouched-forward dash fires from further out than a standing shot does.
 * Values are the scene overrides in Player.tscn, falling back to each script's
 * exported default where the scene does not override it.
 */
export const SHOT_POSITION_ADJUST: Readonly<Record<string, { x: number; y: number }>> = {
  Walk: { x: 6, y: -2 }, // Walk.gd:7
  Dash: { x: 18, y: 4 }, // Dash.gd:17
  AirDash: { x: 14, y: 4 }, // Player.tscn:879
  Fall: { x: 4, y: -5 }, // Fall.gd:5
  Jump: { x: 4, y: 0 }, // Player.tscn:969
  DashJump: { x: 4, y: 0 }, // Player.tscn:957
  WallJump: { x: 4, y: 0 }, // Player.tscn:860
  DashWallJump: { x: 4, y: 0 }, // Player.tscn:843
};

/**
 * One projectile's flight stats, as a weapon fires it — see {@link shotStats}.
 * A weapon's shots are indexed by charge level (data/weapons.ts).
 */
export interface ShotStats {
  /** Clip name in shot_anims.json. */
  kind: string;
  damage: number;
  speed: number; // WeaponShot.gd horizontal_velocity
  /** collisionShape2D half-extents and its offset from the projectile origin. */
  halfW: number;
  halfH: number;
  offsetX: number;
  /** Extra spawn offset applied on top of the muzzle (position_setup overrides). */
  spawnX: number;
  spawnY: number;
  /** randf_range(-r, r) vertical spawn scatter — WeaponShot.gd vertical_position_range. */
  verticalRange: number;
  /** Lingering time after the shot dies, while its hit particle plays. */
  timeOutsideScreen: number;
  hitFx: string;
  /** Lemon.references_setup randomises the start frame so shots desync visually. */
  randomStartFrame: boolean;
  /** Per-frame milliseconds of the clip's spin loop (from the Aseprite sheets). */
  frameMs: number;
  /** Frames in the clip loop. Defaults to {@link SHOT_FRAME_COUNT} (the buster's
   *  8-frame spin) when unset — Dark Arrow overrides this to 1, a static sprite. */
  frameCount?: number;
}

/** Every buster projectile sheet is an 8-frame loop. */
export const SHOT_FRAME_COUNT = 8;

// --- SpriteEffect.gd (Basic Hit.tscn / Big Hit.tscn) ---
// The impact effect is a 2x2 sheet played once at 32fps and then *destroyed*
// (SpriteEffect.process_frames: one_shot -> destroy). Its lifetime is therefore
// 4/32 = 0.125s, which is shorter than the spent projectile's own countdown —
// the burst is long gone before the shot node finishes lingering.
export const HIT_FX_FPS = 32; // animation_speed
export const HIT_FX_FRAME_COUNT = 4; // hframes 2 * vframes 2

// --- Charge-up aura (Player.tscn ChargingParticle / ChargedParticle) ---
// A GPUParticles2D with `amount = 1` and a 4x4 particles_animation sheet: one
// 16-frame pass per 0.3s particle lifetime, restarting for as long as the emitter
// runs. That is a 16-frame loop by another name.
export const CHARGE_FX_FRAME_COUNT = 16; // 4 h_frames * 4 v_frames
export const CHARGE_FX_LIFETIME = 0.3; // GPUParticles2D lifetime
/** Emitter offset from the sprite origin — Player.tscn position = (0, 3.99). */
export const CHARGE_FX_OFFSET_Y = 4;

// --- Dash kick-up smoke (Player.tscn Dash/dash_particle) ---
// A SpriteEffect Sprite2D on the Dash node: 3x2 sheet, animation_speed 24, one_shot.
// Dash.gd emits it exactly once per dash (`emitted_dash`), and SpriteEffect.emit()
// reparents the copy to `get_tree().current_scene` — so the puff is left behind in
// *world* space and X dashes away from it rather than dragging it along.
export const DASH_FX_FPS = 24; // animation_speed
export const DASH_FX_FRAME_COUNT = 6; // hframes 3 * vframes 2
/**
 * Emitter offset from the body origin — Player.tscn position = (-22, 0), mirrored
 * by the dash direction (SpriteEffect.emit negates position.x when scale_x < 0), so
 * the smoke is kicked up 22px *behind* X. The frame is 32px tall and centred on this
 * point, which puts its bottom edge just under his feet.
 */
export const DASH_FX_OFFSET_X = -22;
export const DASH_FX_OFFSET_Y = 0;

/**
 * Which aura tier is showing. Charge.gd swaps between three separate emitters
 * rather than recolouring one, so the tier picks both the sheet and the tint.
 */
export const enum ChargeTier {
  None = 0,
  Charging = 1, // charge_1.png, x_charging_particle.tres
  Charged = 2, // charge_2.png, x_charged_particle.tres
  Super = 3, // charge_2.png, x_supercharged_particle.tres
}

/** The {@link ShotStats} a projectile definition fires with. */
export function shotStats(p: ProjectileDefinition): ShotStats {
  const stats: ShotStats = {
    kind: p.animation.kind,
    damage: p.damage,
    speed: p.speed,
    halfW: p.hitbox.hw,
    halfH: p.hitbox.hh,
    offsetX: p.hitbox.ox ?? 0,
    spawnX: p.spawnOffset.x,
    spawnY: p.spawnOffset.y,
    verticalRange: p.verticalRange,
    timeOutsideScreen: p.lifetime,
    hitFx: p.hitFx,
    randomStartFrame: p.animation.randomStartFrame,
    frameMs: p.animation.frameMs,
  };
  if (p.animation.frameCount !== undefined) stats.frameCount = p.animation.frameCount;
  return stats;
}

// --- Actor.gd ---
// The bare-Actor default (Actor.gd:6), a literal: no player record is read.
// Player code must read `player.max_health` (set from its loadout's actor).
export const MAX_HEALTH = 32;

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

/**
 * Per-enemy data, read off the Godot scenes (Metool.tscn / SmallBat.tscn).
 *
 * Godot RectangleShape2D `extents` are already half-extents, so they map onto the
 * engine's hw/hh directly. Three boxes matter and they are deliberately different
 * sizes in the original: the *body* is what collides with terrain, the *hurtbox*
 * is what player shots have to reach, and the *vision* box is what wakes the AI.
 */
export interface EnemyStats {
  /** Key into enemy_anims.json's `actors` table. */
  sheet: string;
  max_health: number;
  /** DamageOnTouch.damage — dealt to the player on contact. */
  touch_damage: number;
  /** Terrain collision box (the CharacterBody2D's collisionShape2D). */
  hw: number;
  hh: number;
  /** Hurtbox half-extents (area2D) — what player projectiles test against. */
  hurt_hw: number;
  hurt_hh: number;
  /** AI vision box half-extents and its offset from the body centre. */
  vision_hw: number;
  vision_hh: number;
  vision_oy: number;
  /** Fliers ignore gravity and terrain (SmallBat.tscn: collision_mask = 0). */
  flying: boolean;
}

/** Rebuild the legacy {@link EnemyStats} shape from a compiled enemy definition. */
export function enemyStats(e: CompiledEnemy): EnemyStats {
  return {
    sheet: e.sheet,
    max_health: e.maxHealth,
    touch_damage: e.touchDamage,
    hw: e.actor.body.hw,
    hh: e.actor.body.hh,
    hurt_hw: e.hurtbox.hw,
    hurt_hh: e.hurtbox.hh,
    vision_hw: e.perception.hw,
    vision_hh: e.perception.hh,
    vision_oy: e.perception.oy,
    flying: e.movement === "flying",
  };
}

/** EnemyDamage.max_flash_time — how long the white hit flash stays on. */
export const ENEMY_FLASH_TIME = 0.035;

// --- Enemy death burst (Shared/QuickEnemyDeath.tscn "Explosion Particles") ---
// A GPUParticles2D, amount 15, emitting into a 25px sphere with no velocity and
// no gravity — each particle just sits at its spawn offset and plays the 4x4
// explosion sheet once (see EXPLOSION_FX_FPS in build-shots.mjs for why the
// rate is chosen rather than read off the source). Both current enemies set
// explosion_duration to 0 (EnemyDeath._Setup), so the burst starts on the same
// tick the sprite disappears — see enemy/Death.ts.
export const ENEMY_EXPLOSION_FRAME_COUNT = 16; // 4 h_frames * 4 v_frames
export const ENEMY_EXPLOSION_PUFF_COUNT = 6; // amount 15, thinned for a 32px sprite
export const ENEMY_EXPLOSION_RADIUS = 10; // emission_sphere_radius 25, same reason

// --- Enemy death debris (Shared/QuickEnemyDeath.tscn "Remains/remains_particles") ---
// A second GPUParticles2D, amount 4, one-shot and fully explosive (all four leave
// at once): RemainsParticle.tres launches them within the material's default 45
// degree spread of straight up at up to 400px/s (initial_velocity_random 0.69,
// so as slow as 400 * (1 - 0.69) = 124px/s) and pulls them down with a flat
// 800px/s gravity independent of GRAVITY above. Each chunk shows one still icon
// from the 6x3 remains sheet for its whole flight rather than animating.
export const ENEMY_DEBRIS_COUNT = 4;
export const ENEMY_DEBRIS_FRAME_COUNT = 18; // 6 h_frames * 3 v_frames
export const ENEMY_DEBRIS_SPEED = 400; // initial_velocity
export const ENEMY_DEBRIS_SPEED_RANDOM = 0.69; // initial_velocity_random
export const ENEMY_DEBRIS_SPREAD_DEGREES = 45; // ParticleProcessMaterial default spread
export const ENEMY_DEBRIS_GRAVITY = 800; // RemainsParticle.tres gravity.y
export const ENEMY_DEBRIS_LIFETIME = 1.1; // remains_particles lifetime 2.0, trimmed — see EnemyDebris.ts

/**
 * PickUp.gd's own shared behaviour — do_heal()'s `timer > last_time_increased +
 * 0.06` metering and process_gravity(gravity := 800) — inherited unchanged by
 * every PickUp subclass, not just HealthPickup.gd. AmmoPickup.gd (see
 * WeaponCapsule in Pickup.ts) reuses both rather than restating them.
 */
export const PICKUP_TICK_INTERVAL = 0.06;
export const PICKUP_GRAVITY = 800;

// World / rendering
export const TILE_SIZE = 16;

// The SNES framebuffer is 256x224. Keeping the original's 224 scanlines preserves
// the vertical framing every jump arc and camera dead zone was tuned against —
// widening instead is what turns 8:7 into 16:9. Exact 16:9 of 224 is 398.22, so
// 398 is the nearest integer width (1.7768 vs 1.7778) and, being even, keeps
// half-view arithmetic on whole pixels. That is 142px of extra horizontal view
// over the SNES, which only ever shows more of the room — never less.
export const VIEW_WIDTH = 398;
export const VIEW_HEIGHT = 224;

// The bare-Actor default body (Player.tscn's collision shape), as literals: no
// player record is read. Player code must read `player.hw` / `hh` / `body_hh`
// (set from its loadout's actor), never these.
export const BODY_HALF_W = 6;
export const BODY_HALF_H = 14;
/** X's dash crouch (Player.reduce_hitbox), for actors whose body does not set one. */
export const DEFAULT_DASH_CROUCH = 4;
