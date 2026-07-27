import type { SoundId } from "./soundIds.js";
import { GAMEPLAY_SOUND_IDS } from "./soundIds.js";

export type SoundBindingMap = Readonly<Record<string, string>>;

export function resolveBoundAssetId(
  soundId: string,
  bindings: SoundBindingMap | null | undefined,
): string {
  return bindings?.[soundId] ?? soundId;
}

export function requiredGameplaySoundIds(): readonly SoundId[] {
  return GAMEPLAY_SOUND_IDS;
}

export function collectBoundAssetIds(bindings: SoundBindingMap): string[] {
  return [...new Set(Object.values(bindings))].sort((a, b) => a.localeCompare(b));
}
