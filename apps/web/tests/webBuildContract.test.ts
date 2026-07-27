import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRODUCTION_PROJECT_REQUIRED_MESSAGE,
  assertWebProductionProjectAvailable,
  resolveWebProjectPluginMode,
} from "../src/project/webBuildContract.ts";

test("dev without project uses an explicit stub mode", () => {
  assert.equal(
    resolveWebProjectPluginMode({ command: "serve", projectDir: undefined }),
    "dev-stub",
  );
});

test("production without project is rejected at build time", () => {
  assert.equal(
    resolveWebProjectPluginMode({ command: "build", projectDir: undefined }),
    "production-required",
  );
  assert.throws(
    () => assertWebProductionProjectAvailable({ command: "build", projectDir: undefined }),
    (error: unknown) =>
      error instanceof Error && error.message === PRODUCTION_PROJECT_REQUIRED_MESSAGE,
  );
});

test("a real project directory loads the project plugin in both commands", () => {
  assert.equal(
    resolveWebProjectPluginMode({ command: "serve", projectDir: "/tmp/export" }),
    "load-project",
  );
  assert.equal(
    resolveWebProjectPluginMode({ command: "build", projectDir: "/tmp/export" }),
    "load-project",
  );
  assert.doesNotThrow(() =>
    assertWebProductionProjectAvailable({ command: "build", projectDir: "/tmp/export" }),
  );
});
