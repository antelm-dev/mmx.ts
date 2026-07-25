import { contextBridge } from "electron";
import { bridge } from "./generated/ipc-bridge.js";

/**
 * The only surface the renderer gets on the Node side. Context isolation is on,
 * so the React app talks to the file system exclusively through the typed
 * `bridge` generated from the `*.ipc.ts` modules by `electron-ipc-module`.
 *
 * Exposed as `window.studio`, so the renderer calls e.g.
 * `window.studio.files.saveFile(name, json)`.
 */
export type StudioBridge = typeof bridge;

contextBridge.exposeInMainWorld("studio", bridge);
