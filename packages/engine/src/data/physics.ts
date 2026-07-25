import type { PhysicsDefinition } from "./types.js";

/**
 * Physics tuning, lifted from the Godot Actor.gd values that used to live in
 * core/constants. The fixed step and tile size stay in core — moving those would
 * change what "one tick" means and invalidate every recording — but gravity and
 * fall speed are ordinary tunables.
 */
export const physics = {
  gravity: 900.0, // Actor.gd:12
  maxFallVelocity: 375.0, // Actor.gd:13
  floorSnapLength: 8.0, // Actor.gd:16
} satisfies PhysicsDefinition;
