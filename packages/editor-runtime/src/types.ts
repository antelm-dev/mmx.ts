import type { GameplaySounds } from "@mmx/browser-audio";
import type { LevelDocument } from "@mmx/content-schema";
import type { PlaytestInput } from "./PlaytestInput.js";
import type { PlaytestSnapshot } from "./snapshots.js";

export interface CreatePlaytestOptions {
  host?: HTMLElement;
  sounds?: GameplaySounds;
  seed?: number;
  onSnapshot?: (snapshot: PlaytestSnapshot) => void;
  onError?: (message: string) => void;
  onExitToObject?: (sourceEntityId: string) => void;
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
  select(runtimeId: string | null): void;
  focusSelectedSource(): void;
}

export type { LevelDocument };
