import { COMPILED_GAME_DATA, type CompiledGameData } from "@mmx/engine/data";
import type { Region } from "@mmx/project-schema";

/**
 * Clip names each player behaviour plays: the `animation = "…"` and
 * `play_animation*("…")` literals of mmx-core-ts `packages/engine/src/game/abilities/`
 * (Idle.ts, Walk.ts, Fall.ts, WallSlide.ts, Dash.ts + AirDash.ts, Jump.ts + DashJump.ts,
 * WallJump.ts + DashWallJump.ts, Intro.ts, Damage.ts). Update it with those files;
 * saber swings name their clips in the ability config instead (data/abilities.ts).
 */
const BEHAVIOR_CLIPS: Record<string, string[]> = {
  "player.idle": ["recover", "idle", "weak"],
  "player.walk": ["walk_start", "walk"],
  "player.fall": ["fall"],
  "player.wall-slide": ["slide"],
  "player.dash": ["dash"],
  "player.air-dash": ["dash"],
  "player.jump": ["jump"],
  "player.dash-jump": ["jump"],
  "player.wall-jump": ["walljump"],
  "player.dash-wall-jump": ["walljump"],
  "player.intro": ["beam", "beam_in", "beam_equip"],
  "player.damage": ["damage"],
};

/** Clip names a player loadout of `gameData` expects in its animation asset (default loadout X). */
export function requiredPlayerClips(loadoutId = "player.x", gameData: CompiledGameData = COMPILED_GAME_DATA): string[] {
  const names = new Set<string>();
  for (const ability of gameData.loadouts.get(loadoutId)?.abilities ?? []) {
    for (const name of BEHAVIOR_CLIPS[ability.behavior] ?? []) names.add(name);
    for (const value of Object.values(ability.config)) {
      const animation = (value as { animation?: unknown } | null)?.animation;
      if (typeof animation === "string") names.add(animation);
    }
  }
  return [...names];
}

/** Deleting the only clip removes the asset, which must not leave the player binding dangling. */
export function canDeleteClip(clipCount: number, isPlayerAnimation: boolean): boolean {
  return clipCount > 1 || !isPlayerAnimation;
}

/** Default frame duration of a new clip, in 1/60 s (clips are written with `speed: 60`). */
export const DURATION_PRESETS = [
  { label: "NES (8/60)", duration: 8 },
  { label: "SNES X (4/60)", duration: 4 },
  { label: "GBA Zero (4/60)", duration: 4 },
] as const;

/** Move one item of a list to another index. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

/**
 * "Align feet": the anchor (C-ANCHOR, pixels from the region's top-left) at the
 * bottom-centre of the opaque pixels' bounding box; bottom-centre of the region
 * when it is fully transparent.
 */
export function feetAnchor(px: Uint8ClampedArray, sheetWidth: number, region: Region): [number, number] {
  const [rx, ry, w, h] = region;
  let minX = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = ry; y < ry + h; y++) {
    for (let x = rx; x < Math.min(rx + w, sheetWidth); x++) {
      if (!px[(y * sheetWidth + x) * 4 + 3]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = y;
    }
  }
  if (maxY < 0) return [Math.round(w / 2), h];
  return [Math.round((minX + maxX + 1) / 2) - rx, maxY + 1 - ry];
}
