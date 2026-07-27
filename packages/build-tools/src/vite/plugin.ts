import path from "node:path";
import type { InlineConfig, Plugin, PluginOption, ViteDevServer } from "vite";
import {
  bundleContainsAbsolutePaths,
  bundleModuleSource,
  compileBrowserProjectBundle,
  emitAssetsToDirectory,
  planAssetEmission,
} from "../compileProject.js";
import { requireProject } from "../loadProject.js";
import {
  ASSET_PUBLIC_PREFIX,
  VIRTUAL_PROJECT_MODULE,
  VIRTUAL_PROJECT_PREFIX,
} from "../constants.js";
import { resolveEmittedAssetPath } from "../paths.js";
import type { BrowserProjectBundle } from "../types.js";
import { createRebuildScheduler } from "./rebuildScheduler.js";

export const MMX_PROJECT_PLUGIN_NAME = "mmx-project";

export type MmxProjectPluginOptions = {
  projectDir: string;
  emitDir?: string;
  onBundle?: (bundle: BrowserProjectBundle) => void;
};

type PluginState = {
  bundle: BrowserProjectBundle | null;
};

function projectWatchGlobs(projectDir: string): string[] {
  return [
    path.join(projectDir, "project.json"),
    path.join(projectDir, "levels", "**/*"),
    path.join(projectDir, "assets", "**/*"),
    path.join(projectDir, "data", "**/*"),
  ];
}

