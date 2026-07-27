import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { build } from "vite";
import { PRODUCTION_PROJECT_REQUIRED_MESSAGE } from "../src/project/webBuildContract.ts";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const syntheticProject = path.resolve(
  webRoot,
  "../../packages/build-tools/tests/fixtures/synthetic-project",
);

async function withEnv<T>(
  patch: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("vite production build without MMX_PROJECT fails with an actionable message", async () => {
  await withEnv({ MMX_PROJECT: undefined }, async () => {
    await assert.rejects(
      () =>
        build({
          configFile: path.join(webRoot, "vite.config.ts"),
          root: webRoot,
          logLevel: "silent",
        }),
      (error: unknown) =>
        error instanceof Error && error.message.includes(PRODUCTION_PROJECT_REQUIRED_MESSAGE),
    );
  });
});

test("vite production build with MMX_PROJECT emits a non-null project bundle", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-web-dist-"));
  try {
    await withEnv({ MMX_PROJECT: syntheticProject }, async () => {
      await build({
        configFile: path.join(webRoot, "vite.config.ts"),
        root: webRoot,
        logLevel: "silent",
        build: {
          outDir,
          emptyOutDir: true,
        },
      });
    });

    const assets = await fs.readdir(path.join(outDir, "assets"));
    const jsFiles = assets.filter((name) => name.endsWith(".js"));
    assert.ok(jsFiles.length > 0, "expected bundled JS assets");

    let sawProjectId = false;
    for (const file of jsFiles) {
      const source = await fs.readFile(path.join(outDir, "assets", file), "utf8");
      if (source.includes("fixture.synthetic")) {
        sawProjectId = true;
        assert.equal(source.includes("export default null"), false);
        break;
      }
    }
    assert.equal(sawProjectId, true, "expected non-null project bundle in production output");
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
