/// <reference types="vite/client" />

import type { StudioFileApi } from "../../preload/api.js";

declare global {
  interface Window {
    /** Native file access exposed by the Electron preload bridge. */
    studio?: StudioFileApi;
  }
}
