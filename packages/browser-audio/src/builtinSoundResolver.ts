import type { SoundId } from "./soundIds.js";
import { GAMEPLAY_SOUND_IDS } from "./soundIds.js";
import { SoundAssetError, type SoundAssetResolver } from "./SoundAssetResolver.js";

const BUILTIN_SOUND_PATHS = {
  jump: "sounds/player/jump.wav",
  land: "sounds/player/land.wav",
  dash: "sounds/player/dash.wav",
  wallslide: "sounds/player/wallslide.wav",
  damage: "sounds/player/damage.wav",
  charge: "sounds/weapons/charge.wav",
  lemon: "sounds/weapons/lemon.wav",
  mediumShot: "sounds/weapons/medium-shot.wav",
  chargedShot: "sounds/weapons/charged-shot.wav",
  darkArrow: "sounds/weapons/dark-arrow.ogg",
  enemyHit: "sounds/enemies/enemy-hit.wav",
  shieldHit: "sounds/enemies/shield-hit.ogg",
  guardBreak: "sounds/enemies/guard-break.wav",
  enemyDeath: "sounds/enemies/enemy-death.wav",
  playerDeath: "sounds/player/player-death.wav",
  heal: "sounds/pickups/heal.wav",
  introAppear: "sounds/player/intro-appear.wav",
  introThunder: "sounds/player/intro-thunder.wav",
} as const satisfies Record<SoundId, string>;

/** @deprecated Prompt 07 removes this built-in MMX catalog; inject a project manifest resolver instead. */
export function createBuiltinSoundResolver(): SoundAssetResolver {
  return {
    resolveUrl(soundId: string): string {
      const path = BUILTIN_SOUND_PATHS[soundId as SoundId];
      if (!path) {
        throw new SoundAssetError(
          "missing",
          soundId,
          `Built-in sound '${soundId}' is not mapped in the legacy MMX catalog.`,
        );
      }
      return new URL(`../assets/${path}`, import.meta.url).href;
    },
  };
}

/** @deprecated Prompt 07 removes this legacy URL table; inject a project manifest resolver instead. */
export const SOUND_URLS = Object.fromEntries(
  GAMEPLAY_SOUND_IDS.map((soundId) => [soundId, createBuiltinSoundResolver().resolveUrl(soundId)]),
) as Record<SoundId, string>;
