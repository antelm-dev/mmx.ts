import { documentToLevelData } from "@mmx/content-engine-adapter";
import type { LevelDocument } from "@mmx/content-schema";
import type { SceneOptions } from "@mmx/engine/game/Scene.js";
import { ToolingSession } from "@mmx/engine/tooling";
import type { AssetCatalog, StudioPlaytestRenderer } from "@mmx/renderer-pixi";
import { mapSimulationSnapshot } from "./mapSnapshot.js";
import type { PlaytestClock } from "./PlaytestClock.js";
import { PlaytestInput } from "./PlaytestInput.js";
import { STOPPED_PLAYTEST, type PlaytestSnapshot, type SimulationSnapshot } from "./snapshots.js";
import type { CreatePlaytestOptions, EditorPlaytestSession } from "./types.js";

const REACT_UPDATE_INTERVAL_MS = 70;

const DISPOSED_ERROR = "Playtest session has been disposed";

export function createPlaytest(
  document: LevelDocument,
  options: CreatePlaytestOptions = {},
): EditorPlaytestSession {
  return new PlaytestSession(document, options);
}

class PlaytestSession implements EditorPlaytestSession {
  private tooling: ToolingSession | null = null;
  private renderer: StudioPlaytestRenderer | null = null;
  private clock: PlaytestClock | null = null;
  private readonly input = new PlaytestInput();
  private runtime: SimulationSnapshot | null = null;
  private selectedRuntimeId: string | null = "player";
  private lastEmit = 0;
  private started = false;
  private stopped = false;
  private disposed = false;

  constructor(
    private readonly document: LevelDocument,
    private readonly options: CreatePlaytestOptions,
  ) {}

  async start(): Promise<void> {
    this.assertLive();
    if (this.started && !this.stopped) return;

    this.stopped = false;
    this.started = true;

    const sounds = this.options.sounds;
    // Dynamic import keeps Pixi out of headless playtest sessions.
    const visual = this.options.host ? await import("@mmx/renderer-pixi") : null;
    const assets: AssetCatalog | null = visual ? visual.createAssetCatalog() : null;

    const sceneOptions: SceneOptions = {
      seed: this.options.seed,
      level: documentToLevelData(this.document),
      onEnemySpawned: (enemy) => {
        assets?.attachEnemyAnimations(enemy);
        sounds?.attachEnemy(enemy);
      },
      onPickupSpawned: (pickup) => {
        assets?.attachLifeCapsuleAnimations(pickup);
      },
      onWeaponCapsuleSpawned: (capsule) => {
        assets?.attachWeaponCapsuleAnimations(capsule);
      },
    };

    const tooling = new ToolingSession(sceneOptions);
    this.tooling = tooling;
    sounds?.attachScene(tooling.scene);

    try {
      if (this.options.host && visual && assets) {
        const { PlaytestClock } = await import("./PlaytestClock.js");
        this.renderer = await visual.createPlaytestRenderer(this.options.host, tooling.scene, {
          assets,
        });
        if (this.disposed || this.stopped) {
          this.renderer.destroy();
          this.renderer = null;
          return;
        }
        this.input.attach();
        this.clock = new PlaytestClock({
          onStep: () => this.tick(),
          onRender: () => this.draw(),
          onError: (error) => this.fail(error),
        });
        this.clock.start();
      }
      this.runtime = mapSimulationSnapshot(tooling.inspect());
      this.emitNow();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop(): void {
    if (this.disposed || this.stopped) return;
    this.stopped = true;
    this.clock?.stop();
    this.clock = null;
    this.input.detach();
    this.options.sounds?.effects.stopAll();
    this.renderer?.destroy();
    this.renderer = null;
    this.tooling = null;
    this.runtime = null;
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
  }

  step(input: PlaytestInput = this.input): void {
    this.assertLive();
    const tooling = this.requireTooling();
    if (this.clock && !this.clock.isPaused) return;

    this.runtime = mapSimulationSnapshot(tooling.step(input.toMask()));
    if (this.renderer) {
      this.renderer.sampleCosmetics(tooling.scene);
      this.renderer.render(tooling.scene);
    }
    this.emitNow();
  }

  snapshot(): PlaytestSnapshot {
    if (this.disposed || this.stopped || !this.tooling) return STOPPED_PLAYTEST;
    return {
      status: this.clock?.isPaused ? "paused" : "running",
      frame: this.tooling.frame,
      checkpointFrame: this.tooling.checkpointFrame,
      runtime: this.runtime,
      selectedRuntimeId: this.selectedRuntimeId,
      sceneRevision: this.tooling.sceneRevision,
    };
  }

  togglePause(): void {
    this.assertLive();
    const clock = this.clock;
    if (!clock) return;
    if (clock.isPaused) clock.resume();
    else {
      clock.pause();
      this.input.clear();
    }
    this.emitNow();
  }

  get isPaused(): boolean {
    return this.clock?.isPaused ?? false;
  }

  setCheckpoint(): void {
    this.assertLive();
    this.requireTooling().setCheckpoint();
    this.emitNow();
  }

  restartCheckpoint(): void {
    this.assertLive();
    this.rewind(() => this.requireTooling().restartCheckpoint());
  }

  restartLevel(): void {
    this.assertLive();
    this.rewind(() => this.requireTooling().restartLevel());
  }

  select(runtimeId: string | null): void {
    this.assertLive();
    this.selectedRuntimeId = runtimeId;
    this.emitNow();
  }

  focusSelectedSource(): void {
    this.assertLive();
    const source = this.selectedSourceEntityId();
    if (source) this.options.onExitToObject?.(source);
  }

  private tick(): void {
    const tooling = this.requireTooling();
    this.runtime = mapSimulationSnapshot(tooling.step(this.input.toMask()));
    this.renderer?.sampleCosmetics(tooling.scene);
  }

  private draw(): void {
    const tooling = this.tooling;
    if (!tooling || !this.renderer) return;
    this.renderer.render(tooling.scene);
    if (!this.clock?.isPaused) this.emitThrottled();
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.options.onError?.(message);
  }

  private rewind(run: () => ReturnType<ToolingSession["inspect"]>): void {
    const tooling = this.requireTooling();
    this.runtime = mapSimulationSnapshot(run());
    if (this.renderer) {
      this.renderer.bindScene(tooling.scene);
      this.renderer.render(tooling.scene);
    }
    this.options.sounds?.attachScene(tooling.scene);
    this.emitNow();
  }

  private selectedSourceEntityId(): string | undefined {
    const id = this.selectedRuntimeId;
    if (!id || !this.runtime) return undefined;
    if (this.runtime.player.runtimeId === id) return this.runtime.player.sourceEntityId;
    return this.runtime.actors.find((a) => a.runtimeId === id)?.sourceEntityId;
  }

  private emitNow(): void {
    this.lastEmit = performance.now();
    this.options.onSnapshot?.(this.snapshot());
  }

  private emitThrottled(): void {
    const now = performance.now();
    if (now - this.lastEmit < REACT_UPDATE_INTERVAL_MS) return;
    this.lastEmit = now;
    this.options.onSnapshot?.(this.snapshot());
  }

  private requireTooling(): ToolingSession {
    if (!this.tooling) throw new Error("Playtest session is not started");
    return this.tooling;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error(DISPOSED_ERROR);
  }
}
