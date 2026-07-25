import { Registry, notWired, type BehaviorFactory } from "./types.js";
import { validateConfig } from "./configValidation.js";

/**
 * Effect registry — the registered, typed special reactions a {@link ReactionHook}
 * references (e.g. an enemy re-anchoring its hover when a recoil ends). This is
 * how enemy definitions express bespoke reactions without embedding callbacks in
 * data. Part 6 wires `create`.
 */
export type EffectFactory = BehaviorFactory<unknown, Record<string, unknown>, unknown>;

const EFFECT_IDS = ["enemy.reanchor-hover"] as const;

export const effectRegistry = new Registry<EffectFactory>();

for (const id of EFFECT_IDS) {
  effectRegistry.register({
    id,
    validate: (input) => validateConfig({}, input),
    create: () => notWired(id, "Part 6 (Enemy definitions)"),
  });
}
