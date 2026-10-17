import type { ProjectileDefinition } from "./types.js";

/**
 * Projectile definitions — the ShotStats tables (BUSTER_SHOTS / DARK_ARROW_SHOT)
 * as data. All current shots travel straight, so they share the
 * "projectile.straight" movement behaviour; homing/boomerang variants would be
 * new registered behaviours, not new data fields.
 *
 * Only the charged buster carries `breaksGuard` — guard-breaking is a property of
 * the shot in the original, and only the charged buster sets it.
 */
export const projectiles = {
  lemon: {
    id: "lemon",
    behavior: "projectile.straight",
    damage: 1,
    speed: 360,
    hitbox: { hw: 15, hh: 11, ox: 1 },
    spawnOffset: { x: 0, y: 0 },
    lifetime: 0.2,
    breaksGuard: false,
    hitFx: "lemon_hit",
    animation: { kind: "lemon", frameMs: 42, randomStartFrame: true },
    verticalRange: 1,
  },
  medium: {
    id: "medium",
    behavior: "projectile.straight",
    damage: 5,
    speed: 360,
    hitbox: { hw: 15, hh: 16, ox: 1 },
    spawnOffset: { x: 0, y: 0 },
    lifetime: 0.4,
    breaksGuard: false,
    hitFx: "lemon_hit",
    animation: { kind: "medium", frameMs: 36, randomStartFrame: true },
    verticalRange: 1,
  },
  charged: {
    id: "charged",
    behavior: "projectile.straight",
    damage: 10,
    speed: 420,
    hitbox: { hw: 17, hh: 18, ox: 3 },
    spawnOffset: { x: -10, y: -1 }, // ChargedBuster.position_setup pulls it into the cannon
    lifetime: 0.4,
    breaksGuard: true,
    hitFx: "charge_hit",
    animation: { kind: "charged", frameMs: 36, randomStartFrame: false },
    verticalRange: 0,
  },
  dark_arrow: {
    id: "dark_arrow",
    behavior: "projectile.straight",
    damage: 3,
    speed: 420,
    hitbox: { hw: 15, hh: 7.5, ox: -2 },
    spawnOffset: { x: 0, y: 0 },
    lifetime: 0.2,
    breaksGuard: false,
    hitFx: "lemon_hit", // no bespoke burst ported; reuses the buster's Basic Hit
    animation: { kind: "dark_arrow", frameMs: 1000, frameCount: 1, randomStartFrame: false },
    verticalRange: 0,
  },
} satisfies Record<string, ProjectileDefinition>;
