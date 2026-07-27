import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  buildProjectToDisk,
  bundleContainsAbsolutePaths,
  bundleModuleSource,
  hashContent,
  loadProject,
  requireProject,
} from "../packages/build-tools/dist/index.js";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultStudioRoot = path.resolve(coreRoot, "../.worktrees/mmx-studio-assets-08");
const studioRoot = path.resolve(process.env.MMX_STUDIO_ROOT ?? defaultStudioRoot);
const e2eRoot = path.resolve(
  process.env.MMX_E2E_ROOT ?? path.join(os.tmpdir(), "mmx-cross-repo-e2e"),
);

const forbiddenPathFragments = ["Orgs/", "mmx-studio", "mmx-core-ts", ".worktrees"];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? coreRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error([command, ...args, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

async function walkFiles(root) {
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(absolute);
    }
  }
  await visit(root);
  return files;
}

function assertNoForbiddenPaths(source, label, options = {}) {
  if (options.checkDriveLetters !== false) {
    assert.equal(bundleContainsAbsolutePaths(source), false, `${label} leaked absolute paths`);
  }
  for (const fragment of forbiddenPathFragments) {
    assert.equal(source.includes(fragment), false, `${label} leaked '${fragment}'`);
  }
}

async function prepareStudioExport(exportDir) {
  await rm(exportDir, { recursive: true, force: true });
  await mkdir(exportDir, { recursive: true });
  const output = run(
    "node",
    ["scripts/cross-repo-prepare.mjs", "--scenario", "clean", "--out", exportDir],
    { cwd: studioRoot },
  );
  const payload = JSON.parse(output);
  assert.equal(payload.ok, true);
  assert.ok(payload.exportedDataFiles.includes("game/data.json"));
  return payload;
}

async function buildExport(exportDir, outDir) {
  await rm(outDir, { recursive: true, force: true });
  const cli = path.join(coreRoot, "packages/build-tools/dist/cli/mmx-build.js");
  run(process.execPath, [cli, "build", "--project", exportDir, "--out", outDir]);
  const bundle = JSON.parse(await readFile(path.join(outDir, "project-bundle.json"), "utf8"));
  return bundle;
}

