import type { LevelData, Replay, Scene } from "@mmx/engine";

export const TIME_SCALES = [0.05, 0.1, 0.25, 0.5, 1] as const;

export type TimeScale = (typeof TIME_SCALES)[number];

export interface ReplayText {
  path: string;
  contents: string;
}

export interface ReplayFileAccess {
  save(contents: string, suggestedName: string): Promise<string | null>;
  open(): Promise<ReplayText | null>;
}

export interface ClipboardAccess {
  writeText(text: string): Promise<void>;
}

/**
 * Simulation seam consumed by {@link DebugController}. Implemented by a
 * {@link Recorder} adapter, {@link RuntimeSession}, or any host that owns
 * deterministic stepping and rewind.
 */
export interface DebugSimulationHost {
  readonly scene: Scene;
  readonly frame: number;
  readonly checkpointFrame: number;
  readonly recordedLength: number;
  readonly lastMask: number;
  readonly isTainted: boolean;
  setCheckpoint(): void;
  restartCheckpoint(): void;
  restartLevel(): void;
  seek(frame: number): void;
  loadLevel(level: LevelData): void;
  markTainted(): void;
  toReplay(): Replay;
  loadReplay(replay: Replay): void;
}

export type DebugStatus = "running" | "paused";

export interface DebugSnapshot {
  status: DebugStatus;
  paused: boolean;
  frame: number;
  checkpointFrame: number;
  recordedLength: number;
  timeScale: number;
  invulnerable: boolean;
  tainted: boolean;
  lastMask: number;
  notice: string;
}

export interface DebugControllerOptions {
  host: DebugSimulationHost;
  replayFiles?: ReplayFileAccess;
  clipboard?: ClipboardAccess;
  extraDiagnostics?: () => Record<string, string | number>;
  now?: () => number;
}
