import path from "node:path";
import { defineConfig, type PluginOption } from "vite";

const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const projectDir = process.env.MMX_PROJECT;
const VIRTUAL_PROJECT_MODULE = "virtual:mmx-project";
const VIRTUAL_PROJECT_PREFIX = "\0virtual:mmx-project";

function stubProjectModule(): PluginOption {
  return {
    name: "mmx-project-stub",
    resolveId(source) {
      if (source === VIRTUAL_PROJECT_MODULE) return VIRTUAL_PROJECT_PREFIX;
    },
    load(id) {
      if (id === VIRTUAL_PROJECT_PREFIX) return "export default null;\n";
    },
  };
}

async function projectPlugins(): Promise<PluginOption[]> {
  if (!projectDir) return [stubProjectModule()];
  const { mmxProjectPlugin } = await import("@mmx/build-tools/vite");
  return [
    mmxProjectPlugin({
      projectDir: path.resolve(projectDir),
      emitDir: path.join(path.resolve(projectDir), ".mmx-assets"),
    }),
  ];
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
