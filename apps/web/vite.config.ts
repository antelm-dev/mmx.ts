import { defineConfig, type PluginOption } from "vite";
import {
  assertWebProductionProjectAvailable,
  resolveWebProjectPluginMode,
} from "./src/project/webBuildContract.js";

const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const projectDir = process.env.MMX_PROJECT;

async function projectPlugins(command: "build" | "serve"): Promise<PluginOption[]> {
  assertWebProductionProjectAvailable({ command, projectDir });
  const { createMmxProjectPluginsFromEnv } = await import("@mmx/build-tools/vite");
  return createMmxProjectPluginsFromEnv();
}

export default defineConfig(async ({ command }) => ({
  clearScreen: false,
  plugins: await projectPlugins(command),
  define:
    resolveWebProjectPluginMode({ command, projectDir }) === "load-project"
      ? { "import.meta.env.VITE_MMX_PROJECT": JSON.stringify("1") }
      : undefined,
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
}));
