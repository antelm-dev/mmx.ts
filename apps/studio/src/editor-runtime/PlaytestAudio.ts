import type { Enemy, Scene } from "@mmx/engine";

export interface PlaytestAudio {
  attachScene(scene: Scene): void;
  attachEnemy(enemy: Enemy): void;
  stop(): void;
}
