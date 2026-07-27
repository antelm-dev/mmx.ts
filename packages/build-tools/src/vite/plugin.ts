import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
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

export type MmxProjectPluginOptions = {
  projectDir: string;
  emitDir?: string;
  onBundle?: (bundle: BrowserProjectBundle) => void;
};

type PluginState = {
  bundle: BrowserProjectBundle | null;
  generation: number;
  buildPromise: Promise<void> | null;
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

export function mmxProjectPlugin(options: MmxProjectPluginOptions): Plugin {
  const state: PluginState = {
    bundle: null,
    generation: 0,
    buildPromise: null,
  };

  async function rebuild(): Promise<BrowserProjectBundle> {
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
    state.bundle = bundle;
    options.onBundle?.(bundle);
    return bundle;
  }

  function scheduleRebuild(server?: ViteDevServer): void {
    state.generation += 1;
    const token = state.generation;
    state.buildPromise = rebuild()
      .then(() => {
        if (token !== state.generation) return;
        const mod = server?.moduleGraph.getModuleById(VIRTUAL_PROJECT_PREFIX);
        if (mod) server?.moduleGraph.invalidateModule(mod);
        server?.ws.send({ type: "full-reload" });
      })
      .catch((error) => {
        console.error("[mmx-project]", error);
      });
  }

  return {
    name: "mmx-project",
    enforce: "pre",

    async buildStart() {
      await rebuild();
    },

    configureServer(server) {
      for (const glob of projectWatchGlobs(options.projectDir)) {
        server.watcher.add(glob);
      }
      server.watcher.on("all", (event, file) => {
        if (event !== "change" && event !== "add" && event !== "unlink") return;
        if (!isUnderProject(options.projectDir, file)) return;
        scheduleRebuild(server);
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(ASSET_PUBLIC_PREFIX) || !state.bundle) {
          next();
          return;
        }
        const assetsRoot = path.join(
          options.emitDir ?? path.join(options.projectDir, ".mmx-assets"),
          "assets",
        );
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
      if (state.buildPromise) await state.buildPromise;
      if (!state.bundle) await rebuild();
      return bundleModuleSource(state.bundle!);
    },
  };
}

export { VIRTUAL_PROJECT_MODULE };
