import { BrowserWindow } from "electron";
import { defineIpcModule, handle } from "electron-ipc-module";

/**
 * The `window` IPC module: title-bar controls for the frameless window.
 *
 * With `frame: false` (see `main/index.ts`) the OS chrome is gone, so the
 * renderer's custom `TitleBar` drives min/maximize/close through here. Each
 * handler resolves the calling `BrowserWindow` from the invoking web contents,
 * so it always targets the window the click came from.
 *
 * `defineIpcModule` registers the channels under the `window:` prefix and the
 * `electron-ipc-module` Rollup plugin generates the typed preload bridge, so the
 * renderer calls `window.studio.window.minimize()` / `.toggleMaximize()` etc.
 */
export function createWindowIpc() {
  return defineIpcModule("window", {
    minimize: handle(async (event): Promise<void> => {
      BrowserWindow.fromWebContents(event.sender)?.minimize();
    }),
    "toggle-maximize": handle(async (event): Promise<boolean> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return false;
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return win.isMaximized();
    }),
    "is-maximized": handle(
      async (event): Promise<boolean> =>
        BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false,
    ),
    close: handle(async (event): Promise<void> => {
      BrowserWindow.fromWebContents(event.sender)?.close();
    }),
  });
}
