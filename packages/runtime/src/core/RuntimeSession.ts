import type { Scene, SceneOptions } from "@mmx/engine";
import { ToolingSession, type SimulationSnapshot } from "@mmx/engine/tooling";
import type {
  RuntimeAudio,
  RuntimeInspect,
  RuntimePresentation,
  RuntimeSessionOptions,
} from "./types.js";

const DISPOSED = "Runtime session has been disposed";

export class RuntimeSession {
  private tooling: ToolingSession;
  private presentation: RuntimePresentation | undefined;
  private audio: RuntimeAudio | undefined;
  private disposed = false;

  constructor(options: RuntimeSessionOptions = {}) {
    this.presentation = options.presentation;
    this.audio = options.audio;
    this.tooling = new ToolingSession(this.mergeSceneOptions(options.scene));
    this.audio?.attachScene(this.tooling.scene);
    this.presentation?.bindScene(this.tooling.scene);
  }

  get scene(): Scene {
    this.assertLive();
    return this.tooling.scene;
  }

  get frame(): number {
    return this.tooling.frame;
  }

  get checkpointFrame(): number {
    return this.tooling.checkpointFrame;
  }

  get sceneRevision(): number {
    return this.tooling.sceneRevision;
  }

  step(mask: number): SimulationSnapshot {
    this.assertLive();
    const snap = this.tooling.step(mask);
    this.presentation?.sampleCosmetics?.(this.tooling.scene);
    return snap;
  }

  inspect(): RuntimeInspect {
    this.assertLive();
    return {
      frame: this.tooling.frame,
      checkpointFrame: this.tooling.checkpointFrame,
      sceneRevision: this.tooling.sceneRevision,
      simulation: this.tooling.inspect(),
    };
  }

  setCheckpoint(): void {
    this.assertLive();
    this.tooling.setCheckpoint();
  }

  restartCheckpoint(): SimulationSnapshot {
    this.assertLive();
    const snap = this.tooling.restartCheckpoint();
    this.rebind();
    return snap;
  }

  restartLevel(): SimulationSnapshot {
    this.assertLive();
    const snap = this.tooling.restartLevel();
    this.rebind();
    return snap;
  }

  seek(frame: number): SimulationSnapshot {
    this.assertLive();
    const snap = this.tooling.seek(frame);
    this.rebind();
    return snap;
  }

  setPresentation(presentation: RuntimePresentation | undefined): void {
    this.assertLive();
    this.presentation = presentation;
    presentation?.bindScene(this.tooling.scene);
  }

  setAudio(audio: RuntimeAudio | undefined): void {
    this.assertLive();
    this.audio = audio;
    audio?.attachScene(this.tooling.scene);
  }

  render(): void {
    this.assertLive();
    this.presentation?.render?.(this.tooling.scene);
  }

  replaceScene(options: SceneOptions = {}): SimulationSnapshot {
    this.assertLive();
    this.tooling = new ToolingSession(this.mergeSceneOptions(options));
    this.rebind();
    return this.tooling.inspect();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.presentation?.destroy?.();
    this.audio?.stop?.();
    this.presentation = undefined;
    this.audio = undefined;
  }

  private rebind(): void {
    this.presentation?.bindScene(this.tooling.scene);
    this.audio?.attachScene(this.tooling.scene);
    this.presentation?.render?.(this.tooling.scene);
  }

  private mergeSceneOptions(scene: SceneOptions = {}): SceneOptions {
    return {
      ...scene,
      onEnemySpawned: (enemy, index) => {
        scene.onEnemySpawned?.(enemy, index);
        this.presentation?.attachEnemy?.(enemy, index);
        this.audio?.attachEnemy?.(enemy);
      },
      onPickupSpawned: (pickup, index) => {
        scene.onPickupSpawned?.(pickup, index);
        this.presentation?.attachPickup?.(pickup, index);
      },
      onWeaponCapsuleSpawned: (capsule, index) => {
        scene.onWeaponCapsuleSpawned?.(capsule, index);
        this.presentation?.attachWeaponCapsule?.(capsule, index);
      },
    };
  }

  private assertLive(): void {
    if (this.disposed) throw new Error(DISPOSED);
  }
}
