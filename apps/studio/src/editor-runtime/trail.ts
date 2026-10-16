import { Scene, type Replay, type SceneOptions } from "@mmx/engine";

/** What a stopped Play recorded: its input timeline and the exact scene options it ran on. */
export interface RecordedRun {
  replay: Replay;
  scene: SceneOptions;
}

/** The player's path through a run, in world pixels (player centre). */
export interface PlayTrail {
  /** Polylines as flat `[x0, y0, x1, y1, …]`; a new one starts after a death or a jump. */
  segments: number[][];
  /** Where the run ended (where the player died, if they did); null when it never left the intro. */
  end: { x: number; y: number } | null;
}

export interface TraceOptions {
  /** Work this long before yielding to the event loop, so Stop never freezes the UI. */
  sliceMs?: number;
  /** Checked after each yield: true abandons the trace (another Play started). */
  isStale?: () => boolean;
}

const SAMPLE_EVERY = 2;
/** Farther than this between two samples is a teleport, not movement: the line breaks. */
const JUMP_PX = 48;

/**
 * Re-simulate `run` from its first frame and sample the player along the way. Same scene
 * options (level, game data, loadout, clips) and the replay's seed, so it lands where Play
 * did, exactly as the debugger's own rewinds do. Resolves null when `isStale` says so.
 *
 * Sliced because it is not free: a one-minute run of the demo project, with clips, measured
 * about 60ms warm and 200ms cold in one go; sliced, no block exceeds about 15ms.
 */
export async function traceRun(
  run: RecordedRun,
  { sliceMs = 8, isStale = () => false }: TraceOptions = {},
): Promise<PlayTrail | null> {
  const scene = Scene.create({ ...run.scene, seed: run.replay.seed });
  const { frames } = run.replay;
  const segments: number[][] = [];
  let line: number[] | null = null;
  let end: PlayTrail["end"] = null;
  let dead = false;
  let sliceStart = performance.now();
  for (let i = 0; i < frames.length; i++) {
    scene.step(frames[i]!);
    if (i % SAMPLE_EVERY === SAMPLE_EVERY - 1 || i === frames.length - 1) {
      const player = scene.player;
      const { x, y } = player.pos;
      const alive = player.has_health();
      if (!alive || player.is_executing("Intro")) {
        // The body keeps falling once the Death state ends: the trail ends where it began.
        if (!alive && !dead) end = { x, y };
        dead = !alive;
        line = null;
      } else {
        dead = false;
        const n = line?.length ?? 0;
        if (!line || Math.hypot(x - line[n - 2]!, y - line[n - 1]!) > JUMP_PX)
          segments.push((line = []));
        line.push(x, y);
        end = { x, y };
      }
    }
    if (i % 64 === 63 && performance.now() - sliceStart > sliceMs) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (isStale()) return null;
      sliceStart = performance.now();
    }
  }
  return { segments, end };
}
