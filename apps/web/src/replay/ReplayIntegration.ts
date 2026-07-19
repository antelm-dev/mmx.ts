import type { DebugSession } from "../debug/DebugSession.js";
import type { DesktopBridge } from "../DesktopBridge.js";

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
    private readonly desktop: DesktopBridge,
    private readonly debug: DebugSession,
  ) {}

  async start(): Promise<void> {
    await this.desktop.onReplayDropped((file) => this.debug.loadReplayText(file.contents, file.path));
  }
}
