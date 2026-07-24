import { contextBridge, ipcRenderer } from "electron";
import type { StudioFileApi } from "./api.js";

/**
 * The only surface the renderer gets on the Node side. Context isolation is on,
 * so the React app talks to the file system exclusively through these two IPC
 * calls — mirroring the editor's `FileAccess` interface, but backed by native
 * Electron dialogs instead of a browser download / hidden input.
 */
const api: StudioFileApi = {
  saveFile: (suggestedName, json) => ipcRenderer.invoke("studio:save-file", suggestedName, json),
  openFile: () => ipcRenderer.invoke("studio:open-file"),
};

contextBridge.exposeInMainWorld("studio", api);
