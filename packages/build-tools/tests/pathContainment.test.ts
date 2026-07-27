import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Connect, ViteDevServer } from "vite";
import {
  emitAssetsToDirectory,
  planAssetEmission,
  compileBrowserProjectBundle,
  bundleModuleSource,
  bundleContainsAbsolutePaths,
} from "../src/compileProject.js";
import { readLevelDocument } from "../src/compileLevel.js";
import { ProjectBuildError, ProjectLoadError } from "../src/errors.js";
import { loadProject, requireProject } from "../src/loadProject.js";
import { resolveProjectPath } from "../src/paths.js";
import { mmxProjectPlugin } from "../src/vite/plugin.js";
import {
  cloneSyntheticProject,
  createJunction,
  messageLeaksFilesystemPath,
  tryCreateSymlink,
  writeManifest,
} from "./pathContainmentSupport.js";

type Middleware = Connect.NextHandleFunction;

async function withTempProject<T>(
  run: (paths: { parent: string; root: string; outside: string }) => Promise<T>,
): Promise<T> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-contain-"));
  const root = path.join(parent, "project");
  const outside = path.join(parent, "outside");
  await fs.mkdir(outside, { recursive: true });
  await cloneSyntheticProject(root);
  try {
    return await run({ parent, root, outside });
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
}

async function installAssetMiddleware(projectDir: string, emitDir: string): Promise<Middleware> {
  const plugin = mmxProjectPlugin({ projectDir, emitDir });
  const buildStart = plugin.buildStart;
  assert.ok(buildStart);
  await buildStart.call({} as never);

  let middleware: Middleware | undefined;
  const server = {
    config: {
      plugins: [plugin],
    },
    watcher: {
      add() {},
      on() {},
    },
    middlewares: {
      use(fn: Middleware) {
        middleware = fn;
      },
    },
  } as unknown as ViteDevServer;
  const configureServer = plugin.configureServer;
  assert.ok(configureServer);
  configureServer.call({} as never, server);
  assert.ok(middleware);
  return middleware;
}

function invokeMiddleware(
  middleware: Middleware,
  url: string,
): Promise<{ statusCode: number; body: string; nextCalled: boolean }> {
  return new Promise((resolve, reject) => {
    let nextCalled = false;
    let settled = false;
    const finish = (statusCode: number, body: string) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode, body, nextCalled });
    };
    const res = {
      statusCode: 200,
      setHeader() {},
      end(chunk?: unknown) {
        finish(this.statusCode, typeof chunk === "string" ? chunk : String(chunk ?? ""));
      },
    } as unknown as http.ServerResponse;
    try {
      middleware({ url } as Connect.IncomingMessage, res, () => {
        nextCalled = true;
        finish(res.statusCode, "next");
      });
    } catch (error) {
      reject(error);
    }
  });
}

