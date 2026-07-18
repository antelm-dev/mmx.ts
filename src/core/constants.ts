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
export const LEMON_SPEED = 400.0; // buster shot horizontal speed (Lemon)

// --- Actor.gd ---
export const MAX_HEALTH = 32.0; // Actor.gd:6

// World / rendering
export const TILE_SIZE = 16;
export const VIEW_WIDTH = 398; // project.godot resolution
export const VIEW_HEIGHT = 224;

// Player AABB half-extents (approx of Player.tscn collision shape)
export const BODY_HALF_W = 6;
export const BODY_HALF_H = 14;
