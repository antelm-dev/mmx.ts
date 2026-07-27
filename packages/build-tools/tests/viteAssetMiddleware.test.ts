import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { Connect, ViteDevServer } from "vite";
import { mmxProjectPlugin } from "../src/vite/plugin.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const syntheticProject = path.join(fixturesDir, "synthetic-project");

type Middleware = Connect.NextHandleFunction;

async function installAssetMiddleware(emitDir: string): Promise<Middleware> {
  const plugin = mmxProjectPlugin({ projectDir: syntheticProject, emitDir });
  const buildStart = plugin.buildStart;
  assert.ok(buildStart);
  await buildStart.call({} as never);

  let middleware: Middleware | undefined;
  const server = {
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

test("asset middleware serves a valid emitted filename", async () => {
  const emitDir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-emit-"));
  try {
    const middleware = await installAssetMiddleware(emitDir);
    const assetsDir = path.join(emitDir, "assets");
    const files = await fs.readdir(assetsDir);
    const fileName = files.find((name) => name.endsWith(".png"));
    assert.ok(fileName);
    const result = await invokeMiddleware(middleware, `/assets/${fileName}`);
    assert.equal(result.statusCode, 200);
    assert.equal(result.nextCalled, false);
    assert.ok(result.body.length > 0);
  } finally {
    await fs.rm(emitDir, { recursive: true, force: true });
  }
});

test("asset middleware returns 400 for traversal URLs and does not call next", async () => {
  const emitDir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-emit-"));
  try {
    const middleware = await installAssetMiddleware(emitDir);
    for (const url of [
      "/assets/../secret.png",
      "/assets/..%2fsecret.png",
      "/assets/%2e%2e%2fsecret.png",
      "/assets/..\\secret.png",
      "/assets/C:/Windows/win.ini",
    ]) {
      const result = await invokeMiddleware(middleware, url);
      assert.equal(result.statusCode, 400, url);
      assert.equal(result.nextCalled, false, url);
      assert.equal(result.body, "Bad Request", url);
      assert.equal(result.body.includes(emitDir), false, url);
    }
  } finally {
    await fs.rm(emitDir, { recursive: true, force: true });
  }
});

test("asset middleware returns 404 for missing valid filenames without calling next", async () => {
  const emitDir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-emit-"));
  try {
    const middleware = await installAssetMiddleware(emitDir);
    const result = await invokeMiddleware(middleware, "/assets/deadbeefdeadbeef.png");
    assert.equal(result.statusCode, 404);
    assert.equal(result.nextCalled, false);
    assert.equal(result.body, "Not Found");
  } finally {
    await fs.rm(emitDir, { recursive: true, force: true });
  }
});
