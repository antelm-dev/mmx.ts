import type { LevelDocument } from "@mmx/content-schema";
import type { PlaytestAudio } from "./PlaytestAudio.js";
import type { PlaytestInput } from "./PlaytestInput.js";
import type { PlaytestSnapshot } from "./snapshots.js";
import type { ClipboardAccess, ReplayFileAccess } from "@mmx/runtime/debug";
import type { BrowserInputBindings } from "@mmx/runtime/browser";

export interface CreatePlaytestOptions {
  host?: HTMLElement;
  audio?: PlaytestAudio;
  seed?: number;
  onSnapshot?: (snapshot: PlaytestSnapshot) => void;
  onError?: (error: string) => void;
  onExitToObject?: (sourceEntityId: string) => void;
  replayFiles?: ReplayFileAccess;
  clipboard?: ClipboardAccess;
  getBindings?: () => BrowserInputBindings;
  isPauseOnBlur?: () => boolean;
}

export interface EditorPlaytestSession {
  start(): Promise<void>;
  stop(): void;
  step(input?: PlaytestInput): void;
  snapshot(): PlaytestSnapshot;
  dispose(): void;

  togglePause(): void;
  readonly isPaused: boolean;
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
