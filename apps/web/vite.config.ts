import { defineConfig, type PluginOption } from "vite";

const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const projectDir = process.env.MMX_PROJECT;

async function projectPlugins(): Promise<PluginOption[]> {
  const { createMmxProjectPluginsFromEnv } = await import("@mmx/build-tools/vite");
  return createMmxProjectPluginsFromEnv();
}

export default defineConfig(async () => ({
  clearScreen: false,
  plugins: await projectPlugins(),
  define: projectDir ? { "import.meta.env.VITE_MMX_PROJECT": JSON.stringify("1") } : undefined,
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
