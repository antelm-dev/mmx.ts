import type { Scene } from "../game/Scene.js";
import type { AbilityUser } from "../game/AbilityUser.js";
import type { Enemy } from "../game/Enemy.js";
import type { Player } from "../game/Player.js";
import type { Projectile } from "../game/Projectile.js";
import type { Camera } from "../game/Camera.js";

/**
 * Plain, serializable views of simulation state for a tool to read.
 *
 * Everything here is inert data: a snapshot holds no references to the live
 * engine objects, so a caller can hold, diff, or post it across a boundary
 * without reaching back into the running simulation or accidentally mutating it.
 * Values are copied verbatim (never rounded) — the one intentional exception is
 * {@link SimulationSnapshot.digest}, which keeps the {@link Scene.digest}
 * quantisation it already had.
 */

export interface Vec2Snapshot {
  x: number;
  y: number;
}

/** Axis-aligned box as a top-left origin plus size, in world pixels. */
export interface RectSnapshot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ActorSnapshot {
  runtimeId: string;
  /** Present when the actor was built from an authored entity (its iid). */
  sourceEntityId?: string;
  kind: string;
  bounds: RectSnapshot;
  velocity: Vec2Snapshot;
  /** Omitted for actors that carry no health notion. */
  health?: number;
  maxHealth?: number;
  /** Space-joined active-ability names, or "-" when idle. */
  state: string;
  /** The currently executing ability names, in execution order. */
  abilities: string[];
}

export interface ProjectileSnapshot {
  runtimeId: string;
  kind: string;
  weapon: string;
  /** Charge tier this shot was fired at. */
  charge: number;
  /** "live" while it can still collide, "spent" while only its hit particle plays. */
  phase: string;
  bounds: RectSnapshot;
  velocity: Vec2Snapshot;
}

export interface CameraSnapshot {
  position: Vec2Snapshot;
  viewport: { width: number; height: number };
  /** Id of the zone currently constraining the view, when one is active and named. */
  activeZoneId?: string;
}

export interface SimulationSnapshot {
  frame: number;
  digest: string;
  player: ActorSnapshot;
  actors: ActorSnapshot[];
  projectiles: ProjectileSnapshot[];
  camera: CameraSnapshot;
}

function abilitiesOf(user: AbilityUser): string[] {
  return user.executing_moves.map((m) => m.name);
}

function stateOf(abilities: string[]): string {
  return abilities.length > 0 ? abilities.join(" ") : "-";
}

function boundsOf(body: { pos: { x: number; y: number }; hw: number; hh: number }): RectSnapshot {
  return { x: body.pos.x - body.hw, y: body.pos.y - body.hh, w: body.hw * 2, h: body.hh * 2 };
}

function playerSnapshot(player: Player): ActorSnapshot {
  const abilities = abilitiesOf(player);
  return {
    runtimeId: "player",
    kind: "player",
    bounds: boundsOf(player),
    velocity: { x: player.velocity.x, y: player.velocity.y },
    health: player.current_health,
    maxHealth: player.max_health,
    state: stateOf(abilities),
    abilities,
  };
}

function enemySnapshot(enemy: Enemy): ActorSnapshot {
  const abilities = abilitiesOf(enemy);
  const snap: ActorSnapshot = {
    runtimeId: enemy.runtimeId,
    kind: enemy.kind,
    bounds: boundsOf(enemy),
    velocity: { x: enemy.velocity.x, y: enemy.velocity.y },
    health: enemy.current_health,
    maxHealth: enemy.max_health,
    state: stateOf(abilities),
    abilities,
  };
  if (enemy.sourceEntityId !== undefined) snap.sourceEntityId = enemy.sourceEntityId;
  return snap;
}

function projectileSnapshot(shot: Projectile): ProjectileSnapshot {
  const b = shot.bounds;
  return {
    runtimeId: shot.runtimeId,
    kind: shot.kind,
    weapon: shot.weapon,
    charge: shot.charge,
    phase: shot.phase,
    bounds: { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top },
    velocity: { x: shot.vx, y: 0 },
  };
}

function cameraSnapshot(camera: Camera): CameraSnapshot {
  const snap: CameraSnapshot = {
    position: { x: camera.x, y: camera.y },
    viewport: { width: camera.viewW, height: camera.viewH },
  };
  const zoneId = camera.activeZone?.id;
  if (zoneId !== undefined) snap.activeZoneId = zoneId;
  return snap;
}

/**
 * Build a full {@link SimulationSnapshot} from a scene. Side-effect free — it
 * only reads public state and {@link Scene.digest} (itself read-only), so it is
 * safe to call between fixed steps without perturbing the run.
 *
 * Ordering is stable: enemies follow `stage.enemies`, projectiles follow
 * `player.projectiles`, both of which the simulation maintains in a fixed order.
 */
export function snapshotScene(scene: Scene): SimulationSnapshot {
  return {
    frame: scene.frame,
    digest: scene.digest(),
    player: playerSnapshot(scene.player),
    actors: scene.stage.enemies.map(enemySnapshot),
    projectiles: scene.player.projectiles.map(projectileSnapshot),
    camera: cameraSnapshot(scene.camera),
  };
}
