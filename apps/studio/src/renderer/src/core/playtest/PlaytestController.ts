import { ToolingSession, type SimulationSnapshot } from "@mmx/engine/tooling";
import type { GameplaySounds } from "@mmx/browser-audio";
import type { SceneOptions } from "@mmx/engine/game/Scene.js";
import type { AnimData } from "@mmx/engine/game/Animation.js";
import { documentToLevelData, type LevelDocument } from "@mmx/content-schema";
import { enemyAnims, pickupAnims } from "@mmx/renderer-pixi";
import { PlaytestClock } from "./PlaytestClock.js";
import { PlaytestInput } from "./PlaytestInput.js";
import { PlaytestRenderer } from "./PlaytestRenderer.js";

export type PlaytestStatus = "stopped" | "running" | "paused";

/**
 * The controller-facing view of a playtest. Plain, immutable data the editor
 * hands to React — deliberately separate from {@link import("../EditorStore.js").EditorState},
 * which stays about the authored document. `runtime` is the deep engine
 * inspection; the rest is the debugger's own control state.
 */
export interface PlaytestSnapshot {
  status: PlaytestStatus;
  frame: number;
  checkpointFrame: number;
  runtime: SimulationSnapshot | null;
  selectedRuntimeId: string | null;
  sceneRevision: number;
}

/** The stopped snapshot, shared as a stable reference for React while no run exists. */
export const STOPPED_PLAYTEST: PlaytestSnapshot = {
  status: "stopped",
  frame: 0,
  checkpointFrame: 0,
  runtime: null,
  selectedRuntimeId: null,
  sceneRevision: 0,
};

export interface PlaytestCallbacks {
  /** Fresh snapshot for React. Called throttled while running, immediately on discrete events. */
  onSnapshot: (snapshot: PlaytestSnapshot) => void;
  /** A simulation or render error tore the run down; the host should stop and surface it. */
  onError: (message: string) => void;
  /** The user asked to jump to a runtime actor's authored object — stop Play and focus it. */
  onExitToObject: (sourceEntityId: string) => void;
}

/** ~14 Hz: the cap the brief sets for React updates while the run is live. */
const REACT_UPDATE_INTERVAL_MS = 70;

/**
 * Owns the browser side of a playtest and drives the engine's
 * {@link ToolingSession}. The controller is the seam the brief draws: simulation
 * (scene, stepping, checkpoints, rewind, inspection) is the tooling session's;
 * orchestration (clock, input, renderer, React cadence, debugger commands) is
 * this class's.
 */
export class PlaytestController {
  private runtime: SimulationSnapshot | null = null;
  private selectedRuntimeId: string | null = "player";
  private lastEmit = 0;
  private stopped = false;

  private constructor(
    private readonly session: ToolingSession,
    private readonly renderer: PlaytestRenderer,
    private readonly input: PlaytestInput,
    private readonly clock: PlaytestClock,
    private readonly sounds: GameplaySounds,
    private readonly callbacks: PlaytestCallbacks,
  ) {}

  static async start(
    host: HTMLElement,
    doc: LevelDocument,
    sounds: GameplaySounds,
    callbacks: PlaytestCallbacks,
  ): Promise<PlaytestController> {
    const options: SceneOptions = {
      level: documentToLevelData(doc),
      onEnemySpawned: (enemy) => {
        enemy.loadAnimations(enemyAnims.actors[enemy.stats.sheet] as unknown as AnimData);
        sounds.attachEnemy(enemy);
      },
      onPickupSpawned: (pickup) => {
        pickup.loadAnimations(pickupAnims.actors[pickup.kind] as unknown as AnimData);
      },
      onWeaponCapsuleSpawned: (capsule) => {
        capsule.loadAnimations(pickupAnims.actors[capsule.sheet] as unknown as AnimData);
      },
    };

    const session = new ToolingSession(options);
    sounds.attachScene(session.scene);
    const renderer = await PlaytestRenderer.create(host, session.scene);
    const input = new PlaytestInput();

    let controller!: PlaytestController;
    const clock = new PlaytestClock({
      onStep: () => controller.tick(),
      onRender: () => controller.draw(),
      onError: (error) => controller.fail(error),
    });
    controller = new PlaytestController(session, renderer, input, clock, sounds, callbacks);

    input.attach();
    try {
      clock.start();
      controller.runtime = session.inspect();
      controller.emitNow();
      return controller;
    } catch (error) {
      controller.stop();
      throw error;
    }
  }

  // ---------- clock callbacks ----------

  private tick(): void {
    this.runtime = this.session.step(this.input.mask());
    this.renderer.sampleCosmetics(this.session.scene);
  }

  private draw(): void {
    this.renderer.render(this.session.scene);
    if (!this.clock.isPaused) this.emitThrottled();
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.callbacks.onError(message);
  }

  // ---------- debugger commands ----------

  togglePause(): void {
    if (this.clock.isPaused) this.clock.resume();
    else this.clock.pause();
    this.emitNow();
  }

  get isPaused(): boolean {
    return this.clock.isPaused;
  }

  /** Advance exactly one fixed step. Only meaningful while paused. */
  step(): void {
    if (!this.clock.isPaused) return;
    this.runtime = this.session.step(this.input.mask());
    this.renderer.sampleCosmetics(this.session.scene);
    this.renderer.render(this.session.scene);
    this.emitNow();
  }

  setCheckpoint(): void {
    this.session.setCheckpoint();
    this.emitNow();
  }

  restartCheckpoint(): void {
    this.rewind(() => this.session.restartCheckpoint());
  }

  restartLevel(): void {
    this.rewind(() => this.session.restartLevel());
  }

  select(runtimeId: string | null): void {
    this.selectedRuntimeId = runtimeId;
    this.emitNow();
  }

  /** Stop Play and focus the authored object behind the selected runtime actor, if any. */
  focusSelectedSource(): void {
    const source = this.selectedSourceEntityId();
    if (source) this.callbacks.onExitToObject(source);
  }

  private selectedSourceEntityId(): string | undefined {
    const id = this.selectedRuntimeId;
    if (!id || !this.runtime) return undefined;
    if (this.runtime.player.runtimeId === id) return this.runtime.player.sourceEntityId;
    return this.runtime.actors.find((a) => a.runtimeId === id)?.sourceEntityId;
  }

  private rewind(run: () => SimulationSnapshot): void {
    this.runtime = run();
    // The scene instance was replaced; rebind cosmetics/renderer to the new one
    // and draw the rewound frame before any further stepping.
    this.renderer.bindScene(this.session.scene);
    this.sounds.attachScene(this.session.scene);
    this.renderer.render(this.session.scene);
    this.emitNow();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clock.stop();
    this.input.detach();
    this.sounds.effects.stopAll();
    this.renderer.destroy();
  }

  // ---------- snapshot / React binding ----------

  getSnapshot(): PlaytestSnapshot {
    if (this.stopped) return STOPPED_PLAYTEST;
    return {
      status: this.clock.isPaused ? "paused" : "running",
      frame: this.session.frame,
      checkpointFrame: this.session.checkpointFrame,
      runtime: this.runtime,
      selectedRuntimeId: this.selectedRuntimeId,
      sceneRevision: this.session.sceneRevision,
    };
  }

  private emitNow(): void {
    this.lastEmit = performance.now();
    this.callbacks.onSnapshot(this.getSnapshot());
  }

  private emitThrottled(): void {
    const now = performance.now();
    if (now - this.lastEmit < REACT_UPDATE_INTERVAL_MS) return;
    this.lastEmit = now;
    this.callbacks.onSnapshot(this.getSnapshot());
  }
}