test("lexical traversal is still rejected by resolveProjectPath", () => {
  assert.throws(
    () => resolveProjectPath(path.join(path.sep, "proj"), "../outside.json"),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
});

test("loadProject rejects a file symlink that points outside the project", async (t) => {
  await withTempProject(async ({ root, outside }) => {
    const secret = path.join(outside, "secret.png");
    await fs.writeFile(secret, Buffer.from([1, 2, 3, 4]));
    const linkPath = path.join(root, "assets", "sprites", "escape.png");
    const capability = await tryCreateSymlink(secret, linkPath, "file");
    if (capability === "unsupported") {
      t.skip(
        "File symlink creation requires elevated privileges on this Windows host; junction coverage still runs.",
      );
      return;
    }

    await writeManifest(root, (manifest) => {
      manifest.assets = [
        { id: "sprite.escape", kind: "sprite", path: "assets/sprites/escape.png" },
      ];
    });

    const result = await loadProject(root);
    assert.equal(result.ok, false);
    const issue = result.issues.find((entry) => entry.code === "path.traversal");
    assert.ok(issue);
    assert.equal(messageLeaksFilesystemPath(issue.message, root, outside), false);
  });
});

test("loadProject rejects a directory junction that points outside the project", async () => {
  await withTempProject(async ({ root, outside }) => {
    await fs.writeFile(path.join(outside, "bg.png"), Buffer.from([137, 80, 78, 71]));
    const linkDir = path.join(root, "assets", "escaped");
    await createJunction(outside, linkDir);

    await writeManifest(root, (manifest) => {
      manifest.assets = [
        { id: "sprite.escape", kind: "sprite", path: "assets/escaped/bg.png" },
      ];
    });

    const result = await loadProject(root);
    assert.equal(result.ok, false);
    const issue = result.issues.find((entry) => entry.code === "path.traversal");
    assert.ok(issue);
    assert.equal(messageLeaksFilesystemPath(issue.message, root, outside), false);
  });
});

test("loadProject accepts an internal junction whose real target stays inside the root", async () => {
  await withTempProject(async ({ root }) => {
    const alias = path.join(root, "assets", "alias");
    await createJunction(path.join(root, "assets", "sprites"), alias);

    await writeManifest(root, (manifest) => {
      manifest.assets = [{ id: "sprite.bg", kind: "sprite", path: "assets/alias/bg.png" }];
    });

    const result = await loadProject(root);
    assert.equal(result.ok, true);
  });
});

test("loadProject keeps asset.missing for ordinary missing files", async () => {
  await withTempProject(async ({ root }) => {
    await writeManifest(root, (manifest) => {
      manifest.assets = [
        { id: "sprite.missing", kind: "sprite", path: "assets/sprites/missing.png" },
      ];
    });

    const result = await loadProject(root);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "asset.missing"));
    assert.equal(
      result.issues.some((issue) => issue.code === "path.traversal"),
      false,
    );
  });
});

test("loadProject keeps level.missing for ordinary missing levels", async () => {
  await withTempProject(async ({ root }) => {
    await writeManifest(root, (manifest) => {
      manifest.levels = [{ id: "level.main", path: "levels/missing.json" }];
    });

    const result = await loadProject(root);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "level.missing"));
    assert.equal(
      result.issues.some((issue) => issue.code === "path.traversal"),
      false,
    );
  });
});

