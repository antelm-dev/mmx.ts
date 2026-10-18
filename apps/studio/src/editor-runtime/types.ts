import type { LevelArt, LevelDocument } from "@mmx/content-schema";
import type { CompiledGameData } from "@mmx/engine/data";
import type { PlaytestAudio } from "./PlaytestAudio.js";
import type { PlaytestInput } from "./PlaytestInput.js";
import type { PlaytestSnapshot } from "./snapshots.js";
import type { RecordedRun } from "./trail.js";
import type { ClipboardAccess, ReplayFileAccess } from "@mmx/runtime/debug";
import type { BrowserInputBindings } from "@mmx/runtime/browser";
import type { AssetCatalog, RendererAssetManifest } from "@mmx/renderer-pixi";

export interface CreatePlaytestOptions {
  host?: HTMLElement;
  audio?: PlaytestAudio;
  seed?: number;
  /** Compiled player loadout id (the project's `player.loadout`); `player.x` when omitted. */
  loadoutId?: string;
  /** The project's compiled game data (its packs and `data/game.json` merged in). */
  gameData: CompiledGameData;
  onSnapshot?: (snapshot: PlaytestSnapshot) => void;
  onError?: (error: string) => void;
  onExitToObject?: (sourceEntityId: string) => void;
  replayFiles?: ReplayFileAccess;
  clipboard?: ClipboardAccess;
  getBindings?: () => BrowserInputBindings;
  isPauseOnBlur?: () => boolean;
  rendererAssets?: AssetCatalog;
  rendererManifest?: RendererAssetManifest;
  /** Geometry of the project tilesets the level's tile layers paint from. */
  tilesets?: LevelArt["tilesets"];
}

export interface EditorPlaytestSession {
  start(): Promise<void>;
  stop(): void;
  step(input?: PlaytestInput): void;
  snapshot(): PlaytestSnapshot;
  dispose(): void;
  /** The running Play's input timeline and scene, for {@link traceRun}; null when stopped. */
  recordedRun(): RecordedRun | null;

  togglePause(): void;
  readonly isPaused: boolean;
  /** Ability names of the running player's loadout (empty when stopped). */
  readonly playerMoveset: readonly string[];
  /** Game data enemy ids of the running scene's enemies (empty when stopped). */
  readonly enemyKinds: readonly string[];
  setCheckpoint(): void;
  restartCheckpoint(): void;
  restartLevel(): void;
  seek(frame: number): void;
  setTimeScale(scale: number): void;
  nudgeTimeScale(delta: number): void;
  setInvulnerable(enabled: boolean): void;
  saveReplay(): void;
  loadReplay(): void;
  loadReplayText(text: string, source?: string): void;
  copyDiagnostics(): Promise<void>;
  select(runtimeId: string | null): void;
  focusSelectedSource(): void;
}

export type { LevelDocument };
