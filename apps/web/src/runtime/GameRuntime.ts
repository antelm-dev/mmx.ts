import { DT } from "@mmx/engine/core/constants.js";
import type { DebugPanel } from "../debug/DebugPanel.js";
import type { DebugSession } from "../debug/DebugSession.js";
import type { InputBinding } from "../input/InputBinding.js";
import type { ScenePresenter } from "../presentation/ScenePresenter.js";
import type { HomeScreen } from "../ui/HomeScreen.js";
import type { SettingsMenuController } from "../settings/SettingsMenuController.js";

/**
 * The fixed-timestep `requestAnimationFrame` loop: the one piece of main.ts
 * that had no precedent elsewhere in the codebase to follow (unlike
 * {@link DebugSession}, {@link InputBinding} etc., which mirror the small,
 * options-injected coordinator shape already established there).
 *
 * Everything it does each frame is delegate to one of its collaborators —
 * it asks {@link InputBinding} for this frame's actions, tells
 * {@link DebugSession} to step, and tells {@link ScenePresenter} to draw —
 * so that checkpoint/pause/stage-transition/boss-state work can extend those
 * collaborators without this file growing.
 */

/**
 * Longest slice of wall clock a single frame may contribute to the accumulator.
 *
 * Without it, a tab that was backgrounded for ten seconds returns with six
 * hundred queued steps and fast-forwards through them — and if catching up takes
 * longer than the time it is catching up on, it never converges. The time past
 * this cap is discarded, which is what {@link FrameStats.droppedFrames} counts.
 */
const MAX_FRAME_SECONDS = 0.25;

export interface GameRuntimeOptions {
  debug: DebugSession;
  input: InputBinding;
  presenter: ScenePresenter;
  panel: DebugPanel;
  menu: SettingsMenuController;
  home: HomeScreen;
}

export class GameRuntime {
  constructor(private readonly options: GameRuntimeOptions) {}

  start(): void {
    let acc = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      const frameTime = now - last;
      for (const name of ["mmx:frame-work", "mmx:simulation", "mmx:render"]) {
        performance.clearMeasures(name);
        performance.clearMarks(`${name}:start`);
        performance.clearMarks(`${name}:end`);
      }
      performance.mark("mmx:frame-work:start");

      const { debug, input, presenter, panel, menu, home } = this.options;

      // Before the accumulator, so the steps below run against this frame's pad
      // state rather than the previous one's. The repeat clock is clamped for the
      // same reason the accumulator is: a tab that was backgrounded for ten seconds
      // must not come back and scroll the menu to the bottom.
      const modalVisible = menu.visible || home.visible;
      input.pollPad(Math.min(frameTime / 1000, MAX_FRAME_SECONDS), modalVisible);
      input.applyPadMenuCodes();

      // Scaled before clamping, so slow motion buys a longer wall-clock budget
      // rather than being cut off at the same quarter second real time is.
      // An open menu contributes no simulation time, for the same reason a pause
      // does: the accumulator must not fill behind it and then discharge the whole
      // backlog the moment it closes.
      const elapsed = modalVisible ? 0 : debug.scaleElapsed((now - last) / 1000);
      if (elapsed > MAX_FRAME_SECONDS) debug.stats.droppedFrames++;
      acc += Math.min(MAX_FRAME_SECONDS, elapsed);
      last = now;

      let simulationSteps = 0;
      performance.mark("mmx:simulation:start");
      while (acc >= DT) {
        this.stepOnce();
        acc -= DT;
        simulationSteps++;
      }
      // Frame advance runs outside the budget: the point is exactly one tick, not
      // DT worth of injected wall clock.
      while (debug.shouldStep()) {
        this.stepOnce();
        simulationSteps++;
      }
      performance.mark("mmx:simulation:end");
      const simulation = performance.measure(
        "mmx:simulation",
        "mmx:simulation:start",
        "mmx:simulation:end",
      ).duration;

      const scene = debug.scene;
      presenter.updateOverlay(scene, debug.overlayVisible);
      // A no-op unless the window moved to a display that changed the integer zoom.
      menu.setPixelScale(presenter.pixelScale);
      home.setPixelScale(presenter.pixelScale);
      // Drives the home screen's idle cursor bob.
      home.update(now);

      performance.mark("mmx:render:start");
      presenter.render(scene);
      performance.mark("mmx:render:end");
      const rendering = performance.measure(
        "mmx:render",
        "mmx:render:start",
        "mmx:render:end",
      ).duration;
      performance.mark("mmx:frame-work:end");
      const frameWork = performance.measure(
        "mmx:frame-work",
        "mmx:frame-work:start",
        "mmx:frame-work:end",
      ).duration;

      debug.stats.record({
        frameTime,
        simulation,
        rendering,
        frameWork,
        simulationSteps,
        accumulator: acc,
      });
      panel.update(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * One fixed step of everything: the recorded simulation, then the cosmetics
   * that ride on it. Both are inside the step so a slowed or single-stepped
   * frame advances the afterimages by exactly one tick too.
   */
  private stepOnce(): void {
    const { debug, input, presenter } = this.options;
    debug.beforeStep();
    debug.recorder.step(input.packedActions());
    presenter.sampleCosmetics(DT, debug.scene.player);
  }
}
