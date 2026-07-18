import { defineConfig } from 'vite';

/**
 * Vite serves the web front-end (index.html -> src/web/main.ts), which renders with
 * PixiJS, with HMR. The pure engine under src/engine + src/core is shared unchanged
 * with the headless Node sim/tests (built separately by `tsc`).
 */
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    open: !isTauri,
    watch: {
      ignored: (p) => p.replace(/\\/g, '/').includes('/src-tauri/'),
    },
  },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    target: 'es2020',
  },
});
