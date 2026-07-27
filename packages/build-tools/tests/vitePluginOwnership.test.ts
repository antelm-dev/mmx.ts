import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { resolveConfig, createServer } from "vite";
import {
  MMX_PROJECT_PLUGIN_NAME,
  countMmxProjectPlugins,
  createMmxProjectPluginsFromEnv,
  createMmxWebDevInlineConfig,
  defaultMmxProjectEmitDir,
  mmxProjectPlugin,
  mmxProjectPluginOptionsFromDir,
} from "../src/vite/plugin.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const syntheticProject = path.join(fixturesDir, "synthetic-project");
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.resolve(packageRoot, "../../apps/web");

test("mmxProjectPluginOptionsFromDir preserves project and emit directories", () => {
  const options = mmxProjectPluginOptionsFromDir(syntheticProject);
  assert.equal(options.projectDir, path.resolve(syntheticProject));
  assert.equal(options.emitDir, defaultMmxProjectEmitDir(syntheticProject));
  assert.equal(options.emitDir, path.join(path.resolve(syntheticProject), ".mmx-assets"));
});

test("createMmxProjectPluginsFromEnv returns exactly one plugin", () => {
  const withoutProject = createMmxProjectPluginsFromEnv({});
  assert.equal(countMmxProjectPlugins(withoutProject), 1);
  assert.equal(withoutProject[0]?.name, MMX_PROJECT_PLUGIN_NAME);

  const withProject = createMmxProjectPluginsFromEnv({ MMX_PROJECT: syntheticProject });
  assert.equal(countMmxProjectPlugins(withProject), 1);
  assert.equal(withProject[0]?.name, MMX_PROJECT_PLUGIN_NAME);
});

test("createMmxWebDevInlineConfig does not register the project plugin", () => {
  const inline = createMmxWebDevInlineConfig({ webRoot });
  assert.equal(inline.plugins, undefined);
  assert.equal(inline.configFile, path.join(webRoot, "vite.config.ts"));
  assert.equal(inline.root, webRoot);
});

test("resolved vite config with env-owned plugins has exactly one mmx-project plugin", async () => {
  const plugins = createMmxProjectPluginsFromEnv({ MMX_PROJECT: syntheticProject });
  const inline = createMmxWebDevInlineConfig({ webRoot });
  const config = await resolveConfig(
    {
      ...inline,
      configFile: false,
      plugins,
    },
    "serve",
  );
  assert.equal(countMmxProjectPlugins(config.plugins), 1);
});

test("merging env-owned plugin with an explicit plugin is rejected", async () => {
  const options = mmxProjectPluginOptionsFromDir(syntheticProject);
  const envPlugins = createMmxProjectPluginsFromEnv({ MMX_PROJECT: syntheticProject });
  await assert.rejects(
    () =>
      resolveConfig(
        {
          configFile: false,
          plugins: [...envPlugins, mmxProjectPlugin(options)],
        },
        "serve",
      ),
    /mmx-project plugin registered 2 times/,
  );
});

test("single plugin registration runs buildStart and onBundle once", async () => {
  let bundles = 0;
  const emitDir = path.join(os.tmpdir(), `mmx-plugin-emit-${process.pid}`);
  const plugin = mmxProjectPlugin({
    projectDir: path.resolve(syntheticProject),
    emitDir,
    onBundle: () => {
      bundles += 1;
    },
  });
  const server = await createServer({
    configFile: false,
    root: webRoot,
    plugins: [plugin],
    server: { middlewareMode: true },
  });
  try {
    assert.equal(bundles, 1);
    assert.equal(countMmxProjectPlugins(server.config.plugins), 1);
  } finally {
    await server.close();
    await fs.rm(emitDir, { recursive: true, force: true });
  }
});
test("duplicate explicit plugins are rejected before server start", async () => {
  const options = mmxProjectPluginOptionsFromDir(syntheticProject);
  await assert.rejects(
    () =>
      createServer({
        configFile: false,
        root: webRoot,
        plugins: [mmxProjectPlugin(options), mmxProjectPlugin(options)],
        server: { middlewareMode: true },
      }),
    /mmx-project plugin registered 2 times/,
  );
});