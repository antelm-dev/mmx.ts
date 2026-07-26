import assert from "node:assert/strict";
import { test } from "node:test";
import { SOUND_URLS, type SoundName } from "../src/SoundEffects.js";

const EXPECTED: Record<SoundName, string> = {
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

test("every audio URL is defined and does not end with /undefined", () => {
  for (const [name, url] of Object.entries(SOUND_URLS)) {
    assert.equal(typeof url, "string", name);
    assert.ok(url.length > 0, name);
    assert.ok(!url.endsWith("/undefined"), `${name}: ${url}`);
    assert.ok(!url.includes("assets/undefined"), `${name}: ${url}`);
  }
});

test("audio URLs refer to the intended sound paths", () => {
  assert.deepEqual(Object.keys(SOUND_URLS).sort(), Object.keys(EXPECTED).sort());
  for (const name of Object.keys(EXPECTED) as SoundName[]) {
    assert.ok(
      SOUND_URLS[name].includes(EXPECTED[name]),
      `${name}: expected ${EXPECTED[name]} in ${SOUND_URLS[name]}`,
    );
  }
});