test("readLevelDocument rejects levels reached through an outside junction", async () => {
  await withTempProject(async ({ root, outside }) => {
    const level = JSON.parse(
      await fs.readFile(path.join(root, "levels", "level.main.json"), "utf8"),
    );
    await fs.writeFile(path.join(outside, "level.main.json"), JSON.stringify(level), "utf8");
    const linkDir = path.join(root, "levels-link");
    await createJunction(outside, linkDir);

    await assert.rejects(
      () =>
        readLevelDocument(root, "levels-link/level.main.json", (absolute) =>
          fs.readFile(absolute, "utf8"),
        ),
      (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
    );
  });
});

test("planAssetEmission rejects hashing assets that escape through a junction", async () => {
  await withTempProject(async ({ root, outside }) => {
    await fs.writeFile(path.join(outside, "bg.png"), Buffer.from([9, 9, 9, 9]));
    await createJunction(outside, path.join(root, "assets", "escaped"));
    await writeManifest(root, (manifest) => {
      manifest.assets = [
        { id: "sprite.escape", kind: "sprite", path: "assets/escaped/bg.png" },
      ];
    });

    const loaded = await loadProject(root);
    if (!loaded.ok) {
      assert.ok(loaded.issues.some((issue) => issue.code === "path.traversal"));
      return;
    }

    await assert.rejects(
      () => planAssetEmission(loaded.value),
      (error: unknown) =>
        (error instanceof ProjectLoadError && error.code === "path.traversal") ||
        (error instanceof ProjectBuildError && error.code === "path.traversal"),
    );
  });
});

test("emitAssetsToDirectory rejects copying assets that escape through a junction", async () => {
  await withTempProject(async ({ root, outside, parent }) => {
    await fs.writeFile(path.join(outside, "bg.png"), Buffer.from([9, 9, 9, 9]));
    await createJunction(outside, path.join(root, "assets", "escaped"));

    const project = await requireProject(
      await (async () => {
        const safe = path.join(parent, "safe-project");
        await cloneSyntheticProject(safe);
        return safe;
      })(),
    );

    const emission = await planAssetEmission(project);
    const poisoned = {
      ...project,
      root,
      manifest: {
        ...project.manifest,
        assets: [
          {
            id: "sprite.bg",
            kind: "sprite" as const,
            path: "assets/escaped/bg.png",
          },
        ],
      },
    };
    const poisonedEmission = {
      ...emission,
      assets: emission.assets.map((asset) =>
        asset.assetId === "sprite.bg"
          ? { ...asset, logicalPath: "assets/escaped/bg.png" }
          : asset,
      ),
    };

    const outDir = path.join(parent, "out");
    await assert.rejects(
      () => emitAssetsToDirectory(poisoned, poisonedEmission, outDir),
      (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
    );
  });
});

test("optional game data reached through an outside junction is rejected", async () => {
  await withTempProject(async ({ root, outside }) => {
    await fs.mkdir(path.join(outside, "data"), { recursive: true });
    await fs.writeFile(
      path.join(outside, "data", "game.json"),
      JSON.stringify({
        version: 1,
        gravity: 0.3,
        entities: {},
      }),
      "utf8",
    );
    await createJunction(path.join(outside, "data"), path.join(root, "data"));

    const project = await requireProject(root);
    const emission = await planAssetEmission(project);
    await assert.rejects(
      () => compileBrowserProjectBundle(project, emission),
      (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
    );
  });
});

test("dev middleware refuses to serve an emitted asset file symlink that points outside", async (t) => {
  await withTempProject(async ({ root, outside, parent }) => {
    const emitDir = path.join(parent, "emit");
    const middleware = await installAssetMiddleware(root, emitDir);
    const assetsDir = path.join(emitDir, "assets");
    const files = await fs.readdir(assetsDir);
    const fileName = files.find((name) => name.endsWith(".png"));
    assert.ok(fileName);

    const secret = path.join(outside, "leak.bin");
    await fs.writeFile(secret, Buffer.from("OUTSIDE"));
    await fs.rm(path.join(assetsDir, fileName));
    const capability = await tryCreateSymlink(secret, path.join(assetsDir, fileName), "file");
    if (capability === "unsupported") {
      t.skip(
        "File symlink creation requires elevated privileges on this Windows host; junction coverage still runs.",
      );
      return;
    }

    const result = await invokeMiddleware(middleware, `/assets/${fileName}`);
    assert.equal(result.statusCode, 400);
    assert.equal(result.nextCalled, false);
    assert.equal(result.body, "Bad Request");
    assert.equal(messageLeaksFilesystemPath(result.body, root, outside, emitDir), false);
  });
});

test("loadProject rejects a directory symlink that points outside the project", async (t) => {
  await withTempProject(async ({ root, outside }) => {
    await fs.writeFile(path.join(outside, "bg.png"), Buffer.from([137, 80, 78, 71]));
    const linkDir = path.join(root, "assets", "escaped-dir");
    const capability = await tryCreateSymlink(outside, linkDir, "dir");
    if (capability === "unsupported") {
      t.skip(
        "Directory symlink creation requires elevated privileges on this Windows host; junction coverage still runs.",
      );
      return;
    }

    await writeManifest(root, (manifest) => {
      manifest.assets = [
        { id: "sprite.escape", kind: "sprite", path: "assets/escaped-dir/bg.png" },
      ];
    });

    const result = await loadProject(root);
    assert.equal(result.ok, false);
    const issue = result.issues.find((entry) => entry.code === "path.traversal");
    assert.ok(issue);
    assert.equal(messageLeaksFilesystemPath(issue.message, root, outside), false);
  });
});

test("browser bundle still omits absolute filesystem paths after containment checks", async () => {
  await withTempProject(async ({ root }) => {
    const alias = path.join(root, "assets", "alias");
    await createJunction(path.join(root, "assets", "sprites"), alias);
    await writeManifest(root, (manifest) => {
      const assets = (manifest.assets as Array<Record<string, unknown>>).map((asset) =>
        asset.id === "sprite.bg" ? { ...asset, path: "assets/alias/bg.png" } : asset,
      );
      manifest.assets = assets;
    });

    const project = await requireProject(root);
    const emission = await planAssetEmission(project);
    const bundle = await compileBrowserProjectBundle(project, emission);
    const source = bundleModuleSource(bundle);
    assert.equal(bundleContainsAbsolutePaths(source), false);
    assert.equal(source.includes(root), false);
  });
});
