import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { ProjectBuildError, ProjectLoadError } from "../src/errors.js";
import {
  assertWithinRoot,
  resolveEmittedAssetPath,
  resolveProjectPath,
} from "../src/paths.js";

const assetsRoot = path.join(path.sep, "proj", "out", "assets");
const projectRoot = path.join(path.sep, "proj", "game");

test("resolveEmittedAssetPath accepts a single emitted filename", () => {
  const resolved = resolveEmittedAssetPath(assetsRoot, "abcd1234abcd1234.png");
  assert.equal(resolved.fileName, "abcd1234abcd1234.png");
  assert.equal(resolved.absolutePath, path.resolve(assetsRoot, "abcd1234abcd1234.png"));
});

test("resolveEmittedAssetPath accepts a percent-encoded valid filename", () => {
  const resolved = resolveEmittedAssetPath(assetsRoot, "sprite%2Epng");
  assert.equal(resolved.fileName, "sprite.png");
  assert.equal(resolved.absolutePath, path.resolve(assetsRoot, "sprite.png"));
});

test("resolveEmittedAssetPath rejects POSIX traversal segments", () => {
  assert.throws(
    () => resolveEmittedAssetPath(assetsRoot, "../secret.png"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
  assert.throws(
    () => resolveEmittedAssetPath(assetsRoot, "foo/../../etc/passwd"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
});

test("resolveEmittedAssetPath rejects Windows traversal and separators", () => {
  assert.throws(
    () => resolveEmittedAssetPath(assetsRoot, "..\\secret.png"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
  assert.throws(
    () => resolveEmittedAssetPath(assetsRoot, "subdir\\file.png"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
});

test("resolveEmittedAssetPath rejects encoded traversal and separators", () => {
  for (const suffix of [
    "%2e%2e%2fsecret.png",
    "%2e%2e/%2esecret.png",
    "..%2fsecret.png",
    "%2e%2e%5csecret.png",
    "foo%2fbar.png",
    "foo%5cbar.png",
    "%00evil.png",
  ]) {
    assert.throws(
      () => resolveEmittedAssetPath(assetsRoot, suffix),
      (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
      suffix,
    );
  }
});

test("resolveEmittedAssetPath rejects absolute paths and drive prefixes", () => {
  assert.throws(
    () => resolveEmittedAssetPath(assetsRoot, "/etc/passwd"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
  assert.throws(
    () => resolveEmittedAssetPath(assetsRoot, "C:/Windows/win.ini"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
  assert.throws(
    () => resolveEmittedAssetPath(assetsRoot, "C:\\Windows\\win.ini"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
  assert.throws(
    () => resolveEmittedAssetPath(assetsRoot, "file:secret.png"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
});

test("resolveEmittedAssetPath rejects sibling-prefix escape attempts", () => {
  const siblingRoot = path.join(path.sep, "proj", "out", "assets");
  const outside = path.resolve(path.sep, "proj", "out", "assets-evil", "leak.png");
  assert.throws(
    () => assertWithinRoot(siblingRoot, outside),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
  assert.throws(
    () => resolveEmittedAssetPath(siblingRoot, "..%2fassets-evil%2fleak.png"),
    (error: unknown) => error instanceof ProjectBuildError && error.code === "asset.path",
  );
});

test("resolveEmittedAssetPath error messages omit absolute filesystem paths", () => {
  try {
    resolveEmittedAssetPath(assetsRoot, "../secret.png");
    assert.fail("expected throw");
  } catch (error) {
    assert.ok(error instanceof ProjectBuildError);
    assert.equal(error.message.includes(path.resolve(assetsRoot)), false);
    assert.equal(error.message.includes(assetsRoot), false);
    assert.match(error.message, /malformed/i);
  }
});

test("resolveProjectPath accepts portable nested relative paths", () => {
  const resolved = resolveProjectPath(projectRoot, "levels/level.main.json");
  assert.equal(resolved, path.resolve(projectRoot, "levels", "level.main.json"));
});

test("resolveProjectPath rejects POSIX and Windows traversal", () => {
  assert.throws(
    () => resolveProjectPath(projectRoot, "../outside.json"),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
  assert.throws(
    () => resolveProjectPath(projectRoot, "..\\outside.json"),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
});

test("resolveProjectPath rejects absolute paths and mixed separators", () => {
  assert.throws(
    () => resolveProjectPath(projectRoot, "/tmp/level.json"),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
  assert.throws(
    () => resolveProjectPath(projectRoot, "C:/tmp/level.json"),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
  assert.throws(
    () => resolveProjectPath(projectRoot, "levels\\level.main.json"),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
});
