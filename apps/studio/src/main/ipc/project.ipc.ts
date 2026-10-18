import { readFile, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { app, dialog } from "electron";
import { defineIpcModule, handle } from "electron-ipc-module";
import type { AssetKind } from "@mmx/project-schema";
import {
  createProject,
  exportProject,
  GAME_DATA_FILE,
  issue,
  importAsset,
  loadProject,
  mergeImportedAsset,
  saveProject,
  type CreateProjectInput,
  type ProjectIssue,
  type ProjectPayload,
  type ProjectResult,
  type StudioProject,
} from "@mmx/project-io";
import { createNodeFileSystem } from "@mmx/project-io/node";
import {
  copyStarterProjectToDirectory,
  installPack,
  seedStarterGameData,
} from "@mmx/starter-template";
import {
  deleteWorkProject,
  destinationPick,
  listWorkProjects,
  moveWorkProject,
  newWorkRoot,
  WORK_PROJECTS_DIR,
  type WorkProject,
} from "../workProjects.js";

const DATA_URL_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createProjectIpc() {
  // Only a file the user just picked may be copied in from outside the project.
  let pickedImportPath: string | null = null;
  // Likewise, an unsaved project only moves to the folder the user just picked for it.
  const pickedDestination = destinationPick();
  // Computed here, never taken from the renderer.
  const workBase = () => join(app.getPath("userData"), WORK_PROJECTS_DIR);

  return defineIpcModule("project", {
    "pick-directory": handle(async (_event, title: string): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title,
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    }),

    "pick-export-directory": handle(async (_event, title: string): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title,
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    }),

    "pick-import-file": handle(
      async (
        _event,
        filters: { name: string; extensions: string[] }[],
      ): Promise<{ path: string; name: string } | null> => {
        const result = await dialog.showOpenDialog({
          title: "Import Asset",
          properties: ["openFile"],
          filters,
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        const path = result.filePaths[0]!;
        pickedImportPath = path;
        return { path, name: basename(path) };
      },
    ),

    create: handle(
      async (
        _event,
        rootPath: string,
        input: { id: string; name: string },
      ): Promise<ProjectResult<ProjectPayload>> => {
        const fs = createNodeFileSystem(rootPath);
        const created = await createProject(fs, input);
        if (!created.ok) return { ok: false, issues: created.issues };
        return {
          ok: true,
          value: { rootPath, project: created.value },
          issues: created.issues,
        };
      },
    ),

    "create-from-starter": handle(
      async (
        _event,
        rootPath: string,
        input: { id: string; name: string },
      ): Promise<ProjectResult<ProjectPayload>> => {
        const created = await copyStarterProjectToDirectory(rootPath, input);
        if (!created.ok) return { ok: false, issues: created.issues };
        return {
          ok: true,
          value: { rootPath, project: created.value },
          issues: created.issues,
        };
      },
    ),

    /** An untitled project in Studio's work folder whose entry level is `initialLevel`. */
    "create-work-project": handle(
      async (
        _event,
        // Through project-io: the bridge generator cannot reference external package types.
        input: Required<Pick<CreateProjectInput, "name" | "initialLevel">>,
      ): Promise<ProjectResult<ProjectPayload>> => {
        let rootPath: string | null = null;
        try {
          rootPath = await newWorkRoot(workBase());
          const created = await createProject(createNodeFileSystem(rootPath), {
            id: "untitled.project",
            name: input.name,
            initialLevel: input.initialLevel,
          });
          if (!created.ok) throw new Error(created.issues[0]?.message ?? "Create failed.");
          return { ok: true, value: { rootPath, project: created.value }, issues: created.issues };
        } catch (error) {
          if (rootPath) await rm(rootPath, { recursive: true, force: true }).catch(() => undefined);
          return { ok: false, issues: [issue("work-project.create", errorMessage(error), "/")] };
        }
      },
    ),

    "list-work-projects": handle(async (): Promise<WorkProject[]> => listWorkProjects(workBase())),

    "pick-work-destination": handle(
      async (_event, title: string, workRoot: string): Promise<string | null> => {
        pickedDestination.set(null);
        const result = await dialog.showOpenDialog({
          title,
          properties: ["openDirectory", "createDirectory"],
        });
        const destination = result.canceled ? undefined : result.filePaths[0];
        if (!destination) return null;
        pickedDestination.set({ destination, workRoot });
        return destination;
      },
    ),

    /** Move an unsaved project to the folder just picked (empty or absent); returns its new root. */
    "move-work-project": handle(
      async (
        _event,
        input: { workRoot: string; destination: string },
      ): Promise<ProjectResult<{ rootPath: string }>> => {
        if (!pickedDestination.take(input.destination, input.workRoot)) {
          return {
            ok: false,
            issues: [issue("work-project.destination", "Pick the folder first.", "/destination")],
          };
        }
        try {
          const moved = await moveWorkProject(workBase(), input.workRoot, input.destination);
          const issues = moved.warning
            ? [issue("work-project.cleanup", moved.warning, "/", "warning")]
            : [];
          return { ok: true, value: { rootPath: moved.rootPath }, issues };
        } catch (error) {
          return { ok: false, issues: [issue("work-project.move", errorMessage(error), "/")] };
        }
      },
    ),

    "delete-work-project": handle(
      async (_event, workRoot: string): Promise<ProjectResult<null>> => {
        try {
          await deleteWorkProject(workBase(), workRoot);
          return { ok: true, value: null, issues: [] };
        } catch (error) {
          return { ok: false, issues: [issue("work-project.delete", errorMessage(error), "/")] };
        }
      },
    ),

    load: handle(async (_event, rootPath: string): Promise<ProjectResult<ProjectPayload>> => {
      const fs = createNodeFileSystem(rootPath);
      const loaded = await loadProject(fs);
      if (!loaded.ok) return { ok: false, issues: loaded.issues };
      return {
        ok: true,
        value: { rootPath, project: loaded.value },
        issues: loaded.issues,
      };
    }),

    /**
     * Reads what Play and the viewport need from an open project: `game/data.json`
     * and every image/sound asset as a data URL. Data URLs keep absolute paths out
     * of the renderer, and identical bytes give identical URLs, so sheets shared
     * with the bundled starter do not clash in the renderer's sheet cache.
     */
    "read-play-assets": handle(
      async (
        _event,
        rootPath: string,
        // Inline shape: the bridge generator cannot reference external package types.
        assets: { id: string; kind: string; path: string }[],
      ): Promise<ProjectResult<{ gameData: unknown; urls: Record<string, string> }>> => {
        const fs = createNodeFileSystem(rootPath);
        const issues: ProjectIssue[] = [];
        // Absent in a new project: null, not an issue (the renderer falls back to the starter).
        let gameData: unknown = null;
        try {
          if (await fs.exists(GAME_DATA_FILE))
            gameData = JSON.parse(await fs.readText(GAME_DATA_FILE));
        } catch (error) {
          issues.push(
            issue("play-assets.game-data", errorMessage(error), `/${GAME_DATA_FILE}`, "warning"),
          );
        }
        const urls: Record<string, string> = {};
        for (const [index, asset] of assets.entries()) {
          if (!["image", "sprite", "sound", "tileset"].includes(asset.kind)) continue;
          const mime = DATA_URL_MIME[extname(asset.path).toLowerCase()];
          try {
            if (!mime) throw new Error(`Unsupported file type '${asset.path}'.`);
            const bytes = await fs.readBytes(asset.path);
            urls[asset.id] = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
          } catch (error) {
            issues.push(
              issue("play-assets.file", errorMessage(error), `/assets/${index}/path`, "warning"),
            );
          }
        }
        return { ok: true, value: { gameData, urls }, issues };
      },
    ),

    save: handle(
      async (
        _event,
        rootPath: string,
        project: StudioProject,
      ): Promise<ProjectResult<ProjectPayload>> => {
        const fs = createNodeFileSystem(rootPath);
        const saved = await saveProject(fs, project);
        if (!saved.ok) return { ok: false, issues: saved.issues };
        return {
          ok: true,
          value: { rootPath, project: saved.value },
          issues: saved.issues,
        };
      },
    ),

    /**
     * Sets `bindings.playerAnimation` in `game/data.json`, keeping every other key. A project
     * without one gets the starter's, with the starter assets it binds: the project then comes
     * back reloaded in `value` (null otherwise).
     */
    "write-player-animation": handle(
      async (
        _event,
        rootPath: string,
        animationId: string,
      ): Promise<ProjectResult<StudioProject | null>> => {
        const fs = createNodeFileSystem(rootPath);
        try {
          // A new project has none yet: Play used the starter's until now.
          if (!(await fs.exists(GAME_DATA_FILE))) {
            return await seedStarterGameData(rootPath, animationId);
          }
          const data = JSON.parse(await fs.readText(GAME_DATA_FILE));
          data.bindings = { ...data.bindings, playerAnimation: animationId };
          await fs.writeText(GAME_DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
          return { ok: true, value: null, issues: [] };
        } catch (error) {
          return {
            ok: false,
            issues: [issue("game-data.write", errorMessage(error), `/${GAME_DATA_FILE}`)],
          };
        }
      },
    ),

    /**
     * File → Install / update MMX Starter pack…: add what the pack has and the project at
     * `rootPath` lacks, never replacing anything. With `dryRun`, nothing is written.
     */
    "install-pack": handle(
      async (
        _event,
        rootPath: string,
        dryRun: boolean,
      ): Promise<ProjectResult<{ added: string[]; skipped: string[] }>> => {
        try {
          // Emitted next to this bundle by rollup.config.mjs: the packaged app ships only out/**.
          return await installPack(rootPath, join(__dirname, "packs/mmx-starter"), dryRun);
        } catch (error) {
          return { ok: false, issues: [issue("pack.install", errorMessage(error), "/")] };
        }
      },
    ),

    export: handle(
      async (
        _event,
        sourceRoot: string,
        destinationRoot: string,
        project: StudioProject,
      ): Promise<
        ProjectResult<{
          manifestPath: string;
          exportedAssets: string[];
          exportedLevels: string[];
          excludedOrphans: string[];
        }>
      > => {
        const sourceFs = createNodeFileSystem(sourceRoot);
        const destFs = createNodeFileSystem(destinationRoot);
        const exported = await exportProject(sourceFs, destFs, project);
        if (!exported.ok) return { ok: false, issues: exported.issues };
        return { ok: true, value: exported.value, issues: exported.issues };
      },
    ),

    /**
     * Copies a file into the project and returns the manifest with the new asset.
     * Nothing else is written: the renderer marks the project dirty and the user saves.
     */
    "import-asset": handle(
      async (
        _event,
        rootPath: string,
        project: StudioProject,
        input: { sourcePath: string; kind: AssetKind; logicalId?: string },
      ): Promise<ProjectResult<{ project: StudioProject; assetId: string; copiedTo: string }>> => {
        if (input.sourcePath !== pickedImportPath) {
          return {
            ok: false,
            issues: [issue("asset.source", "Pick the file to import first.", "/sourcePath")],
          };
        }
        const projectFs = createNodeFileSystem(rootPath);
        // The project fs is root-scoped; the picked source is outside it, so read it directly.
        const fs = {
          ...projectFs,
          copyFile: async (from: string, to: string) =>
            projectFs.writeBytes(to, await readFile(from)),
        };
        const imported = await importAsset(fs, project.manifest.assets, {
          sourcePath: input.sourcePath,
          kind: input.kind,
          collision: "rename",
          logicalId: input.logicalId,
        });
        if (!imported.ok) return { ok: false, issues: imported.issues };

        let assets;
        try {
          assets = mergeImportedAsset(project.manifest.assets, imported.value.asset);
        } catch (error) {
          return {
            ok: false,
            issues: [
              {
                severity: "error",
                code: "asset.merge",
                path: "/assets",
                message: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }

        return {
          ok: true,
          value: {
            project: { ...project, manifest: { ...project.manifest, assets } },
            assetId: imported.value.asset.id,
            copiedTo: imported.value.copiedTo,
          },
          issues: imported.issues,
        };
      },
    ),
  });
}
