import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * MMX Studio (Electron edition) build.
 *
 * Three processes, one config:
 *  - `main`    — the Electron main process (window lifecycle + native dialogs).
 *  - `preload` — the isolated bridge that exposes a tiny file-access API.
 *  - `renderer` — the React + Vite app. It composes the `@mmx/*` workspace
 *    packages, which are consumed as *raw TypeScript source* (their exports point
 *    at `src/*.ts`) and pull sprite sheets in via Vite-native `.png` / `?raw`
 *    imports — the same Vite asset pipeline apps/web relies on, which is what lets
 *    Play mode reuse the real engine renderer.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, "src/main/index.ts") },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, "src/preload/index.ts") },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
      },
    },
    plugins: [react()],
    build: {
      target: "es2022",
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
    server: {
      port: 5175,
      strictPort: true,
    },
  },
});
