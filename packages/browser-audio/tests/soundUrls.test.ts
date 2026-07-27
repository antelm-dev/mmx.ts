import assert from "node:assert/strict";
import { test } from "node:test";
import { createBuiltinSoundResolver, SOUND_URLS } from "../src/builtinSoundResolver.js";
import { GAMEPLAY_SOUND_IDS, type SoundId } from "../src/soundIds.js";

const EXPECTED: Record<SoundId, string> = {
  jump: "/sounds/player/jump.wav",
  land: "/sounds/player/land.wav",
  dash: "/sounds/player/dash.wav",
  wallslide: "/sounds/player/wallslide.wav",
  damage: "/sounds/player/damage.wav",
  charge: "/sounds/weapons/charge.wav",
  lemon: "/sounds/weapons/lemon.wav",
  mediumShot: "/sounds/weapons/medium-shot.wav",
  chargedShot: "/sounds/weapons/charged-shot.wav",
  darkArrow: "/sounds/weapons/dark-arrow.ogg",
  enemyHit: "/sounds/enemies/enemy-hit.wav",
  shieldHit: "/sounds/enemies/shield-hit.ogg",
  guardBreak: "/sounds/enemies/guard-break.wav",
  enemyDeath: "/sounds/enemies/enemy-death.wav",
  playerDeath: "/sounds/player/player-death.wav",
  heal: "/sounds/pickups/heal.wav",
  introAppear: "/sounds/player/intro-appear.wav",
  introThunder: "/sounds/player/intro-thunder.wav",
};

test("every built-in audio URL is defined and does not end with /undefined", () => {
  const resolver = createBuiltinSoundResolver();
  for (const soundId of GAMEPLAY_SOUND_IDS) {
    const url = resolver.resolveUrl(soundId);
    assert.equal(typeof url, "string", soundId);
    assert.ok(url.length > 0, soundId);
    assert.ok(!url.endsWith("/undefined"), `${soundId}: ${url}`);
    assert.ok(!url.includes("assets/undefined"), `${soundId}: ${url}`);
  }
});

test("deprecated SOUND_URLS still refer to the intended sound paths", () => {
  assert.deepEqual(Object.keys(SOUND_URLS).sort(), Object.keys(EXPECTED).sort());
  for (const soundId of GAMEPLAY_SOUND_IDS) {
    assert.ok(
      SOUND_URLS[soundId].includes(EXPECTED[soundId]),
      `${soundId}: expected ${EXPECTED[soundId]} in ${SOUND_URLS[soundId]}`,
    );
  }
});
