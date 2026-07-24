import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";

/**
 * Electron main process for MMX Studio.
 *
 * Owns the single editor window and the two file IPC handlers the preload bridge
 * forwards to. In dev, `electron-vite` injects `ELECTRON_RENDERER_URL` (the Vite
 * dev server); in a packaged build we load the built `index.html` off disk.
 */
function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#090d14",
    show: false,
    autoHideMenuBar: true,
    title: "MMX Studio",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => window.show());

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

ipcMain.handle("studio:save-file", async (_event, suggestedName: string, json: string) => {
  const name = suggestedName.endsWith(".json") ? suggestedName : `${suggestedName}.json`;
  const result = await dialog.showSaveDialog({
    title: "Save Level",
    defaultPath: name,
    filters: [{ name: "MMX Level", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, json, "utf8");
  return basename(result.filePath);
});

ipcMain.handle("studio:open-file", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open Level",
    properties: ["openFile"],
    filters: [{ name: "MMX Level", extensions: ["json"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const json = await readFile(filePath, "utf8");
  return { name: basename(filePath), json };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
