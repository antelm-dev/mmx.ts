import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { createIpcContainer } from "electron-ipc-module";
import { env } from "./env.js";
import { createFilesIpc } from "./ipc/files.ipc.js";
import { createWindowIpc } from "./ipc/window.ipc.js";

const DEV_READY_TIMEOUT_MS = 30_000;
const DEV_POLL_MS = 200;

async function waitForDevServer(url: string): Promise<void> {
  const deadline = Date.now() + DEV_READY_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (response.ok || response.status === 404) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, DEV_POLL_MS));
  }

  throw new Error(
    `Vite dev server at ${url} did not become ready within ${DEV_READY_TIMEOUT_MS}ms` +
      (lastError instanceof Error ? ` (${lastError.message})` : ""),
  );
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    icon: join(__dirname, env.dev ? "../../public/favicon.png" : "../renderer/favicon.png"),
    backgroundColor: "#090d14",
    show: false,
    autoHideMenuBar: true,
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
    void (async () => {
      await waitForDevServer(env.devServerUrl);
      await window.loadURL(env.devServerUrl);
    })().catch((error: unknown) => {
      console.error("[studio] failed to load renderer", error);
      app.quit();
    });
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
