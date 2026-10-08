import type { AbilityDefinition } from "./types.js";

/**
 * Player ability definitions — behaviour reference, arbitration layer/priority,
 * and the tunable config each ability's class used to import from constants.
 *
 * Priorities and layers mirror the current runtime exactly:
 *   - locomotion: Idle(0) < Fall/Walk(1) < WallSlide(3) < Dash(4) <
 *     AirDash/Jump(5) < DashJump(6) < Wall/DashWallJump(7)
 *   - reaction (event-driven, still priority-arbitrated): Damage(100) <
 *     Intro(150) < Death(200)
 *   - action (independent, concurrent with movement): Shot, Charge
 */
export const abilities = {
  "player.idle": {
    id: "player.idle",
    behavior: "player.idle",
    layer: "locomotion",
    priority: 0,
  },
  "player.walk": {
    id: "player.walk",
    behavior: "player.walk",
    layer: "locomotion",
    priority: 1,
    config: { speed: 90 }, // WALK_SPEED
  },
  "player.fall": {
    id: "player.fall",
    behavior: "player.fall",
    layer: "locomotion",
    priority: 1,
    config: { dashFallSpeed: 210 }, // DASHFALL_SPEED
  },
  "player.wall-slide": {
    id: "player.wall-slide",
    behavior: "player.wall-slide",
    layer: "locomotion",
    priority: 3,
    config: { speed: 90, startDelay: 0.16 }, // WALLSLIDE_SPEED / WALLSLIDE_START_DELAY
  },
  "player.dash": {
    id: "player.dash",
    behavior: "player.dash",
    layer: "locomotion",
    priority: 4,
    config: { speed: 200, duration: 0.55, leeway: 0.1 }, // DASH_*
  },
  "player.air-dash": {
    id: "player.air-dash",
    behavior: "player.air-dash",
    layer: "locomotion",
    priority: 5,
    config: { speed: 200, duration: 0.475, maxAirdashes: 1 }, // AIRDASH_*
  },
  "player.jump": {
    id: "player.jump",
    behavior: "player.jump",
    layer: "locomotion",
    priority: 5,
    // JUMP_VELOCITY / JUMP_MAX_TIME / JUMP_LEEWAY / JUMP_FULLSPEED_PROPORTION
    config: { velocity: 320, maxTime: 0.625, leeway: 0.1, fullspeedProportion: 0.19 },
  },
  "player.dash-jump": {
    id: "player.dash-jump",
    behavior: "player.dash-jump",
    layer: "locomotion",
    priority: 6,
    config: { speed: 200, dashDuration: 0.55 }, // DASHJUMP_SPEED / DASH_DURATION
  },
  "player.wall-jump": {
    id: "player.wall-jump",
    behavior: "player.wall-jump",
    layer: "locomotion",
    priority: 7,
    // WALLJUMP_START_DELAY / WALLJUMP_MOVEAWAY_DURATION / WALLJUMP_MOVEAWAY_SPEED
    config: { startDelay: 0.128, moveawayDuration: 0.08, moveawaySpeed: 75 },
  },
  "player.dash-wall-jump": {
    id: "player.dash-wall-jump",
    behavior: "player.dash-wall-jump",
    layer: "locomotion",
    priority: 7,
  },
  "player.intro": {
    id: "player.intro",
    behavior: "player.intro",
    layer: "reaction",
    priority: 150,
    // PLAYER_INTRO_DROP_HEIGHT / PLAYER_INTRO_BEAM_SPEED / PLAYER_INTRO_THUNDER_WINDOW
    config: { dropHeight: 160.0, beamSpeed: 420.0, thunderWindow: [0.55, 1.0] },
  },
  "player.damage": {
    id: "player.damage",
    behavior: "player.damage",
    layer: "reaction",
    priority: 100,
    // PLAYER_DAMAGE_* / PLAYER_KNOCKBACK_*
    config: {
      duration: 0.6,
      invulnerability: 1.75,
      knockbackSpeed: 45,
      knockbackJumpVelocity: 190,
    },
  },
  "player.death": {
    id: "player.death",
    behavior: "player.death",
    layer: "reaction",
    priority: 200,
    config: { restartDelay: 3.8 }, // PLAYER_DEATH_RESTART_DELAY
  },
  "player.shot": {
    id: "player.shot",
    behavior: "player.shot",
    layer: "action",
    config: { armPointDuration: 0.3 }, // SHOT_ARM_POINT_DURATION
  },
  "player.charge": {
    id: "player.charge",
    behavior: "player.charge",
    layer: "action",
    // CHARGE_MIN_TIME / CHARGE_LEVEL_3 / CHARGE_LEVEL_4 / CHARGE_MAX_TIME
    config: { minTime: 0.5, level3: 1.75, level4: 2.75, maxTime: 5.0 },
  },
  // --- Zero (MMZ1 GBA) -------------------------------------------------------
  // Same behaviours, layers and priorities as X; configs converted from
  // zero-x-mashup game/sheets/zero_moves.json (px/frame and frames at 60 Hz):
  // px/s = px/f x 60, s = frames / 60. "X's" marks a value the sheet lacks.
  "zero.idle": {
    id: "zero.idle",
    behavior: "player.idle",
    layer: "locomotion",
    priority: 0,
  },
  "zero.walk": {
    id: "zero.walk",
    behavior: "player.walk",
    layer: "locomotion",
    priority: 1,
    config: { speed: 90 }, // run_speed 1.5 px/f
  },
  "zero.fall": {
    id: "zero.fall",
    behavior: "player.fall",
    layer: "locomotion",
    priority: 1,
    config: { dashFallSpeed: 210 }, // dash_speed 3.5 px/f (air control after a dash jump)
  },
  "zero.wall-slide": {
    id: "zero.wall-slide",
    behavior: "player.wall-slide",
    layer: "locomotion",
    priority: 3,
    config: { speed: 90, startDelay: 0 }, // wall_slide_speed 1.5 px/f; slides on contact
  },
  "zero.dash": {
    id: "zero.dash",
    behavior: "player.dash",
    layer: "locomotion",
    priority: 4,
    config: { speed: 210, duration: 0.5, leeway: 0.1 }, // dash_speed 3.5 px/f / dash_frames 30 / X's
  },
  "zero.jump": {
    id: "zero.jump",
    behavior: "player.jump",
    layer: "locomotion",
    priority: 5,
    // jump_velocity 5.0 px/f. Zero's jump is an impulse then gravity: maxTime just
    // under one tick at full proportion holds the rise for a single tick. Leeway X's.
    config: { velocity: 300, maxTime: 0.016, leeway: 0.1, fullspeedProportion: 1 },
  },
  "zero.dash-jump": {
    id: "zero.dash-jump",
    behavior: "player.dash-jump",
    layer: "locomotion",
    priority: 6,
    config: { speed: 210, dashDuration: 0.5 }, // dash_speed 3.5 px/f / dash_frames 30
  },
  "zero.wall-jump": {
    id: "zero.wall-jump",
    behavior: "player.wall-jump",
    layer: "locomotion",
    priority: 7,
    // kicks immediately / wall_kick_frames 8 / pushed off at run_speed 1.5 px/f
    config: { startDelay: 0, moveawayDuration: 8 / 60, moveawaySpeed: 90 },
  },
  "zero.dash-wall-jump": {
    id: "zero.dash-wall-jump",
    behavior: "player.dash-wall-jump",
    layer: "locomotion",
    priority: 7,
  },
  "zero.damage": {
    id: "zero.damage",
    behavior: "player.damage",
    layer: "reaction",
    priority: 100,
    // life.hurt_frames 24 / invulnerable_frames 60 / knockback_speed 1.0 px/f;
    // no knockback hop (the sheet keeps vertical speed). Hurt anim = streamed anim 49.
    config: { duration: 0.4, invulnerability: 1.0, knockbackSpeed: 60, knockbackJumpVelocity: 0 },
  },
  "zero.death": {
    id: "zero.death",
    behavior: "player.death",
    layer: "reaction",
    priority: 200,
    config: { restartDelay: 3.8 }, // X's (the sheet has no death sequence yet)
  },
} satisfies Record<string, AbilityDefinition>;
