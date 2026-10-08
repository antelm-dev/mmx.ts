import type { EnemyDefinition } from "./types.js";

/**
 * Enemy archetypes as data — the composition that makeMetool/makeBat used to
 * express in code. Each `reactions` table is the AI event wiring from the .tscn;
 * each `hooks` entry is a special reaction wired to a registered effect rather
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
    reactions: {
      idle: ["Patrol"],
      see_player: ["Shoot"],
      get_hit: ["Stun"], // flinch: 12 frames standing still
    },
    initialAnimation: "idle",
  },
} satisfies Record<string, EnemyDefinition>;
