import { GameplaySounds, SoundEffects } from "@mmx/browser-audio";
import {
  createPlaytest,
  STOPPED_PLAYTEST,
  type EditorPlaytestSession,
  type PlaytestSnapshot,
} from "@mmx/editor-runtime";
import {
  emptySelection,
  type EditorSelection,
  type EditorStore,
} from "../core/EditorStore.js";
import { type FileAccess } from "../core/persistence.js";
import { ensureStudioClientSettings } from "../settings/studioClientSettings.js";
import type { StudioAssets } from "../assets/studioAssets.js";
import type { ValidationResult } from "@mmx/content-schema";
import type { CompiledGameData } from "@mmx/engine/data";

export interface PlaytestCallbacks {
  getHost: () => HTMLElement | null;
  getFileAccess: () => FileAccess;
  /** The open project's assets (starter fallback), or null when its bindings are invalid. */
  getAssets: () => Promise<StudioAssets | null>;
  /** The open project's `player.loadout`, or undefined for the engine default. */
  getLoadoutId: () => string | undefined;
  /** The open project's compiled game data, or null when its data/game.json has errors. */
  getGameData: () => CompiledGameData | null;
  validate: () => ValidationResult;
  toast: (message: string) => void;
  /** Called when play exits and the source entity should receive focus. */
  focusObject: (id: string) => void;
  onModeChange: (mode: "play" | "edit") => void;
  setViewportVisible: (visible: boolean) => void;
  restoreViewAndSelection: (
    zoom: number,
    viewportPosition: { x: number; y: number },
    selection: EditorSelection,
  ) => void;
  togglePlaytestInspector: () => void;
}

/**
 * Owns Play start/stop, async cancellation token, audio, debugger snapshot
 * and debugger commands. Receives explicit dependencies via {@link PlaytestCallbacks}
 * so it never imports the global `editor` singleton.
 */
export class EditorPlaytestController {
  private play: EditorPlaytestSession | null = null;
  private audio: GameplaySounds | null = null;
  private audioAssets: StudioAssets | null = null;
  /** Bumped on every startPlay so an async renderer creation can detect it was superseded. */
  private playToken = 0;

  private savedView: { zoom: number; viewportPosition: { x: number; y: number } } | null = null;
  private savedSelection: EditorSelection = emptySelection();

  private playtestSnapshot: PlaytestSnapshot = STOPPED_PLAYTEST;
  private readonly playtestListeners = new Set<() => void>();

  constructor(
    private readonly store: EditorStore,
    private readonly cb: PlaytestCallbacks,
  ) {}

  // ---------- React binding ----------

  subscribe = (fn: () => void): (() => void) => {
    this.playtestListeners.add(fn);
    return () => this.playtestListeners.delete(fn);
  };

  getSnapshot = (): PlaytestSnapshot => this.playtestSnapshot;

  private setSnapshot(snapshot: PlaytestSnapshot): void {
    this.playtestSnapshot = snapshot;
    for (const fn of this.playtestListeners) fn();
  }

  // ---------- Lifecycle ----------

  togglePlay(): void {
    if (this.store.get().mode === "play") this.stopPlay();
    else void this.startPlay();
  }

