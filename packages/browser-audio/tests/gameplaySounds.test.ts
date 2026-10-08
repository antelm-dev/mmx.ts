import assert from "node:assert/strict";
import { test } from "node:test";
import type { Player } from "@mmx/engine";
import { createGameplaySounds } from "../src/GameplaySounds.js";
import { createSoundEffects, type SoundEffects } from "../src/SoundEffects.js";

test("a saber swing plays the optional slash sound", () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const player = { events: { on: (name: string, fn: () => void) => handlers.set(name, fn) } };
  const played: string[] = [];
  const effects = { play: (id: string) => played.push(id), stop: () => undefined };
  createGameplaySounds({ effects: effects as unknown as SoundEffects }).attachPlayer(
    player as unknown as Player,
  );
  handlers.get("slash")!("slash1");
  assert.deepEqual(played, ["slash"]);
});

test("playing an unbound optional sound is silent, not an error", () => {
  const effects = createSoundEffects({
    resolver: { resolveUrl: () => "unused" },
    soundIds: [],
    bindings: { jump: "sfx.jump" },
    context: {
      destination: {},
      createGain: () => ({ gain: { value: 1 }, connect: () => undefined }),
    } as unknown as AudioContext,
  });
  assert.doesNotThrow(() => effects.play("slash"));
});
