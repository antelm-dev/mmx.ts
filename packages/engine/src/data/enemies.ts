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
} satisfies Record<string, EnemyDefinition>;