  private async startPlay(): Promise<void> {
    const host = this.cb.getHost();
    if (!host) return;
    const gameData = this.cb.getGameData();
    if (!gameData) {
      this.cb.toast("Fix the errors in data/game.json (see Problems) before playing.");
      return;
    }
    const assets = await this.cb.getAssets();
    if (!assets) {
      this.cb.toast("Fix the project's asset bindings (see Problems) before playing.");
      return;
    }
    const audio = this.getAudio(assets);
    audio.unlock();

    const settings = await ensureStudioClientSettings().catch((error: unknown) => {
      this.cb.toast(
        `settings load failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
    if (!settings) return;
    audio.setMasterVolume(settings.snapshot().audio.masterVolume);

    const result = this.cb.validate();
    if (!result.ok) {
      this.cb.toast(
        `Fix ${result.errorCount} error${result.errorCount === 1 ? "" : "s"} before playing.`,
      );
      return;
    }

    const state = this.store.get();
    this.savedView = { zoom: state.zoom, viewportPosition: { ...state.viewportPosition } };
    this.savedSelection =
      state.selection.kind === "objects"
        ? { kind: "objects", ids: [...state.selection.ids] }
        : state.selection.kind === "decorations"
          ? { kind: "decorations", ids: [...state.selection.ids] }
          : { kind: "tiles", indices: [...state.selection.indices] };

    const token = ++this.playToken;
    this.cb.onModeChange("play");
    this.cb.setViewportVisible(false);

    try {
      await audio.load();
      const files = this.cb.getFileAccess();
      const loadoutId = this.cb.getLoadoutId();
      const session = createPlaytest(state.document, {
        host,
        loadoutId,
        gameData,
        tilesets: state.tilesets,
        audio,
        getBindings: () => settings.snapshot().input.bindings,
        isPauseOnBlur: () => settings.snapshot().gameplay.pauseOnBlur,
        replayFiles: {
          save: async (contents, suggestedName) => {
            const ok = await files.save(suggestedName, contents);
            return ok ? suggestedName : null;
          },
          open: async () => {
            const file = await files.open();
            return file ? { path: file.name, contents: file.json } : null;
          },
        },
        clipboard: {
          writeText: (text) => navigator.clipboard.writeText(text),
        },
        rendererAssets: assets.catalog,
        rendererManifest: assets.manifest,
        onSnapshot: (snapshot) => {
          if (token !== this.playToken) return;
          this.setSnapshot(snapshot);
        },
        onError: (message) => {
          if (token !== this.playToken) return;
          this.cb.toast(`Play error: ${message}`);
          this.stopPlay();
        },
        onExitToObject: (sourceEntityId) => {
          if (token !== this.playToken) return;
          this.stopPlay();
          this.cb.focusObject(sourceEntityId);
        },
      });
      await session.start();
      if (token !== this.playToken || this.store.get().mode !== "play") {
        session.dispose();
        return;
      }
      this.play = session;
      // Lets e2e tests tell which player sheet and loadout Play is running.
      host.dataset.playerSheet = assets.manifest.playerSheet;
      host.dataset.playerLoadout = loadoutId ?? "player.x";
      host.dataset.playerMoveset = session.playerMoveset.join(" ");
      host.dataset.enemyKinds = session.enemyKinds.join(" ");
    } catch (error) {
      this.cb.toast(
        `Could not start Play: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.stopPlay();
    }
  }

  stopPlay(): void {
    this.playToken++;
    this.play?.dispose();
    this.play = null;
    this.audio?.stopMusic();
    this.setSnapshot(STOPPED_PLAYTEST);
    this.cb.onModeChange("edit");
    this.cb.setViewportVisible(true);
    if (this.savedView) {
      this.cb.restoreViewAndSelection(
        this.savedView.zoom,
        this.savedView.viewportPosition,
        this.savedSelection,
      );
    }
  }

  private getAudio(assets: StudioAssets): GameplaySounds {
    if (this.audio && this.audioAssets === assets) return this.audio;
    this.audioAssets = assets;
    this.audio = new GameplaySounds(
      new SoundEffects({
        resolver: {
          resolveUrl(soundId) {
            const asset = assets.project.assets.find((entry) => entry.id === soundId);
            if (!asset) throw new Error(`Unknown sound '${soundId}'.`);
            return assets.resolveUrl(asset);
          },
        },
        soundIds: assets.soundIds,
        bindings: assets.soundBindings,
      }),
    );
    return this.audio;
  }

  // ---------- Debugger commands ----------

  togglePause(): void {
    this.play?.togglePause();
  }
  step(): void {
    this.play?.step();
  }
  setCheckpoint(): void {
    this.play?.setCheckpoint();
  }
  restartCheckpoint(): void {
    this.play?.restartCheckpoint();
  }
  restartLevel(): void {
    this.play?.restartLevel();
  }
  seek(frame: number): void {
    this.play?.seek(frame);
  }
  nudgeTimeScale(delta: number): void {
    this.play?.nudgeTimeScale(delta);
  }
  setInvulnerable(enabled: boolean): void {
    this.play?.setInvulnerable(enabled);
  }
  saveReplay(): void {
    this.play?.saveReplay();
  }
  loadReplay(): void {
    this.play?.loadReplay();
  }
  copyDiagnostics(): void {
    void this.play?.copyDiagnostics();
  }
  select(runtimeId: string | null): void {
    this.play?.select(runtimeId);
  }
  focusSelectedSource(): void {
    this.play?.focusSelectedSource();
  }
}
