import type { DebugSession } from "../debug/DebugSession.js";
import type { ReplayFileDropHost } from "@mmx/runtime-host";

/**
 * Wires the desktop's dropped-replay-file event to {@link DebugSession}.
 *
 * Deliberately thin today — save/load-from-dialog already lives on
 * `DebugSession` (the `U`/`O` debug commands) since it needs the recorder's
 * own state. This is the seam for replay-adjacent features that don't belong
 * on the debug session either, e.g. autosaving a replay at a checkpoint or a
 * replay browser reachable from the home screen, so they have somewhere to
 * land other than back in main.ts.
 */
export class ReplayIntegration {
  constructor(
    private readonly desktop: ReplayFileDropHost,
    private readonly debug: DebugSession,
  ) {}

  private cleanup?: () => void;

  async start(): Promise<void> {
    const result = await this.desktop.onReplayDropped?.((file) => {
      this.debug.loadReplayText(file.contents, file.path);
    });
    const unlisten = typeof result === "function" ? result : undefined;
    this.cleanup = unlisten;
  }

  dispose(): void {
    this.cleanup?.();
    this.cleanup = undefined;
  }
}
