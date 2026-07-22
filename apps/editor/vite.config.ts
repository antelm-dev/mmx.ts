import { defineConfig } from "vite";

/**
 * Vite serves MMX Studio (index.html -> src/main.ts). It composes the engine,
 * Pixi renderer, and content-schema workspace packages the same way apps/web
 * does, on a separate port so both can run at once.
 */
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
});
