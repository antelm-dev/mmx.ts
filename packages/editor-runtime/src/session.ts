import { documentToLevelData } from "./adapters/adapters.js";
import type { LevelDocument } from "@mmx/content-schema";
import type { Scene } from "@mmx/engine";
import {
  createToolingRuntime,
  type ToolingRuntime,
} from "@mmx/runtime/tooling";
import type { RuntimePresentation } from "@mmx/runtime";
import type { AssetCatalog, StudioPlaytestRenderer } from "@mmx/renderer-pixi";
import { mapSimulationSnapshot } from "./mapSnapshot.js";
import { PlaytestInput } from "./PlaytestInput.js";
import { STOPPED_PLAYTEST, type PlaytestSnapshot } from "./snapshots.js";
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
  private runtime: ToolingRuntime | null = null;
  private renderer: StudioPlaytestRenderer | null = null;
  private browser = false;
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

    const audio = this.options.audio;
    const visual = this.options.host ? await import("@mmx/renderer-pixi") : null;
    const assets: AssetCatalog | null = visual ? visual.createAssetCatalog() : null;

    const runtime = createToolingRuntime({
      scene: {
        seed: this.options.seed,
        level: documentToLevelData(this.document),
      },
      audio,
      onError: (error) => this.fail(error),
      replayFiles: this.options.replayFiles,
      clipboard: this.options.clipboard,
      getBindings: this.options.getBindings,
      isPauseOnBlur: this.options.isPauseOnBlur,
    });
    this.runtime = runtime;

    try {
      if (this.options.host && visual && assets) {
        this.renderer = await visual.createPlaytestRenderer(
          this.options.host,
          runtime.session.scene,
          {
            assets,
            decorations: this.document.decorations,
          },
        );
        if (this.disposed || this.stopped) {
          this.renderer.destroy();
          this.renderer = null;
          return;
        }
        runtime.setPresentation(this.createPresentation(this.renderer));
        await runtime.startBrowser();
        this.browser = true;
      }
      this.emitNow();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop(): void {
    if (this.disposed || this.stopped) return;
    this.stopped = true;
    this.browser = false;
    this.runtime?.dispose();
    this.runtime = null;
    this.renderer = null;
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
  }

  step(input?: PlaytestInput): void {
    this.assertLive();
    const runtime = this.requireRuntime();
    if (this.browser && !runtime.isPaused) return;

    runtime.step(input ? input.toMask() : undefined);
    this.emitNow();
  }

  snapshot(): PlaytestSnapshot {
    if (this.disposed || this.stopped || !this.runtime) return STOPPED_PLAYTEST;
    const inspect = this.runtime.inspect();
    const debug = this.runtime.debugSnapshot();
    return {
      status: this.runtime.isPaused ? "paused" : "running",
      frame: inspect.frame,
      checkpointFrame: inspect.checkpointFrame,
      runtime: mapSimulationSnapshot(inspect.simulation),
      selectedRuntimeId: this.selectedRuntimeId,
      sceneRevision: inspect.sceneRevision,
      frameStats: this.browser
        ? this.runtime.frameStats.toSnapshot()
        : STOPPED_PLAYTEST.frameStats,
      debug: {
        timeScale: debug.timeScale,
        invulnerable: debug.invulnerable,
        tainted: debug.tainted,
        recordedLength: debug.recordedLength,
        lastMask: debug.lastMask,
        notice: debug.notice,
      },
    };
  }

  togglePause(): void {
    this.assertLive();
    this.requireRuntime().togglePause();
    this.emitNow();
  }

  get isPaused(): boolean {
    return this.runtime?.isPaused ?? false;
  }

  setCheckpoint(): void {
    this.assertLive();
    this.requireRuntime().setCheckpoint();
    this.emitNow();
  }

  restartCheckpoint(): void {
    this.assertLive();
    this.requireRuntime().restartCheckpoint();
    this.emitNow();
  }

  restartLevel(): void {
    this.assertLive();
    this.requireRuntime().restartLevel();
    this.emitNow();
  }

  seek(frame: number): void {
    this.assertLive();
    this.requireRuntime().seek(frame);
    this.emitNow();
  }

  setTimeScale(scale: number): void {
    this.assertLive();
    this.requireRuntime().setTimeScale(scale);
    this.emitNow();
  }

  nudgeTimeScale(delta: number): void {
    this.assertLive();
    this.requireRuntime().nudgeTimeScale(delta);
    this.emitNow();
  }

  setInvulnerable(enabled: boolean): void {
    this.assertLive();
    this.requireRuntime().setInvulnerable(enabled);
    this.emitNow();
  }

  saveReplay(): void {
    this.assertLive();
    this.requireRuntime().saveReplay();
    this.emitNow();
  }

  loadReplay(): void {
    this.assertLive();
    this.requireRuntime().promptLoadReplay();
    this.emitNow();
  }

  loadReplayText(text: string, source?: string): void {
    this.assertLive();
    this.requireRuntime().loadReplayText(text, source);
    this.emitNow();
  }

  async copyDiagnostics(): Promise<void> {
    this.assertLive();
    await this.requireRuntime().copyDiagnostics();
    this.emitNow();
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

  private createPresentation(renderer: StudioPlaytestRenderer): RuntimePresentation {
    return {
      bindScene: (scene: Scene) => renderer.bindScene(scene),
      attachEnemy: (enemy) => renderer.attachEnemy(enemy),
      attachPickup: (pickup) => renderer.attachPickup(pickup),
      attachWeaponCapsule: (capsule) => renderer.attachWeaponCapsule(capsule),
      sampleCosmetics: (scene) => renderer.sampleCosmetics(scene),
      render: (scene) => {
        renderer.render(scene);
        this.emitThrottled();
      },
      destroy: () => {
        renderer.destroy();
        this.renderer = null;
      },
    };
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.options.onError?.(message);
  }

  private selectedSourceEntityId(): string | undefined {
    const id = this.selectedRuntimeId;
    const snap = this.snapshot().runtime;
    if (!id || !snap) return undefined;
    if (snap.player.runtimeId === id) return snap.player.sourceEntityId;
    return snap.actors.find((a) => a.runtimeId === id)?.sourceEntityId;
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

  private requireRuntime(): ToolingRuntime {
    if (!this.runtime) throw new Error("Playtest session is not started");
    return this.runtime;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error(DISPOSED_ERROR);
  }
}
