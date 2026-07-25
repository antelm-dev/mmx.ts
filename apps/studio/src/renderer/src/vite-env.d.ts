/// <reference types="vite/client" />

import type { StudioBridge } from "../../preload/index.js";

declare global {
  interface Window {
    /**
     * Typed IPC bridge exposed by the Electron preload — generated from the
     * `*.ipc.ts` modules by `electron-ipc-module`. E.g.
     * `window.studio.files.saveFile(...)`.
     */
    studio?: StudioBridge;
  }
}
