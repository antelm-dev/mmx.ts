import type { Scene } from "@mmx/engine";

export interface DebugRenderOptions {
  collisionGeometry: boolean;
  actorBounds: boolean;
  sensors: boolean;
  projectiles: boolean;
  cameraZones: boolean;
  spriteBounds: boolean;
}

export interface DebugGeometryOverlay {
  readonly view: { parent?: unknown };
  options(): DebugRenderOptions;
  setOptions(patch: Partial<DebugRenderOptions>): void;
  update(scene: Scene, options?: DebugRenderOptions): void;
  reset(): void;
  destroy(): void;
}

export const DEBUG_RENDER_OPTIONS_OFF = {
  collisionGeometry: false,
  actorBounds: false,
  sensors: false,
  projectiles: false,
  cameraZones: false,
  spriteBounds: false,
} as const satisfies DebugRenderOptions;

export function mergeDebugRenderOptions(
  base: DebugRenderOptions,
  patch: Partial<DebugRenderOptions>,
): DebugRenderOptions {
  return {
    collisionGeometry: patch.collisionGeometry ?? base.collisionGeometry,
    actorBounds: patch.actorBounds ?? base.actorBounds,
    sensors: patch.sensors ?? base.sensors,
    projectiles: patch.projectiles ?? base.projectiles,
    cameraZones: patch.cameraZones ?? base.cameraZones,
    spriteBounds: patch.spriteBounds ?? base.spriteBounds,
  };
}

export function anyDebugRenderOption(options: DebugRenderOptions): boolean {
  return (
    options.collisionGeometry ||
    options.actorBounds ||
    options.sensors ||
    options.projectiles ||
    options.cameraZones ||
    options.spriteBounds
  );
}