async function waitForPort(port, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const reachable = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (reachable) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for port ${port}.`);
}

async function withDevServer(exportDir, runTest) {
  const cli = path.join(coreRoot, "packages/build-tools/dist/cli/mmx-build.js");
  const child = spawn(process.execPath, [cli, "dev", "--project", exportDir], {
    cwd: coreRoot,
    stdio: "ignore",
    detached: process.platform !== "win32",
    windowsHide: true,
  });

  try {
    await waitForPort(5173);
    await runTest();
  } finally {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/f", "/t"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  }
}

test("cross-repo: clean starter export builds and boots", async (t) => {
  const exportDir = path.join(e2eRoot, "clean-export");
  const buildDir = path.join(e2eRoot, "clean-build");
  const prepared = await prepareStudioExport(exportDir);
  const bundle = await buildExport(exportDir, buildDir);

  assert.equal(bundle.meta.id, "e2e.demo");
  assert.equal(bundle.meta.entryLevelId, prepared.entryLevelId);
  assert.ok(bundle.rendererManifest);
  assert.ok(bundle.assetUrls["sprite.hud.x-bar"]);
  assert.ok(bundle.assetUrls["sfx.player.jump"]);
  assert.ok(bundle.soundBindings);
  assert.equal(bundle.soundBindings.jump, "sfx.player.jump");
  assert.ok(bundle.soundIds.includes("sfx.player.jump"));
  assert.equal(bundle.soundIds.includes("jump"), false);
  assertNoForbiddenPaths(bundleModuleSource(bundle), "project bundle");

  await t.test("browser boot via factory dev", async (browserTest) => {
    let playwright;
    try {
      playwright = await import("playwright");
    } catch (error) {
      if (process.env.MMX_ALLOW_BROWSER_SKIP === "1") {
        browserTest.skip("playwright is not installed (MMX_ALLOW_BROWSER_SKIP=1)");
        return;
      }
      throw new Error(
        "playwright is required for browser boot; install it or set MMX_ALLOW_BROWSER_SKIP=1",
        { cause: error },
      );
    }

    await withDevServer(exportDir, async () => {
      const browser = await playwright.chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(error.message));

        await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle", timeout: 120_000 });
        await page.waitForSelector("#game", { timeout: 120_000 });
        await page.waitForFunction(() => window.mmx != null, undefined, { timeout: 120_000 });

        const audioRejected = errors.some(
          (message) =>
            message.includes("SoundAssetError") ||
            message.includes("Sound asset") ||
            message.includes("is not in the project bundle"),
        );
        assert.equal(audioRejected, false, `audio preload rejected:\n${errors.join("\n")}`);

        const canvasWidth = await page.$eval("#game", (canvas) => canvas.width);
        assert.ok(canvasWidth > 0);
        assert.ok(
          errors.every(
            (message) =>
              !message.includes("asset.missing") &&
              !message.includes("mmx-studio") &&
              !message.includes("Orgs/"),
          ),
          errors.join("\n"),
        );
      } finally {
        await browser.close();
      }
    });
  });
});

test("cross-repo: missing asset fails before bundling with logical ID", async () => {
  const exportDir = path.join(e2eRoot, "missing-source");
  const brokenDir = path.join(e2eRoot, "missing-broken");
  await prepareStudioExport(exportDir);
  await rm(brokenDir, { recursive: true, force: true });
  await mkdir(brokenDir, { recursive: true });
  for (const file of await walkFiles(exportDir)) {
    const relative = path.relative(exportDir, file);
    const target = path.join(brokenDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file, target);
  }

  const manifest = JSON.parse(await readFile(path.join(brokenDir, "project.json"), "utf8"));
  const missing = manifest.assets.find((asset) => asset.id === "sprite.hud.x-bar");
  assert.ok(missing);
  await rm(path.join(brokenDir, missing.path), { force: true });

  const result = await loadProject(brokenDir);
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "asset.missing" && issue.message.includes("sprite.hud.x-bar"),
    ),
  );
});

test("cross-repo: wrong asset kind fails validation", async () => {
  const exportDir = path.join(e2eRoot, "wrong-kind-source");
  const brokenDir = path.join(e2eRoot, "wrong-kind-broken");
  await prepareStudioExport(exportDir);
  await rm(brokenDir, { recursive: true, force: true });
  await mkdir(brokenDir, { recursive: true });
  for (const file of await walkFiles(exportDir)) {
    const relative = path.relative(exportDir, file);
    const target = path.join(brokenDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file, target);
  }

  const manifestPath = path.join(brokenDir, "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.assets = manifest.assets.map((asset) =>
    asset.id === "sfx.player.jump" ? { ...asset, kind: "texture" } : asset,
  );
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result = await loadProject(brokenDir);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "asset.kind"));
});

test("cross-repo: traversal paths are rejected", async () => {
  const exportDir = path.join(e2eRoot, "traversal-source");
  const brokenDir = path.join(e2eRoot, "traversal-broken");
  await prepareStudioExport(exportDir);
  await rm(brokenDir, { recursive: true, force: true });
  await mkdir(brokenDir, { recursive: true });
  for (const file of await walkFiles(exportDir)) {
    const relative = path.relative(exportDir, file);
    const target = path.join(brokenDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file, target);
  }

  const manifestPath = path.join(brokenDir, "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.assets = manifest.assets.map((asset) =>
    asset.id === "sprite.hud.x-bar" ? { ...asset, path: "../outside.png" } : asset,
  );
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result = await loadProject(brokenDir);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "path.traversal"));
});

test("cross-repo: asset content change produces a new content hash", async () => {
  const exportDir = path.join(e2eRoot, "hash-export");
  await prepareStudioExport(exportDir);
  const project = await requireProject(exportDir);
  const first = await buildProjectToDisk(project, path.join(e2eRoot, "hash-a"));
  const targetAsset = first.emission.assets.find((asset) => asset.assetId === "sprite.hud.x-bar");
  assert.ok(targetAsset);

  const assetPath = path.join(exportDir, "assets/sprites/hud/x_bar.png");
  const bytes = await readFile(assetPath);
  assert.equal(targetAsset.contentHash, hashContent(new Uint8Array(bytes)));

  await writeFile(assetPath, Buffer.concat([bytes, Buffer.from([0])]));
  const changed = await buildProjectToDisk(project, path.join(e2eRoot, "hash-b"));
  const changedAsset = changed.emission.assets.find(
    (asset) => asset.assetId === "sprite.hud.x-bar",
  );
  assert.ok(changedAsset);
  assert.notEqual(changedAsset.contentHash, targetAsset.contentHash);
});

test("cross-repo: repeated unchanged builds are deterministic", async () => {
  const exportDir = path.join(e2eRoot, "deterministic-export");
  await prepareStudioExport(exportDir);
  const project = await requireProject(exportDir);
  const reportA = await buildProjectToDisk(project, path.join(e2eRoot, "deterministic-a"));
  const reportB = await buildProjectToDisk(project, path.join(e2eRoot, "deterministic-b"));

  assert.deepEqual(
    reportA.emission.assets.map((asset) => asset.contentHash),
    reportB.emission.assets.map((asset) => asset.contentHash),
  );
  assert.deepEqual(
    reportA.emission.assets.map((asset) => asset.fileName),
    reportB.emission.assets.map((asset) => asset.fileName),
  );
});

test("cross-repo: final browser bundle has no source worktree paths", async () => {
  const exportDir = path.join(e2eRoot, "bundle-export");
  await prepareStudioExport(exportDir);
  const webRoot = path.join(coreRoot, "apps/web");
  const distDir = path.join(e2eRoot, "web-dist");
  await rm(distDir, { recursive: true, force: true });

  run("pnpm", ["exec", "vite", "build", "--outDir", distDir], {
    cwd: webRoot,
    env: { ...process.env, MMX_PROJECT: exportDir },
  });

  const files = await walkFiles(distDir);
  assert.ok(files.length > 0);
  for (const file of files) {
    if (!file.endsWith(".js") && !file.endsWith(".json")) continue;
    assertNoForbiddenPaths(await readFile(file, "utf8"), file, { checkDriveLetters: false });
  }
});
