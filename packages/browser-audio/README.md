# @mmx/browser-audio

Browser-only Web Audio support for MMX projects. It resolves logical sound
assets from a Studio project manifest, loads and decodes them, and maps engine
events to gameplay sound effects.

## Public API

- `SoundEffects` / `createSoundEffects` load and play arbitrary logical sound
  IDs through a supplied `SoundAssetResolver`.
- `createSoundEffectsFromManifest` resolves sound assets from a
  `@mmx/project-schema` asset manifest and base URL.
- `GameplaySounds` / `createGameplaySounds` attach the standard MMX sound set
  to a `Scene`, `Player`, or `Enemy`.
- `createProjectSoundResolver` validates manifest asset IDs and produces sound
  URLs.
- `GAMEPLAY_SOUND_IDS` and the binding helpers describe the built-in logical
  sound contract.

```ts
import { createGameplaySounds, createSoundEffectsFromManifest } from "@mmx/browser-audio";

const effects = createSoundEffectsFromManifest(project, assetBaseUrl);
const audio = createGameplaySounds({ effects });

await audio.load();
audio.attachScene(scene);
audio.setMasterVolume(0.8);
```

Call `audio.unlock()` from a user gesture when the browser's autoplay policy
has suspended the `AudioContext`. Call `audio.stop()` when replacing a scene or
disposing the host.

This package requires browser Web Audio and Fetch APIs. It should not be
imported by the headless simulator or other Node-only code.

## Development

```bash
pnpm --filter @mmx/browser-audio test
pnpm --filter @mmx/browser-audio build
```
