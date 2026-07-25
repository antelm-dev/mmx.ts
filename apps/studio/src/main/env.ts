/**
 * Build-time environment for the main process.
 *
 * `__ELECTRON_DEV__` is replaced by a literal `true` / `false` at bundle time by
 * `@rollup/plugin-replace` (see `rollup.config.mjs`), so the dead branch is
 * stripped from each build. In dev the window loads the Vite dev server; in a
 * packaged build it loads the renderer bundled next to the main process.
 */
declare const __ELECTRON_DEV__: boolean;

export const env = Object.freeze({
  dev: __ELECTRON_DEV__,
  /** Must match `server.port` (strictPort) in `vite.config.ts`. */
  devServerUrl: "http://localhost:5175",
});
