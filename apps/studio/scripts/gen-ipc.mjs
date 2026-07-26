import ipcBridge from "electron-ipc-module/rollup-plugin";

/**
 * Standalone bridge generation, so `tsc` (typecheck) and the Vite renderer have
 * `src/preload/generated/ipc-bridge.ts` on disk before they run. The Rollup
 * build regenerates it too (same plugin), but those steps don't invoke Rollup.
 */
const outFile = "./src/preload/generated/ipc-bridge.ts";

const plugin = ipcBridge({
  ipcDir: "./src/main/ipc",
  outFile,
  tsconfig: "./tsconfig.node.json",
});

await plugin.buildStart.call({
  // The standalone generator does not watch files, but the Rollup hook still
  // expects the minimal plugin context used to register its watch targets.
  addWatchFile() {},
});
console.log(`[gen:ipc] wrote ${outFile}`);
