import type { Replay } from "../core/Replay.js";
import type { LevelData } from "../game/LevelData.js";
import { Recorder } from "../game/Recorder.js";
import type { Scene, SceneOptions } from "../game/Scene.js";
import { snapshotScene, type SimulationSnapshot } from "./snapshot.js";

/**
 * A DOM-free façade for driving and inspecting a run under a debugger.
 *
 * It owns no timer and reads no input device: a host advances it one fixed step
 * at a time with {@link step}, so *when* frames happen is entirely the caller's
 * concern (a paused debugger simply stops calling step). Everything to do with
 * the simulation itself — the {@link Scene}, deterministic stepping, checkpoints
 * and rewind — is delegated to a {@link Recorder}, so this class is a thin,
 * inspectable seam rather than a second copy of the rewind machinery.
 *
 * Rewinds ({@link restartCheckpoint}, {@link restartLevel}, {@link seek})
 * replace the underlying {@link Scene} instance. A renderer bound to the old
 * Stage/Camera must rebind, so {@link sceneRevision} bumps whenever that
 * happens and callers can watch it to know when to re-attach.
 */
export class ToolingSession {
  private readonly recorder: Recorder;
  private revision = 0;

  constructor(options: SceneOptions) {
    this.recorder = new Recorder(options);
  }

  /** The live scene. Replaced by rewinds — never cache it across a {@link sceneRevision} change. */
  get scene(): Scene {
    return this.recorder.scene;
  }

  /** Fixed steps executed since the current scene was built. */
  get frame(): number {
    return this.recorder.frame;
  }

  /** Frame a {@link restartCheckpoint} rewinds to. Zero is the spawn — the default checkpoint. */
  get checkpointFrame(): number {
    return this.recorder.checkpoint;
  }

  /** Monotonic counter that increments every time the {@link scene} instance is replaced. */
  get sceneRevision(): number {
    return this.revision;
  }

  get recordedLength(): number {
    return this.recorder.length;
  }

  get lastMask(): number {
    return this.recorder.lastMask;
  }

  get isTainted(): boolean {
    return this.recorder.isTainted;
  }

  /** Advance exactly one deterministic fixed step under `mask`, returning the new state. */
  step(mask: number): SimulationSnapshot {
    this.recorder.step(mask);
    return this.inspect();
  }

  /** Read current state without mutating anything. */
  inspect(): SimulationSnapshot {
    return snapshotScene(this.recorder.scene);
  }

  /** Set the rewind target to the current frame. */
  setCheckpoint(): void {
    this.recorder.placeCheckpoint();
  }

  /** Rebuild and fast-forward to the current checkpoint through the recorder. */
  restartCheckpoint(): SimulationSnapshot {
    return this.replaceWith(() => this.recorder.restart());
  }

  /** Discard the recording and rebuild the level from the top. */
  restartLevel(): SimulationSnapshot {
    return this.replaceWith(() => this.recorder.restartLevel());
  }

  /** Rebuild and fast-forward to `frame`, clamped to the recorded range. */
  seek(frame: number): SimulationSnapshot {
    return this.replaceWith(() => this.recorder.rewindTo(frame));
  }

  loadLevel(level: LevelData): SimulationSnapshot {
    return this.replaceWith(() => this.recorder.loadLevel(level));
  }

  markTainted(): void {
    this.recorder.markTainted();
  }

  toReplay(): Replay {
    return this.recorder.toReplay();
  }

  loadReplay(replay: Replay): SimulationSnapshot {
    return this.replaceWith(() => this.recorder.load(replay));
  }

  private replaceWith(rebuild: () => Scene): SimulationSnapshot {
    const before = this.recorder.scene;
    const after = rebuild();
    if (after !== before) this.revision++;
    return this.inspect();
  }
}
