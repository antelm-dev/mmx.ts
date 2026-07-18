/**
 * Gameplay constants ported 1:1 from the Godot project where a value existed.
 * Source references are noted per constant.
 */

// Fixed physics tick — Godot _physics_process default is 60 Hz.
export const PHYSICS_FPS = 60;
export const DT = 1 / PHYSICS_FPS;

// --- Actor.gd ---
export const GRAVITY = 900.0; // Actor.gd:12
export const MAX_FALL_VELOCITY = 375.0; // Actor.gd:13
export const FLOOR_SNAP_LENGTH = 8.0; // Actor.gd:16

// --- Movement.gd ---
export const WALK_SPEED = 90.0; // Movement.gd:6 horizontal_velocity
export const JUMP_VELOCITY = 320.0; // Movement.gd:7 jump_velocity

// --- Fall.gd ---
export const DASHFALL_SPEED = 210.0; // Fall.gd:34

// --- Jump.gd ---
export const JUMP_MAX_TIME = 0.625; // Jump.gd:4 max_jump_time
export const JUMP_LEEWAY = 0.1; // Jump.gd:5 leeway_time (coyote + buffer)
export const JUMP_FULLSPEED_PROPORTION = 0.19; // Jump.gd:6 fullspeed_proportion

// --- Dash.gd ---
export const DASH_SPEED = 200.0; // scene export (Movement default 90 is overridden per-scene)
export const DASH_DURATION = 0.55; // Dash.gd:4
export const DASH_LEEWAY = 0.1; // Dash.gd:6 leeway (input buffer)

// --- AirDash.gd ---
export const AIRDASH_SPEED = 200.0;
export const AIRDASH_DURATION = 0.475; // AirDash.gd:4 comment
export const AIRDASH_MAX = 1; // AirDash.gd max_airdashes (Icarus legs -> 2)

// --- DashJump.gd ---
export const DASHJUMP_SPEED = 200.0; // retains dash speed into the jump arc

// --- Wallslide.gd ---
export const WALLSLIDE_SPEED = 90.0; // Wallslide.gd horizontal_speed / slide speed
export const WALLSLIDE_START_DELAY = 0.16; // Wallslide.gd:4 start_delay

// --- Walljump.gd ---
export const WALLJUMP_START_DELAY = 0.128; // Walljump.gd:4
export const WALLJUMP_MOVEAWAY_DURATION = 0.08; // Walljump.gd:5
export const WALLJUMP_MOVEAWAY_SPEED = 75.0; // Walljump.gd:8

// --- Charge.gd ---
export const CHARGE_MIN_TIME = 0.5; // Charge.gd:16 minimum_charge_time
export const CHARGE_LEVEL_3 = 1.75; // Charge.gd:18 level_3_charge
export const CHARGE_LEVEL_4 = 2.75; // Charge.gd:19 level_4_charge
export const CHARGE_MAX_TIME = 5.0; // Charge.gd maximum_charge_time

// --- Shot.gd ---
export const SHOT_ARM_POINT_DURATION = 0.3; // Shot.gd default_arm_point_duration

// --- Weapon.gd (X Buster.tscn) ---
// Only three projectiles exist in the buster's `shots` array — Lemon, Medium,
// Charged — so charge level 3 (which Charge.gd only ever returns for an upgraded
// arm cannon) clamps onto the same Charged Buster as level 2.
export const MAX_SHOTS_ALIVE = 3; // Weapon.gd max_shots_alive
export const MAX_CHARGED_SHOTS_ALIVE = 3; // Weapon.gd max_charged_shots_alive

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
 * The three buster projectiles, indexed by charge level.
 * Sources: Lemon.tscn / Medium Buster.tscn / Charged Buster.tscn, with the
 * unset fields falling back to WeaponShot.gd's exported defaults.
 */
export interface ShotStats {
  /** Clip name in shot_anims.json. */
  kind: 'lemon' | 'medium' | 'charged';
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
  hitFx: 'lemon_hit' | 'charge_hit';
  /** Lemon.references_setup randomises the start frame so shots desync visually. */
  randomStartFrame: boolean;
  /** Per-frame milliseconds of the 8-frame spin loop (from the Aseprite sheets). */
  frameMs: number;
}

/** Every buster projectile sheet is an 8-frame loop. */
export const SHOT_FRAME_COUNT = 8;

export const BUSTER_SHOTS: readonly ShotStats[] = [
  {
    kind: 'lemon',
    damage: 1, // WeaponShot.gd:4 default
    speed: 360, // WeaponShot.gd:7 default
    halfW: 15,
    halfH: 11, // Lemon.tscn:13
    offsetX: 1, // Lemon.tscn:30
    spawnX: 0,
    spawnY: 0,
    verticalRange: 1,
    timeOutsideScreen: 0.2, // Lemon.tscn:20
    hitFx: 'lemon_hit', // Basic Hit.tscn
    randomStartFrame: true,
    frameMs: 42, // lemon.json
  },
  {
    kind: 'medium',
    damage: 5, // Medium Buster.tscn:20
    speed: 360,
    halfW: 15,
    halfH: 16, // Medium Buster.tscn:13
    offsetX: 1,
    spawnX: 0,
    spawnY: 0,
    verticalRange: 1,
    timeOutsideScreen: 0.4,
    hitFx: 'lemon_hit', // Medium Buster.tscn:6 — Basic Hit, same as the lemon
    randomStartFrame: true,
    frameMs: 36, // medium_shot.json
  },
  {
    kind: 'charged',
    damage: 10, // Charged Buster.tscn:31
    speed: 420, // Charged Buster.tscn:34
    halfW: 17,
    halfH: 18, // Charged Buster.tscn:15
    offsetX: 3, // Charged Buster.tscn:58
    // ChargedBuster.position_setup pulls the big shot back into the cannon.
    spawnX: -10,
    spawnY: -1,
    verticalRange: 0, // ChargedBuster.position_setup drops the jitter
    timeOutsideScreen: 0.4,
    hitFx: 'charge_hit', // Big Hit.tscn
    randomStartFrame: false,
    frameMs: 36, // heavy_shot.json
  },
];

// --- Actor.gd ---
export const MAX_HEALTH = 32.0; // Actor.gd:6

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

// Player AABB half-extents (approx of Player.tscn collision shape)
export const BODY_HALF_W = 6;
export const BODY_HALF_H = 14;
