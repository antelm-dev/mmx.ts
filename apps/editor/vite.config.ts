import { defineConfig } from "vite";
import angular from "@analogjs/vite-plugin-angular";

/**
 * MMX Studio runs Angular under Vite via the Analog plugin. Staying on Vite (like
 * apps/web) is deliberate: the Pixi renderer package imports sprite sheets with
 * Vite-native `.png` and `?raw` imports, so Vite's asset pipeline is what makes
 * reusing the real engine renderer in Play mode work.
 *
 * Three settings are load-bearing — see apps/editor/README.md:
 *
 *  - `resolve.mainFields: ['module']` is required by the Angular plugin.
 *  - `tsconfig.app.json` must exist; the plugin compiles nothing without it and
 *    the browser is then served untransformed TypeScript.
 *  - `esbuild` must be set. The plugin does `config.esbuild ?? false`, i.e. it
 *    *disables* Vite's own TS transform unless the config provides one. The
 *    `@mmx/*` workspace packages are consumed as raw TypeScript source (their
 *    package exports point at `src/*.ts`) and are plain TS, not Angular, so they
 *    are deliberately left to esbuild rather than added to Angular's compilation
 *    (the Angular compiler emits them empty, since they sit outside its rootDir).
 */
const WORKSPACE_TS = /[\\/]packages[\\/][^\\/]+[\\/]src[\\/].*\.ts$/;

export default defineConfig({
  resolve: {
    mainFields: ["module"],
  },
  plugins: [
    angular({
      // Returning false skips the Angular compiler for that file, handing it to
      // Vite's esbuild below. The workspace packages are plain TypeScript.
      transformFilter: (_code, id) => !WORKSPACE_TS.test(id),
    }),
  ],
  esbuild: {
    include: [WORKSPACE_TS],
  },
  server: {
    port: 5174,
    strictPort: true,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
