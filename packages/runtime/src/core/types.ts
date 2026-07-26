import type {
  Enemy,
  LifeCapsule,
  Scene,
  SceneOptions,
  WeaponCapsule,
} from "@mmx/engine";
import type { SimulationSnapshot } from "@mmx/engine/tooling";

export interface RuntimePresentation {
  bindScene(scene: Scene): void;
  attachEnemy?(enemy: Enemy, index: number): void;
  attachPickup?(pickup: LifeCapsule, index: number): void;
  attachWeaponCapsule?(capsule: WeaponCapsule, index: number): void;
  sampleCosmetics?(scene: Scene): void;
  render?(scene: Scene): void;
  destroy?(): void;
}

export interface RuntimeAudio {
  attachScene(scene: Scene): void;
  attachEnemy?(enemy: Enemy): void;
  stop?(): void;
}

export interface RuntimeSessionOptions {
  scene?: SceneOptions;
  presentation?: RuntimePresentation;
  audio?: RuntimeAudio;
}

export interface RuntimeInspect {
  frame: number;
  checkpointFrame: number;
  sceneRevision: number;
  simulation: SimulationSnapshot;
}
