import type { EnemyDefinition } from "./types.js";

/**
 * Enemy archetypes as data — the composition that makeMetool/makeBat used to
 * express in code. Each `abilityConfig` entry is one ability node's tuning (see
 * ENEMY_BEHAVIOR_SCHEMAS); each `reactions` table is the AI event wiring from the
 * .tscn; each `hooks` entry is a special reaction wired to a registered effect rather
 * than an ability (the bat re-anchoring its hover after a recoil).
 *
 * Vision boxes are NOT mirrored by facing — every shape here is symmetric about
 * x — so `perception.ox` stays 0 and only the vertical offset varies.
 */
export const enemies = {
  metool: {
    id: "metool",
    sheet: "metool",
    actor: "enemy.metool",
    hurtbox: { hw: 9, hh: 10 }, // Metool.tscn area2D extents
    touchDamage: 3, // DamageOnTouch.damage
    movement: "ground",
    perception: { hw: 158, hh: 18, oy: -6 }, // AI/vision extents at y -6
    shield: { breakable: true },
    abilities: ["Patrol", "Hide", "Stun", "Death"],
    abilityConfig: {
      // CrabPatrol as set on Metool.tscn; random_rest_time makes each rest 0.8-1.8s.
      Patrol: {
        travelSpeed: 25,
        travelTime: 0.8,
        restMin: 0.8,
        randomTurn: false,
        conflicts: ["Hide", "Stun"],
      },
      // Hide.gd's beats; the advance runs at Movement.gd's 90, the player's walk speed.
      Hide: {
        openDelay: 3,
        advanceRangeX: 64,
        advanceRangeY: 16,
        giveUpRangeX: 80,
        reshieldDelay: 0.1,
        speed: 90,
      },
      // EnemyStun on Metool.tscn: the broken guard stays broken.
      Stun: {
        duration: 1.65,
        animation: "stun",
        recoverAnimation: "",
        reactivateShield: false,
        gravity: true,
        conflicts: [],
      },
      Death: { explosionDuration: 0 }, // Metool.tscn explosion_duration
    },
    reactions: {
      idle: ["Patrol"],
      see_player: ["Hide"],
      guard_break: ["Stun"],
    },
    initialAnimation: "idle",
  },
  bat: {
    id: "bat",
    sheet: "bat",
    actor: "enemy.bat",
    hurtbox: { hw: 10, hh: 10 }, // SmallBat.tscn area2D default extents
    touchDamage: 1, // DamageOnTouch default
    movement: "flying",
    perception: { hw: 102, hh: 86.5, oy: 1.5 }, // AI/vision extents at y 1.5
    abilities: ["Hover", "Pursuit", "Recoil", "Death"],
    abilityConfig: {
      Hover: { area: 16, travelTime: 0.5, restDuration: 0.5 }, // BeePatrol on SmallBat.tscn
      Pursuit: { speed: 80, giveUpDistance: 200, weaveRate: 4 }, // BatPursuit.gd
      Recoil: { speed: 200, duration: 0.7 }, // BatJump.gd
      Death: { explosionDuration: 0 }, // QuickEnemyDeath
    },
    reactions: {
      idle: ["Hover"],
      see_player: ["Pursuit"],
      touch_player: ["Recoil"],
    },
    // BeePatrol.ability_who_updates_patrol_area = BatJump: re-centre the hover
    // wherever the recoil left it, so a chasing bat does not spring back.
    hooks: [{ on: "ability_end", ability: "Recoil", effect: "enemy.reanchor-hover" }],
    initialAnimation: "idle",
  },
  // Pantheon Hunter (MMZ1 object 25) — zero-x-mashup game/sheets/enemies.json.
  pantheon: {
    id: "pantheon",
    sheet: "pantheon",
    actor: "enemy.pantheon",
    hurtbox: { hw: 8, hh: 15 }, // hurtbox [16, 30], halved
    touchDamage: 2, // contact_damage
    movement: "ground",
    // sight 140 px; enemy.rs only aims while |dy| < 48.
    perception: { hw: 140, hh: 48, oy: 0 },
    abilities: ["Patrol", "Shoot", "Stun", "Death"],
    abilityConfig: {
      // walk_speed 0.5 px/frame; Shoot and Stun both interrupt the walk.
      Patrol: {
        travelSpeed: 30,
        travelTime: 0.8,
        restMin: 0.8,
        randomTurn: false,
        conflicts: ["Shoot", "Stun"],
      },
      // shot_cooldown 100 frames; enemy.rs holds the shoot pose 24 frames.
      Shoot: { projectile: "pantheon_shot", cooldown: 100 / 60, recoverTime: 24 / 60 },
      // The 12-frame flinch on the "hit" clip.
      Stun: {
        duration: 12 / 60,
        animation: "hit",
        recoverAnimation: "",
        reactivateShield: false,
        gravity: true,
        conflicts: [],
      },
      Death: { explosionDuration: 0 },
    },
    reactions: {
      idle: ["Patrol"],
      see_player: ["Shoot"],
      get_hit: ["Stun"], // flinch: 12 frames standing still
    },
    initialAnimation: "idle",
  },
} satisfies Record<string, EnemyDefinition>;
