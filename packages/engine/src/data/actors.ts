import type { ActorDefinition } from "./types.js";

/**
 * Actor bodies — the terrain-collision box and starting health for each composed
 * character. Player half-extents approximate Player.tscn's collision shape. Enemy
 * bodies come with their enemies, from a project's data (the MMX Starter pack).
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
} satisfies Record<string, ActorDefinition>;
