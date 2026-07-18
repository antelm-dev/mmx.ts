import { defineConfig } from "vite";

/**
 * Vite serves the web app (index.html -> src/main.ts) with HMR. It composes the
 * engine and Pixi renderer workspace packages; the same build is wrapped by the
 * desktop app.
 */
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    open: !isTauri,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
});
