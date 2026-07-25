import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Renderer build for MMX Studio (the React + Vite app). The `main` and `preload`
 * processes are built separately by Rollup (see `rollup.config.mjs`).
 *
 * The renderer composes the `@mmx/*` workspace packages as *raw TypeScript
 * source* (their exports point at `src/*.ts`) and pulls sprite sheets in via
 * Vite-native `.png` / `?raw` imports — the same Vite asset pipeline apps/web
 * relies on, which is what lets Play mode reuse the real engine renderer.
 *
 * `base: "./"` keeps asset URLs relative so the packaged build loads correctly
 * from `file://` when the main process does `loadFile(out/renderer/index.html)`.
 */
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  base: "./",
  // Serve app-level static assets (favicon.png) that live outside the renderer
  // root; Vite copies them verbatim into `out/renderer/` on build.
  publicDir: resolve(__dirname, "public"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer/src"),
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2022",
    outDir: resolve(__dirname, "out/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/renderer/index.html"),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});
