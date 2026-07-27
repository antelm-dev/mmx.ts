import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";

import {
  SKIP_BROWSER_E2E_ENV,
  allocatePort,
  shouldSkipBrowserE2E,
  waitForPort,
} from "./cross-repo-e2e-harness.mjs";

test("shouldSkipBrowserE2E is opt-in via MMX_SKIP_BROWSER_E2E=1", () => {
  assert.equal(shouldSkipBrowserE2E({}), false);
  assert.equal(shouldSkipBrowserE2E({ [SKIP_BROWSER_E2E_ENV]: "0" }), false);
  assert.equal(shouldSkipBrowserE2E({ [SKIP_BROWSER_E2E_ENV]: "true" }), false);
  assert.equal(shouldSkipBrowserE2E({ [SKIP_BROWSER_E2E_ENV]: "1" }), true);
});

test("allocatePort returns a free TCP port that can be bound", async () => {
  const port = await allocatePort();
  assert.equal(typeof port, "number");
  assert.ok(port > 0);

  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});

test("waitForPort includes diagnostics on timeout", async () => {
  const port = await allocatePort();
  await assert.rejects(
    () =>
      waitForPort(port, {
        timeoutMs: 200,
        pollMs: 50,
        getDiagnostics: () => "server-log-marker",
      }),
    /server-log-marker/,
  );
});
