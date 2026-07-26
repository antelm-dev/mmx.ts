import { ZERO_FRAME_STATS, type FrameStatsSnapshot } from "@mmx/engine";

export type { FrameStatsSnapshot };

export type Vec2Snapshot = Readonly<{
  x: number;
  y: number;
}>;

export type RectSnapshot = Readonly<{
  x: number;
  y: number;
  w: number;
  h: number;
}>;

export type ActorSnapshot = Readonly<{
  runtimeId: string;
  sourceEntityId?: string;
  kind: string;
  bounds: RectSnapshot;
  velocity: Vec2Snapshot;
  health?: number;
  maxHealth?: number;
  state: string;
  abilities: readonly string[];
}>;

export type ProjectileSnapshot = Readonly<{
  runtimeId: string;
  kind: string;
  weapon: string;
  charge: number;
  phase: string;
  bounds: RectSnapshot;
  velocity: Vec2Snapshot;
}>;

export type CameraSnapshot = Readonly<{
  position: Vec2Snapshot;
  viewport: Readonly<{ width: number; height: number }>;
  activeZoneId?: string;
}>;

export type SimulationSnapshot = Readonly<{
  frame: number;
  digest: string;
  player: ActorSnapshot;
  actors: readonly ActorSnapshot[];
  projectiles: readonly ProjectileSnapshot[];
  camera: CameraSnapshot;
}>;

export type PlaytestStatus = "stopped" | "running" | "paused";

export type PlaytestSnapshot = Readonly<{
  status: PlaytestStatus;
  frame: number;
  checkpointFrame: number;
  runtime: SimulationSnapshot | null;
  selectedRuntimeId: string | null;
  sceneRevision: number;
  frameStats: FrameStatsSnapshot;
}>;

export const STOPPED_PLAYTEST: PlaytestSnapshot = Object.freeze({
  status: "stopped",
  frame: 0,
  checkpointFrame: 0,
  runtime: null,
  selectedRuntimeId: null,
  sceneRevision: 0,
  frameStats: ZERO_FRAME_STATS,
});
