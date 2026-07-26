import { DT, type SceneOptions } from "@mmx/engine";
import type { SimulationSnapshot } from "@mmx/engine/tooling";
import {
  RuntimeSession,
  type RuntimeAudio,
  type RuntimeInspect,
  type RuntimePresentation,
  type RuntimeSessionOptions,
} from "../core/index.js";
import type {
  FixedStepLoop,
  FixedStepLoopOptions,
} from "../browser/FixedStepLoop.js";

export interface CreatePlayerRuntimeOptions extends RuntimeSessionOptions {}

export interface PlayerLoopHooks
  extends Pick<FixedStepLoopOptions, "onStep" | "onRender" | "onFrameStart" | "onFrameStats" | "onError"> {
  maxFrameSeconds?: number;
}

export interface PlayerRuntime {
  readonly session: RuntimeSession;
  step(mask: number): SimulationSnapshot;
  inspect(): RuntimeInspect;
  setCheckpoint(): void;
  restartCheckpoint(): SimulationSnapshot;
  restartLevel(): SimulationSnapshot;
  seek(frame: number): SimulationSnapshot;
  replaceScene(options?: SceneOptions): SimulationSnapshot;
  setPresentation(presentation: RuntimePresentation | undefined): void;
  setAudio(audio: RuntimeAudio | undefined): void;
  render(): void;
  /**
   * Builds a browser fixed-step loop. Imports scheduling only when called so
   * headless player sessions stay free of DOM APIs.
   */
  createLoop(hooks: PlayerLoopHooks): Promise<FixedStepLoop>;
  dispose(): void;
}

export function createPlayerRuntime(
  options: CreatePlayerRuntimeOptions = {},
): PlayerRuntime {
  const session = new RuntimeSession(options);

  return {
    session,
    step: (mask) => session.step(mask),
    inspect: () => session.inspect(),
    setCheckpoint: () => session.setCheckpoint(),
    restartCheckpoint: () => session.restartCheckpoint(),
    restartLevel: () => session.restartLevel(),
    seek: (frame) => session.seek(frame),
    replaceScene: (sceneOptions) => session.replaceScene(sceneOptions),
    setPresentation: (presentation) => session.setPresentation(presentation),
    setAudio: (audio) => session.setAudio(audio),
    render: () => session.render(),
    async createLoop(hooks) {
      const { FixedStepLoop } = await import("../browser/FixedStepLoop.js");
      return new FixedStepLoop({
        stepSeconds: DT,
        maxFrameSeconds: hooks.maxFrameSeconds ?? 0.25,
        onStep: hooks.onStep,
        onRender: hooks.onRender,
        onFrameStart: hooks.onFrameStart,
        onFrameStats: hooks.onFrameStats,
        onError: hooks.onError,
      });
    },
    dispose: () => session.dispose(),
  };
}
