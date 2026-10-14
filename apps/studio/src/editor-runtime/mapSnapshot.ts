import type {
  ActorSnapshot as EngineActorSnapshot,
  CameraSnapshot as EngineCameraSnapshot,
  ProjectileSnapshot as EngineProjectileSnapshot,
  SimulationSnapshot as EngineSimulationSnapshot,
  Vec2Snapshot as EngineVec2Snapshot,
  RectSnapshot as EngineRectSnapshot,
} from "@mmx/engine/tooling";
import type {
  ActorSnapshot,
  CameraSnapshot,
  ProjectileSnapshot,
  RectSnapshot,
  SimulationSnapshot,
  Vec2Snapshot,
} from "./snapshots.js";

function mapVec2(v: EngineVec2Snapshot): Vec2Snapshot {
  return { x: v.x, y: v.y };
}

function mapRect(r: EngineRectSnapshot): RectSnapshot {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

function mapActor(actor: EngineActorSnapshot): ActorSnapshot {
  const snap: {
    -readonly [K in keyof ActorSnapshot]: ActorSnapshot[K];
  } = {
    runtimeId: actor.runtimeId,
    kind: actor.kind,
    bounds: mapRect(actor.bounds),
    velocity: mapVec2(actor.velocity),
    state: actor.state,
    abilities: [...actor.abilities],
  };
  if (actor.sourceEntityId !== undefined) snap.sourceEntityId = actor.sourceEntityId;
  if (actor.health !== undefined) snap.health = actor.health;
  if (actor.maxHealth !== undefined) snap.maxHealth = actor.maxHealth;
  return snap;
}

function mapProjectile(shot: EngineProjectileSnapshot): ProjectileSnapshot {
  return {
    runtimeId: shot.runtimeId,
    kind: shot.kind,
    weapon: shot.weapon,
    charge: shot.charge,
    phase: shot.phase,
    bounds: mapRect(shot.bounds),
    velocity: mapVec2(shot.velocity),
  };
}

function mapCamera(camera: EngineCameraSnapshot): CameraSnapshot {
  const snap: {
    -readonly [K in keyof CameraSnapshot]: CameraSnapshot[K];
  } = {
    position: mapVec2(camera.position),
    viewport: { width: camera.viewport.width, height: camera.viewport.height },
  };
  if (camera.activeZoneId !== undefined) snap.activeZoneId = camera.activeZoneId;
  return snap;
}

export function mapSimulationSnapshot(snap: EngineSimulationSnapshot): SimulationSnapshot {
  return {
    frame: snap.frame,
    digest: snap.digest,
    player: mapActor(snap.player),
    actors: snap.actors.map(mapActor),
    projectiles: snap.projectiles.map(mapProjectile),
    camera: mapCamera(snap.camera),
  };
}
