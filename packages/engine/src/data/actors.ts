import type { ActorDefinition } from "./types.js";

/**
 * Actor bodies — the terrain-collision box and starting health for each composed
 * character. Player half-extents approximate Player.tscn's collision shape; enemy
 * bodies are the CharacterBody2D collisionShape2D extents from each .tscn.
 */
export const actors = {
  "player.x": {
    id: "player.x",
    body: { hw: 6, hh: 14 }, // BODY_HALF_W / BODY_HALF_H
    maxHealth: 32.0, // Actor.gd:6 MAX_HEALTH
  },
  // Zero (MMZ1 GBA) — zero-x-mashup game/sheets/zero_moves.json.
  "player.zero": {
    id: "player.zero",
    // physics.hitbox_w 14 / hitbox_h 30, halved; the sheet has no dash crouch.
    body: { hw: 7, hh: 15, dashCrouch: 0 },
    maxHealth: 16, // life.max
  },
  "enemy.metool": {
    id: "enemy.metool",
    body: { hw: 12, hh: 10 }, // Metool.tscn body extents
    maxHealth: 2, // Metool.tscn max_health
  },
  "enemy.bat": {
    id: "enemy.bat",
    body: { hw: 13.5, hh: 15.5 }, // SmallBat.tscn body extents
    maxHealth: 1, // SmallBat.tscn max_health
  },
  "enemy.pantheon": {
    id: "enemy.pantheon",
    body: { hw: 8, hh: 15 }, // enemies.json hurtbox [16, 30] doubles as the body
    maxHealth: 4, // hp
  },
} satisfies Record<string, ActorDefinition>;
