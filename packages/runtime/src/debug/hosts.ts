import type { LevelData, Recorder, Replay, Scene } from "@mmx/engine";
import type { RuntimeSession } from "../core/RuntimeSession.js";
import type { DebugSimulationHost } from "./types.js";

export function createRecorderDebugHost(
  recorder: Recorder,
  onSceneReplaced?: (scene: Scene) => void,
): DebugSimulationHost {
  const replace = (rebuild: () => Scene): void => {
    const scene = rebuild();
    onSceneReplaced?.(scene);
  };

  return {
    get scene() {
      return recorder.scene;
    },
    get frame() {
      return recorder.frame;
    },
    get checkpointFrame() {
      return recorder.checkpoint;
    },
    get recordedLength() {
      return recorder.length;
    },
    get lastMask() {
      return recorder.lastMask;
    },
    get isTainted() {
      return recorder.isTainted;
    },
    setCheckpoint() {
      recorder.placeCheckpoint();
    },
    restartCheckpoint() {
      replace(() => recorder.restart());
    },
    restartLevel() {
      replace(() => recorder.restartLevel());
    },
    seek(frame) {
      replace(() => recorder.rewindTo(frame));
    },
    loadLevel(level: LevelData) {
      replace(() => recorder.loadLevel(level));
    },
    markTainted() {
      recorder.markTainted();
    },
    toReplay() {
      return recorder.toReplay();
    },
    loadReplay(replay: Replay) {
      replace(() => recorder.load(replay));
    },
  };
}

export function createRuntimeDebugHost(session: RuntimeSession): DebugSimulationHost {
  return {
    get scene() {
      return session.scene;
    },
    get frame() {
      return session.frame;
    },
    get checkpointFrame() {
      return session.checkpointFrame;
    },
    get recordedLength() {
      return session.recordedLength;
    },
    get lastMask() {
      return session.lastMask;
    },
    get isTainted() {
      return session.isTainted;
    },
    setCheckpoint() {
      session.setCheckpoint();
    },
    restartCheckpoint() {
      session.restartCheckpoint();
    },
    restartLevel() {
      session.restartLevel();
    },
    seek(frame) {
      session.seek(frame);
    },
    loadLevel(level) {
      session.loadLevel(level);
    },
    markTainted() {
      session.markTainted();
    },
    toReplay() {
      return session.toReplay();
    },
    loadReplay(replay) {
      session.loadReplay(replay);
    },
  };
}
