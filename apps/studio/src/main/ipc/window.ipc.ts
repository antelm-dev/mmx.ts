import { app, BrowserWindow } from "electron";
import { defineIpcEvents, defineIpcModule, handle } from "electron-ipc-module";

type WindowEvents = {
  "fullscreen-changed": [fullscreen: boolean];
};

export const windowEvents = defineIpcEvents<WindowEvents>();

/**
 * The `window` IPC module: title-bar controls for the frameless window.
 *
 * With `frame: false` (see `main/index.ts`) the OS chrome is gone, so the
 * renderer's custom `TitleBar` drives min/maximize/close/fullscreen through
 * here. Each handler resolves the calling `BrowserWindow` from the invoking
 * web contents, so it always targets the window the click came from.
 *
 * `defineIpcModule` registers the channels under the `window:` prefix and the
 * `electron-ipc-module` Rollup plugin generates the typed preload bridge, so the
 * renderer calls `window.studio.window.minimize()` / `.toggleMaximize()` etc.
 */
export function createWindowIpc() {
  return defineIpcModule(
    "window",
    {
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
      "toggle-fullscreen": handle(async (event): Promise<boolean> => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return false;
        win.setFullScreen(!win.isFullScreen());
        return win.isFullScreen();
      }),
      "is-fullscreen": handle(
        async (event): Promise<boolean> =>
          BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false,
      ),
      "toggle-dev-tools": handle(async (event): Promise<void> => {
        event.sender.toggleDevTools();
      }),
      close: handle(async (event): Promise<void> => {
        BrowserWindow.fromWebContents(event.sender)?.close();
      }),
    },
    {
      ready: () => {
        const notify = (win: BrowserWindow) => {
          if (win.isDestroyed()) return;
          win.webContents.send("fullscreen-changed", win.isFullScreen());
        };
        const attach = (win: BrowserWindow) => {
          win.on("enter-full-screen", () => notify(win));
          win.on("leave-full-screen", () => notify(win));
          win.webContents.on("before-input-event", (event, input) => {
            if (input.type !== "keyDown" || input.key !== "F11") return;
            event.preventDefault();
            win.setFullScreen(!win.isFullScreen());
          });
        };
        for (const win of BrowserWindow.getAllWindows()) attach(win);
        const onCreated = (_event: Electron.Event, win: BrowserWindow) => attach(win);
        app.on("browser-window-created", onCreated);
        return () => {
          app.off("browser-window-created", onCreated);
        };
      },
    },
  );
}
