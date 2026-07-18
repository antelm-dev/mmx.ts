import { defineConfig } from 'vite';

/**
 * Vite serves the web front-end (index.html -> src/web/main.ts), which renders with
 * the Canvas 2D API, with HMR. The pure engine under src/engine + src/core is
 * shared unchanged with the headless Node sim/tests (built separately by `tsc`).
 */
export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    target: 'es2020',
  },
});
