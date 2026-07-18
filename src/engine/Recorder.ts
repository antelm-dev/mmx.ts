import { REPLAY_VERSION, type Replay } from "../core/Replay.js";
import { Scene, type SceneOptions } from "./Scene.js";

/**
 * Records every tick of a run, and replays one.
 *
 * The recorder owns the {@link Scene} rather than observing it, because the two
 * operations that make this useful — replaying a file, and restarting from a
 * checkpoint — both need to *replace* the scene, and something has to be holding
 * the reference that everyone else reads through.
 *
 * Restart-from-checkpoint is deliberately implemented as "rebuild and fast
 * forward" instead of snapshot/restore. Snapshotting would mean serializing the
 * player, twelve ability objects with their own timers, the enemies, their AI
 * state and every live projectile — a large amount of code whose bugs would look
 * exactly like the gameplay bugs it exists to help find. Replaying the recorded
 * prefix reaches a provably identical state using only machinery the run already
 * depends on.
 *
 * The cost is linear in how far back you go: measured warm, a rewind runs about
 * 26ms per minute of recorded play (1.4ms for a second, 48ms for two minutes).
 * So a rewind is a perceptible one-off hitch on a long run rather than a free
 * operation — fine for a key you press deliberately, and the reason checkpoints
 * exist rather than always restarting from the spawn.
 */
export class Recorder {
  scene: Scene;

  /** Input mask per elapsed tick. Index i is the mask that produced frame i+1. */
  private frames: number[] = [];
  /** Frame the next restart rewinds to. Zero is the spawn. */
  private checkpointFrame = 0;
  /** Set once a debug cheat perturbs the run; travels into the saved file. */
  private tainted = false;

  constructor(private readonly options: SceneOptions = {}) {
    this.scene = Scene.create(options);
  }

  get frame(): number {
    return this.scene.frame;
  }
  /** Input mask that drove the most recent tick — what the HUD shows as "input". */
  get lastMask(): number {
    return this.scene.frame > 0 ? (this.frames[this.scene.frame - 1] ?? 0) : 0;
  }
  get length(): number {
    return this.frames.length;
  }
  get checkpoint(): number {
    return this.checkpointFrame;
  }
  get isTainted(): boolean {
    return this.tainted;
  }

  /** Advance one tick and remember the input that drove it. */
  step(mask: number): void {
    // Truncate first: after a rewind the scene is behind the tail of the buffer,
    // and the frames past it belong to a future that no longer happened.
    if (this.frames.length > this.scene.frame) this.frames.length = this.scene.frame;
    this.frames.push(mask);
    this.scene.step(mask);
  }

  /** Note that the simulation was perturbed by something outside the input stream. */
  markTainted(): void {
    this.tainted = true;
  }

  /** Set the rewind target to the current frame. */
  placeCheckpoint(): void {
    this.checkpointFrame = this.scene.frame;
  }

  /**
   * Rebuild the run and fast-forward to `frame`, returning the new scene.
   *
   * The recorded prefix is kept — the point of rewinding during a hunt is to
   * take another run at the same setup, so the buffer stays and new input
   * overwrites the tail from here (see {@link step}).
   */
  rewindTo(frame: number): Scene {
    const target = Math.max(0, Math.min(frame, this.frames.length));
    this.scene = Scene.create(this.options);
    for (let i = 0; i < target; i++) this.scene.step(this.frames[i]);
    return this.scene;
  }

  /** Rewind to the current checkpoint. */
  restart(): Scene {
    return this.rewindTo(this.checkpointFrame);
  }

  /** Everything captured so far, as a saveable recording. */
  toReplay(): Replay {
    return {
      version: REPLAY_VERSION,
      seed: this.scene.seed,
      level: this.scene.levelId,
      tainted: this.tainted,
      frames: this.frames.slice(0, this.scene.frame),
    };
  }

  /**
   * Load a recording and run it to completion, leaving the scene at its final
   * frame with the whole thing in the buffer — so playback ends in the state the
   * capture ended in, and play simply continues from there.
   */
  load(replay: Replay): Scene {
    if (replay.level !== this.scene.levelId) {
      throw new Error(`replay was recorded on level '${replay.level}', this build has '${this.scene.levelId}'`);
    }
    this.scene = Scene.create({ ...this.options, seed: replay.seed });
    this.frames = replay.frames.slice();
    this.tainted = replay.tainted;
    this.checkpointFrame = 0;
    for (const mask of this.frames) this.scene.step(mask);
    return this.scene;
  }

  /**
   * Replay a recording without a live scene — the headless path used by the sim
   * runner and the regression tests.
   */
  static replay(replay: Replay, options: SceneOptions = {}): Scene {
    const scene = Scene.create({ ...options, seed: replay.seed });
    if (replay.level !== scene.levelId) {
      throw new Error(`replay was recorded on level '${replay.level}', this build has '${scene.levelId}'`);
    }
    for (const mask of replay.frames) scene.step(mask);
    return scene;
  }
}
