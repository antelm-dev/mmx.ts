import { GameplaySounds, SoundEffects } from "@mmx/browser-audio";
import {
  createPlaytest,
  STOPPED_PLAYTEST,
  traceRun,
  type EditorPlaytestSession,
  type PlaytestSnapshot,
} from "@mmx/editor-runtime";
import { documentToLevelData } from "@mmx/editor-runtime/adapters";
import { BODY_HALF_H, BODY_HALF_W, DEFAULT_PLAYER_LOADOUT, World } from "@mmx/engine";
import { instanceSize, type LevelDocument } from "@mmx/content-schema";
import { emptySelection, type EditorSelection, type EditorStore } from "../core/EditorStore.js";
import { type FileAccess } from "../core/persistence.js";
import { ensureStudioClientSettings } from "../settings/studioClientSettings.js";
import type { StudioAssets } from "../assets/studioAssets.js";
import type { ValidationResult } from "@mmx/content-schema";
import type { CompiledGameData } from "@mmx/engine/data";

/** Suffix of a "Play from here" level id: its replays are refused by a normal Play. */
export const PLAY_HERE_SUFFIX = "@here";

/**
 * A copy of `doc` with its Spawn at a world point, centred and snapped like a placed Spawn
 * (`snap`), under a suffixed id so a replay recorded there never loads into a normal Play.
 * The engine puts the player's centre on the Spawn's x/y, so `body` (half extents) is
 * checked there. Returns why not instead when the player would start in a wall or off the level.
 */
export function playHereDocument(
  doc: LevelDocument,
  worldX: number,
  worldY: number,
  body: { hw: number; hh: number },
  snap: (value: number) => number,
): LevelDocument | string {
  const spawn = doc.objects.find((o) => o.definitionId === "spawn");
  const { width, height } = spawn ? instanceSize(spawn) : { width: 0, height: 0 };
  const x = snap(worldX - width / 2);
  const y = snap(worldY - height / 2);
  // Off the top the player beams into nothing, off the bottom they die at once.
  if (y < 0 || y >= doc.rows * doc.gridSize)
    return "Play from here needs a point inside the level.";
  const { tiles, cols, rows, slopes } = documentToLevelData(doc);
  if (new World(tiles, cols, rows, slopes).overlaps(x, y, body.hw, body.hh))
    return "Can't play from here: the player would start inside a wall.";
  return {
    ...doc,
    id: `${doc.id}${PLAY_HERE_SUFFIX}`,
    objects: doc.objects.map((o) => (o === spawn ? { ...o, x, y } : o)),
  };
}

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

  /** Whether the running Play started from a chosen point rather than the Spawn. */
  private fromHere = false;

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
    else void this.startPlay(null);
  }

  /** Start Play with the player at a world point; the level's own Spawn does not move. */
  playFromHere(worldX: number, worldY: number): void {
    if (this.store.get().mode === "edit") void this.startPlay({ x: worldX, y: worldY });
  }

  get playingFromHere(): boolean {
    return this.fromHere;
  }

  private async startPlay(here: { x: number; y: number } | null): Promise<void> {
    const host = this.cb.getHost();
    if (!host) return;
    const gameData = this.cb.getGameData();
    if (!gameData) {
      this.cb.toast("Fix the errors in data/game.json (see Problems) before playing.");
      return;
    }
    // The copy Play runs (restarts included); checked now so a refusal is immediate,
    // and rebuilt from the level as it is once the loads below are done.
    const body = gameData.loadouts.get(this.cb.getLoadoutId() ?? DEFAULT_PLAYER_LOADOUT)?.actor
      .body ?? { hw: BODY_HALF_W, hh: BODY_HALF_H };
    const moveSpawn =
      here &&
      ((doc: LevelDocument) =>
        playHereDocument(doc, here.x, here.y, body, (value) => this.store.snap(value)));
    const early = moveSpawn?.(this.store.get().document);
    if (typeof early === "string") {
      this.cb.toast(early);
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
    const level = moveSpawn ? moveSpawn(state.document) : state.document;
    if (typeof level === "string") {
      this.cb.toast(level);
      return;
    }
    this.savedView = { zoom: state.zoom, viewportPosition: { ...state.viewportPosition } };
    this.savedSelection =
      state.selection.kind === "objects"
        ? { kind: "objects", ids: [...state.selection.ids] }
        : state.selection.kind === "decorations"
          ? { kind: "decorations", ids: [...state.selection.ids] }
          : { kind: "tiles", indices: [...state.selection.indices] };

    const token = ++this.playToken;
    this.fromHere = here !== null;
    this.cb.onModeChange("play");
    this.cb.setViewportVisible(false);

    try {
      await audio.load();
      const files = this.cb.getFileAccess();
      const loadoutId = this.cb.getLoadoutId();
      const session = createPlaytest(level, {
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
    const token = ++this.playToken;
    this.fromHere = false;
    // Taken before dispose: the run as played (a "from here" copy included), traced after.
    const run = this.play?.recordedRun();
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
    // Invulnerability (the only cheat that taints) is not in the input stream: a re-simulation
    // would take the hits the run ignored, so it would not show the run that was played.
    if (run?.replay.tainted) {
      this.store.setTrail(null);
      this.cb.toast("Trail unavailable: the run used a debug cheat.");
    } else if (run) {
      const opens = this.store.openCount;
      // Abandoned when another Play starts or another document opens meanwhile.
      const isStale = () => token !== this.playToken || this.store.openCount !== opens;
      traceRun(run, { isStale })
        .then((trail) => {
          if (trail && !isStale()) this.store.setTrail(trail);
        })
        .catch((error: unknown) =>
          this.cb.toast(
            `Could not trace the last run: ${error instanceof Error ? error.message : String(error)}`,
          ),
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