function isUnderProject(projectDir: string, file: string): boolean {
  const relative = path.relative(path.resolve(projectDir), path.resolve(file));
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function defaultMmxProjectEmitDir(projectDir: string): string {
  return path.join(path.resolve(projectDir), ".mmx-assets");
}

export function mmxProjectPluginOptionsFromDir(projectDir: string): MmxProjectPluginOptions {
  const resolved = path.resolve(projectDir);
  return {
    projectDir: resolved,
    emitDir: defaultMmxProjectEmitDir(resolved),
  };
}

export function countMmxProjectPlugins(plugins: readonly PluginOption[]): number {
  let count = 0;
  for (const entry of plugins) {
    if (!entry) continue;
    if (Array.isArray(entry)) {
      count += countMmxProjectPlugins(entry);
      continue;
    }
    if (entry instanceof Promise) continue;
    if (typeof entry === "object" && "name" in entry && entry.name === MMX_PROJECT_PLUGIN_NAME) {
      count += 1;
    }
  }
  return count;
}

export function mmxProjectNullPlugin(): Plugin {
  return {
    name: MMX_PROJECT_PLUGIN_NAME,
    enforce: "pre",

    configResolved(config) {
      assertSingleMmxProjectPlugin(config.plugins);
    },

    resolveId(source) {
      if (source === VIRTUAL_PROJECT_MODULE) return VIRTUAL_PROJECT_PREFIX;
      return null;
    },

    load(id) {
      if (id !== VIRTUAL_PROJECT_PREFIX) return null;
      return "export default null;";
    },
  };
}

export function createMmxProjectPluginsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Plugin[] {
  const projectDir = env.MMX_PROJECT;
  if (!projectDir) return [mmxProjectNullPlugin()];
  return [mmxProjectPlugin(mmxProjectPluginOptionsFromDir(projectDir))];
}

export function createMmxWebDevInlineConfig(options: {
  webRoot: string;
}): InlineConfig {
  return {
    root: options.webRoot,
    configFile: path.join(options.webRoot, "vite.config.ts"),
  };
}

function assertSingleMmxProjectPlugin(plugins: readonly Plugin[]): void {
  const count = countMmxProjectPlugins(plugins);
  if (count > 1) {
    throw new Error(
      `${MMX_PROJECT_PLUGIN_NAME} plugin registered ${count} times; apps/web/vite.config.ts owns construction when MMX_PROJECT is set — do not also pass mmxProjectPlugin to createServer()`,
    );
  }
}

export function mmxProjectPlugin(options: MmxProjectPluginOptions): Plugin {
  const state: PluginState = {
    bundle: null,
  };
  const emitDir = options.emitDir ?? defaultMmxProjectEmitDir(options.projectDir);

  let server: ViteDevServer | undefined;

  async function runRebuild(): Promise<BrowserProjectBundle> {
    const project = await requireProject(options.projectDir);
    const emission = await planAssetEmission(project);
    if (options.emitDir) {
      await emitAssetsToDirectory(project, emission, options.emitDir);
    }
    const bundle = await compileBrowserProjectBundle(project, emission);
    const source = bundleModuleSource(bundle);
    if (bundleContainsAbsolutePaths(source)) {
      throw new Error("Browser project bundle contains absolute source paths.");
    }
    return bundle;
  }

  function commitBundle(bundle: BrowserProjectBundle): void {
    state.bundle = bundle;
    options.onBundle?.(bundle);
  }

  function publishBundle(bundle: BrowserProjectBundle): void {
    commitBundle(bundle);
    const mod = server?.moduleGraph.getModuleById(VIRTUAL_PROJECT_PREFIX);
    if (mod) server?.moduleGraph.invalidateModule(mod);
    server?.ws.send({ type: "full-reload" });
  }

  const scheduler = createRebuildScheduler({
    run: runRebuild,
    publish: publishBundle,
    onError(error) {
      console.error("[mmx-project]", error);
    },
  });

  return {
    name: MMX_PROJECT_PLUGIN_NAME,
    enforce: "pre",

    configResolved(config) {
      assertSingleMmxProjectPlugin(config.plugins);
    },

    async buildStart() {
      commitBundle(await runRebuild());
    },

    configureServer(devServer) {
      server = devServer;
      assertSingleMmxProjectPlugin(devServer.config.plugins);
      for (const glob of projectWatchGlobs(options.projectDir)) {
        server.watcher.add(glob);
      }
      server.watcher.on("all", (event, file) => {
        if (event !== "change" && event !== "add" && event !== "unlink") return;
        if (!isUnderProject(options.projectDir, file)) return;
        scheduler.schedule();
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(ASSET_PUBLIC_PREFIX) || !state.bundle) {
          next();
          return;
        }
        const assetsRoot = path.join(emitDir, "assets");
        let filePath: string;
        let fileName: string;
        try {
          const resolved = resolveEmittedAssetPath(
            assetsRoot,
            url.slice(ASSET_PUBLIC_PREFIX.length),
          );
          filePath = resolved.absolutePath;
          fileName = resolved.fileName;
        } catch {
          res.statusCode = 400;
          res.end("Bad Request");
          return;
        }
        import("node:fs")
          .then((fs) => fs.promises.readFile(filePath))
          .then((data) => {
            const ext = path.extname(fileName).toLowerCase();
            const type =
              ext === ".png"
                ? "image/png"
                : ext === ".wav"
                  ? "audio/wav"
                  : ext === ".json"
                    ? "application/json"
                    : "application/octet-stream";
            res.setHeader("Content-Type", type);
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.end(data);
          })
          .catch(() => {
            res.statusCode = 404;
            res.end("Not Found");
          });
      });
    },

    resolveId(source) {
      if (source === VIRTUAL_PROJECT_MODULE) return VIRTUAL_PROJECT_PREFIX;
      return null;
    },

    async load(id) {
      if (id !== VIRTUAL_PROJECT_PREFIX) return null;
      await scheduler.waitCurrent();
      if (!state.bundle) {
        commitBundle(await runRebuild());
      }
      if (!state.bundle) {
        throw new Error("Project bundle is unavailable.");
      }
      return bundleModuleSource(state.bundle);
    },
  };
}

export { VIRTUAL_PROJECT_MODULE };
export { createRebuildScheduler } from "./rebuildScheduler.js";
export type { RebuildScheduler, RebuildSchedulerOptions } from "./rebuildScheduler.js";
