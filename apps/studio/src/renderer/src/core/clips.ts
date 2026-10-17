import {
  COMPILED_GAME_DATA,
  type CompiledGameData,
  type EnemyDefinition,
  type GameDataOverlay,
} from "@mmx/engine/data";
import type { ProjectIssue } from "@mmx/project-io";
import type { AnimationFrame, FrameBox, ProjectAsset, Region } from "@mmx/project-schema";

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
export function requiredPlayerClips(
  loadoutId = "player.x",
  gameData: CompiledGameData = COMPILED_GAME_DATA,
): string[] {
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

/**
 * Clip names each enemy ability plays: the `animation = "…"` and `play_animation*("…")`
 * literals of `packages/engine/src/game/enemy/` (clips.test.ts checks them). Stun names
 * its clips in its config (`animation`, `recoverAnimation`), and Death its weak phase's
 * (`weakAnimation`).
 */
export const ENEMY_ABILITY_CLIPS: Readonly<Record<string, readonly string[]>> = {
  Patrol: ["walk", "idle"],
  Hide: ["defense", "open", "walk"],
  Stun: [],
  Hover: ["idle"],
  Pursuit: ["idle"],
  Recoil: ["jump", "idle"],
  Shoot: ["aim", "shoot", "idle"],
  Death: [],
  Roll: ["roll"],
};

/** The clips `enemy` plays: its first clip, its abilities', and those its configs name. */
export function enemyClips(
  enemy: Pick<EnemyDefinition, "initialAnimation" | "abilities" | "abilityConfig">,
): string[] {
  const names = new Set([enemy.initialAnimation]);
  for (const ability of enemy.abilities) {
    for (const name of ENEMY_ABILITY_CLIPS[ability] ?? []) names.add(name);
    const config = enemy.abilityConfig?.[ability];
    for (const value of [config?.animation, config?.recoverAnimation, config?.weakAnimation]) {
      if (typeof value === "string" && value !== "") names.add(value);
    }
  }
  return [...names];
}

/**
 * Problems: each project enemy (data/game.json, compiled without errors) drawn from a
 * project animation that lacks a clip it plays. Play still runs; the enemy is not drawn
 * during that clip.
 */
export function enemyClipIssues(
  overlay: GameDataOverlay | undefined,
  assets: readonly ProjectAsset[],
): ProjectIssue[] {
  return Object.entries(overlay?.enemies ?? {}).flatMap(([id, enemy]): ProjectIssue[] => {
    const sheet = assets.find((asset) => asset.id === enemy?.sheet);
    if (sheet?.kind !== "animation") return [];
    const missing = enemyClips(enemy).filter((name) => !sheet.animations[name]);
    if (missing.length === 0) return [];
    return [
      {
        severity: "warning",
        code: "enemy.clips",
        path: "/data/game.json",
        message: `Enemy '${id}' animation '${sheet.id}' has no clip for: ${missing.join(", ")}.`,
      },
    ];
  });
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
export function feetAnchor(
  px: Uint8ClampedArray,
  sheetWidth: number,
  region: Region,
): [number, number] {
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

// --- Frame boxes (C-BOX): `{ x, y, w, h }` from the feet (the frame anchor), y down, as drawn. ---

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

/**
 * The box spanned by two points `a`, `b` in region pixels (any order, fractions
 * allowed), clamped to the `w`×`h` region and rounded to whole pixels, at least
 * 1×1, then measured from `anchor`.
 */
export function boxFromPoints(
  a: readonly [number, number],
  b: readonly [number, number],
  anchor: readonly [number, number],
  [w, h]: readonly [number, number],
): FrameBox {
  const span = (p: number, q: number, size: number): [number, number] => {
    const lo = clamp(Math.round(Math.min(p, q)), 0, size - 1);
    return [lo, clamp(Math.round(Math.max(p, q)), lo + 1, size)];
  };
  const [left, right] = span(a[0], b[0], w);
  const [top, bottom] = span(a[1], b[1], h);
  return { x: left - anchor[0], y: top - anchor[1], w: right - left, h: bottom - top };
}

/** `box` moved by whole pixels `dx`, `dy`, kept inside the `w`×`h` region where it fits. */
export function moveBox(
  box: FrameBox,
  dx: number,
  dy: number,
  anchor: readonly [number, number],
  [w, h]: readonly [number, number],
): FrameBox {
  const left = clamp(anchor[0] + box.x + Math.round(dx), 0, Math.max(0, w - box.w));
  const top = clamp(anchor[1] + box.y + Math.round(dy), 0, Math.max(0, h - box.h));
  return { ...box, x: left - anchor[0], y: top - anchor[1] };
}

/** `frame` with these boxes; an absent hurtbox or empty hitbox list is left out. */
export function withBoxes(
  frame: AnimationFrame,
  hurtbox: FrameBox | undefined,
  hitboxes: readonly FrameBox[],
): AnimationFrame {
  const { hurtbox: _hurt, hitboxes: _hit, ...rest } = frame;
  return {
    ...rest,
    ...(hurtbox ? { hurtbox } : {}),
    ...(hitboxes.length > 0 ? { hitboxes: [...hitboxes] } : {}),
  };
}

/** `frames` with frame `from`'s boxes copied onto each of `targets` (boxes stay relative to each frame's feet). */
export function copyBoxes(
  frames: readonly AnimationFrame[],
  from: number,
  targets: readonly number[],
): AnimationFrame[] {
  const source = frames[from];
  if (!source) return [...frames];
  return frames.map((frame, i) =>
    i !== from && targets.includes(i)
      ? withBoxes(frame, source.hurtbox, source.hitboxes ?? [])
      : frame,
  );
}
