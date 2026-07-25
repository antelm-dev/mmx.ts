import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { createIpcContainer } from "electron-ipc-module";
import { env } from "./env.js";
import { createFilesIpc } from "./ipc/files.ipc.js";
import { createWindowIpc } from "./ipc/window.ipc.js";

/**
 * Electron main process for MMX Studio.
 *
 * Owns the single editor window and loads the IPC modules the preload bridge
 * forwards to. In dev (`__ELECTRON_DEV__`) it points the window at the Vite dev
 * server, retrying until it is up; in a packaged build it loads the built
 * `index.html` off disk.
 */
function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    // Vite copies `public/favicon.png` next to the renderer bundle on build; in
    // dev it still lives under the app's `public/` dir (two levels up from
    // `out/main`). Sets the window and taskbar icon.
    icon: join(__dirname, env.dev ? "../../public/favicon.png" : "../renderer/favicon.png"),
    backgroundColor: "#090d14",
    show: false,
    autoHideMenuBar: true,
    // Frameless: the renderer draws its own title bar (see `TitleBar.tsx`) and
    // drives min/maximize/close through the `window` IPC module.
    frame: false,
    title: "MMX Studio",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => window.show());

  if (env.dev) {
    // The renderer dev server and this process start in parallel, so the first
    // load can beat Vite to the port — retry until it answers.
    const load = () => void window.loadURL(env.devServerUrl);
    window.webContents.on("did-fail-load", () => setTimeout(load, 300));
    load();
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  const ipc = createIpcContainer();
  await ipc.loadAll({
    files: createFilesIpc(),
    window: createWindowIpc(),
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
