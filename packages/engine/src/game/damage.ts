export type { Knockback } from "../data/types.js";

/** How one resolved hit ended, as the damage log shows it. */
export type DamageResult = "hit" | "killed" | "immune" | "shielded" | "guard_break";

/**
 * One resolved hit, recorded by {@link Stage} on the tick it lands. Hits skipped
 * by invulnerability are not recorded: they repeat every frame boxes overlap.
 */
export interface DamageEvent {
  frame: number;
  /** Projectile id, or "melee", "touch", "hazard". */
  attack: string;
  weapon?: string;
  charge?: number;
  element?: string;
  source: { kind: string; runtimeId: string };
  target: { kind: string; runtimeId: string };
  base: number;
  /** Integer percent; 100 when none applies. */
  multiplier: number;
  forced?: number;
  armor: number;
  dealt: number;
  result: DamageResult;
}

export interface DamageInput {
  base: number;
  /** Integer percent (200 = ×2); 0 makes the target immune. Default 100. */
  multiplier?: number;
  /** A forced value replaces `base × multiplier`, but not the armor step. */
  forced?: number;
  armor?: number;
}

/**
 * The one damage chain: forced value, else `round(base × multiplier / 100)`,
 * then minus armor with a floor of 1. A multiplier of 0 is immunity (0 dealt);
 * a value of 0 or less deals nothing.
 */
export function computeDamage({ base, multiplier = 100, forced, armor = 0 }: DamageInput): {
  dealt: number;
  result: "hit" | "immune";
} {
  if (multiplier === 0) return { dealt: 0, result: "immune" };
  const v = forced ?? Math.round((base * multiplier) / 100);
  return { dealt: v <= 0 ? 0 : Math.max(1, v - armor), result: "hit" };
}
