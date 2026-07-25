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
} satisfies Record<string, ActorDefinition>;
