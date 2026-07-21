import type { Input, Action } from "./Input.js";

/**
 * Deterministic input recordings.
 *
 * The engine is already a pure function of (seed, per-tick input): nothing in
 * src/game reads a wall clock or `Math.random`, every roll goes through a
 * seeded {@link Rng}, and the fixed step means a tick advances by exactly DT no
 * matter what the display is doing. That is the whole precondition for this file
 * — a recording does not have to store positions, velocities or state names,
 * because replaying the same seed and the same button presses reconstructs them.
 *
 * So a bug that only shows up once in fifty attempts stops being a story and
 * becomes a file: record while playing, save when it happens, and the same
 * failure runs headlessly in a test forever after (see apps/sim/src/replay.ts and
 * tests/replay.test.ts).
 *
 * The one thing that can invalidate this is a debug cheat — invulnerability
 * perturbs the simulation — so recordings carry a `tainted` flag rather than
 * silently becoming un-replayable.
 */

/**
 * Bit order of the input mask. Fixed and append-only: the index of an action in
 * this array is baked into every recording ever saved, so reordering it would
 * silently reinterpret old files. New actions go on the end.
 */
export const REPLAY_ACTIONS: readonly Action[] = [
  "move_left",
  "move_right",
  "move_up",
  "move_down",
  "jump",
  "dash",
  "fire",
  "weapon_left",
  "weapon_right",
];

export const REPLAY_VERSION = 1;

export interface Replay {
  version: number;
  /** Scene seed the run was created with; see {@link Scene}. */
  seed: number;
  /** Level identifier, so a recording is never replayed against other geometry. */
  level: string;
  /** True if a debug cheat ran during capture, which makes replay non-faithful. */
  tainted: boolean;
  /** One input mask per fixed step, from the first tick of the run. */
  frames: number[];
}

/** Pack the live input state into one bit per action. */
export function packInput(input: Input): number {
  let mask = 0;
  for (let i = 0; i < REPLAY_ACTIONS.length; i++) {
    if (input.isPressed(REPLAY_ACTIONS[i])) mask |= 1 << i;
  }
  return mask;
}

/** Drive an {@link Input} from a recorded mask, including the released actions. */
export function applyInput(input: Input, mask: number): void {
  for (let i = 0; i < REPLAY_ACTIONS.length; i++) {
    input.setDown(REPLAY_ACTIONS[i], (mask & (1 << i)) !== 0);
  }
}

/** Human-readable action list for one mask — for diagnostics dumps. */
export function describeInput(mask: number): string {
  const held = REPLAY_ACTIONS.filter((_, i) => mask & (1 << i));
  return held.length ? held.join("+") : "-";
}

/**
 * Run-length encoded frame list.
 *
 * Held buttons are the common case by a wide margin — a walk across the level is
 * one mask repeated for hundreds of ticks — so the raw array is almost entirely
 * runs. Encoding them keeps a minute of play in a few hundred bytes and, more
 * usefully, keeps a saved recording legible: `[240, 2]` reads as "held right for
 * four seconds" in a way 240 copies of `2` does not.
 */
type Run = [count: number, mask: number];

function encodeRuns(frames: readonly number[]): Run[] {
  const runs: Run[] = [];
  for (const mask of frames) {
    const last = runs[runs.length - 1];
    if (last && last[1] === mask) last[0]++;
    else runs.push([1, mask]);
  }
  return runs;
}

function decodeRuns(runs: readonly Run[]): number[] {
  const frames: number[] = [];
  for (const [count, mask] of runs) {
    for (let i = 0; i < count; i++) frames.push(mask);
  }
  return frames;
}

/** Serialize to the on-disk JSON form. */
export function encodeReplay(replay: Replay): string {
  return JSON.stringify(
    {
      version: replay.version,
      seed: replay.seed,
      level: replay.level,
      tainted: replay.tainted,
      frameCount: replay.frames.length,
      runs: encodeRuns(replay.frames),
    },
    null,
    2,
  );
}

/**
 * Parse the on-disk form, rejecting anything this build cannot faithfully run.
 *
 * Deliberately strict. A replay that loads but diverges is worse than one that
 * refuses to load: the entire value of the format is that a reproduction stays
 * reproducible, so a version bump or a truncated file has to be an error rather
 * than a slightly different playthrough.
 */
export function decodeReplay(text: string): Replay {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (raw.version !== REPLAY_VERSION) {
    throw new Error(
      `replay: unsupported version ${String(raw.version)} (expected ${REPLAY_VERSION})`,
    );
  }
  if (typeof raw.seed !== "number" || typeof raw.level !== "string") {
    throw new Error("replay: missing seed or level");
  }
  if (!Array.isArray(raw.runs)) throw new Error("replay: missing runs");

  const frames = decodeRuns(raw.runs as Run[]);
  if (typeof raw.frameCount === "number" && raw.frameCount !== frames.length) {
    throw new Error(
      `replay: frameCount ${raw.frameCount} disagrees with ${frames.length} decoded frames`,
    );
  }
  return {
    version: REPLAY_VERSION,
    seed: raw.seed,
    level: raw.level,
    tainted: raw.tainted === true,
    frames,
  };
}
