import { createRequire } from "node:module";
import { defineConfig } from "rollup";
import electronRun from "electron-run/rollup-plugin";
import ipcBridge from "electron-ipc-module/rollup-plugin";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import typescript from "@rollup/plugin-typescript";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";

/**
 * Builds the Electron main and preload bundles (the renderer is built by Vite —
 * see `vite.config.ts`). Replaces the old `electron-vite` setup:
 *
 *  - `ipcBridge` regenerates the typed preload bridge from `src/main/ipc/*.ipc.ts`
 *    at the start of every build.
 *  - `electronRun` (re)launches Electron on each rebuild while watching.
 *
 * Output is plain `.js` CommonJS (the package intentionally omits
 * `"type": "module"`), so Electron `require`s them directly.
 */
const production = process.env.NODE_ENV === "production";

export default defineConfig([
  {
    input: "src/preload/index.ts",
    cache: false,
    output: { file: "out/preload/index.js", format: "cjs", sourcemap: !production },
    external: ["electron"],
    plugins: [
      ipcBridge({
        ipcDir: "./src/main/ipc",
        outFile: "./src/preload/generated/ipc-bridge.ts",
        tsconfig: "./tsconfig.node.json",
      }),
      json(),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.node.json",
        compilerOptions: { sourceMap: !production },
      }),
      production && terser(),
    ],
  },
  {
    input: "src/main/index.ts",
    cache: false,
    watch: { clearScreen: false },
    output: { file: "out/main/index.js", format: "cjs", sourcemap: !production },
    external: ["electron", /^node:/],
    plugins: [
      json(),
      nodeResolve({ exportConditions: ["node"] }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.node.json",
        compilerOptions: { sourceMap: !production },
      }),
      replace({ preventAssignment: true, __ELECTRON_DEV__: JSON.stringify(!production) }),
      production && terser(),
      process.env.ROLLUP_WATCH &&
        electronRun({
          entry: "index.js",
          electronPath: createRequire(import.meta.url)("electron"),
          additionalArgs: ["--inspect"],
          stdinControls: false,
        }),
    ],
  },
]);
