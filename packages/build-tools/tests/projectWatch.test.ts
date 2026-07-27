import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  DATA_DIR,
  GAME_DIR,
  PROJECT_MANIFEST,
  PROJECT_WATCH_INPUTS,
  STUDIO_GAME_DATA_FILE,
} from "../src/index.js";
import {
  bindProjectFileWatcher,
  createRebuildScheduler,
  defaultMmxProjectEmitDir,
  projectWatchRoots,
  shouldScheduleProjectRebuild,
  type ProjectFileWatcher,
} from "../src/vite/plugin.js";

class ControlledWatcher extends EventEmitter implements ProjectFileWatcher {
  readonly added: string[] = [];

  add(id: string): this {
    this.added.push(id);
    return this;
  }

  override on(event: "all", listener: (event: string, file: string) => void): this;
  override on(event: string, listener: (...args: never[]) => void): this;
  override on(event: string, listener: (...args: never[]) => void): this {
    return super.on(event, listener);
  }

  override off(event: "all", listener: (event: string, file: string) => void): this;
  override off(event: string, listener: (...args: never[]) => void): this;
  override off(event: string, listener: (...args: never[]) => void): this {
    return super.off(event, listener);
  }

  emitAll(event: string, file: string): boolean {
    return this.emit("all", event, file);
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("PROJECT_WATCH_INPUTS covers manifest levels assets data and game", () => {
  assert.deepEqual(
    [...PROJECT_WATCH_INPUTS],
    [PROJECT_MANIFEST, "levels", "assets", DATA_DIR, GAME_DIR],
  );
  assert.ok(STUDIO_GAME_DATA_FILE.startsWith(`${GAME_DIR}/`));
});

test("projectWatchRoots joins watch inputs with cross-platform separators", () => {
  const projectDir = path.resolve("/tmp/mmx-project");
  assert.deepEqual(projectWatchRoots(projectDir), [
    path.join(projectDir, "project.json"),
    path.join(projectDir, "levels"),
    path.join(projectDir, "assets"),
    path.join(projectDir, "data"),
    path.join(projectDir, "game"),
  ]);
});

test("shouldScheduleProjectRebuild accepts game/data.json change add unlink", () => {
  const projectDir = path.resolve("/tmp/mmx-project");
  const emitDir = defaultMmxProjectEmitDir(projectDir);
  const gameData = path.join(projectDir, "game", "data.json");
  for (const event of ["change", "add", "unlink"] as const) {
    assert.equal(
      shouldScheduleProjectRebuild({ projectDir, emitDir, event, file: gameData }),
      true,
      event,
    );
  }
});

test("shouldScheduleProjectRebuild accepts canonical data bindings paths", () => {
  const projectDir = path.resolve("/tmp/mmx-project");
  const emitDir = defaultMmxProjectEmitDir(projectDir);
  for (const relative of ["data/game.json", "data/renderer-bindings.json", "levels/main.json"]) {
    assert.equal(
      shouldScheduleProjectRebuild({
        projectDir,
        emitDir,
        event: "change",
        file: path.join(projectDir, ...relative.split("/")),
      }),
      true,
      relative,
    );
  }
});

test("shouldScheduleProjectRebuild rejects sibling and prefixed project paths", () => {
  const projectDir = path.resolve("/tmp/mmx-project");
  const emitDir = defaultMmxProjectEmitDir(projectDir);
  for (const file of [
    path.resolve("/tmp/mmx-project-extra/game/data.json"),
    path.resolve("/tmp/mmx-project2/game/data.json"),
    path.resolve("/tmp/other/game/data.json"),
  ]) {
    assert.equal(
      shouldScheduleProjectRebuild({ projectDir, emitDir, event: "change", file }),
      false,
      file,
    );
  }
});

test("shouldScheduleProjectRebuild rejects emit directory output events", () => {
  const projectDir = path.resolve("/tmp/mmx-project");
  const emitDir = defaultMmxProjectEmitDir(projectDir);
  for (const file of [
    emitDir,
    path.join(emitDir, "assets", "deadbeef.png"),
    path.join(projectDir, ".mmx-assets", "assets", "cafe.wav"),
  ]) {
    assert.equal(
      shouldScheduleProjectRebuild({ projectDir, emitDir, event: "add", file }),
      false,
      file,
    );
  }
});

test("controlled watcher schedules game/data.json events and ignores outsiders and emit", () => {
  const projectDir = path.resolve("/tmp/mmx-watch-project");
  const emitDir = defaultMmxProjectEmitDir(projectDir);
  const watcher = new ControlledWatcher();
  const scheduled: number[] = [];
  const detach = bindProjectFileWatcher({
    watcher,
    projectDir,
    emitDir,
    schedule: () => {
      scheduled.push(scheduled.length + 1);
    },
  });

  assert.deepEqual(watcher.added, projectWatchRoots(projectDir));

  const gameData = path.join(projectDir, "game", "data.json");
  watcher.emitAll("change", gameData);
  watcher.emitAll("add", gameData);
  watcher.emitAll("unlink", gameData);
  watcher.emitAll("change", path.resolve("/tmp/outside/game/data.json"));
  watcher.emitAll("add", path.join(emitDir, "assets", "loop.png"));
  watcher.emitAll("addDir", gameData);

  assert.deepEqual(scheduled, [1, 2, 3]);

  detach();
  watcher.emitAll("change", gameData);
  assert.deepEqual(scheduled, [1, 2, 3]);
});

test("rapid binding events coalesce and publish newest binding contents", async () => {
  const projectDir = path.resolve("/tmp/mmx-coalesce-project");
  const emitDir = defaultMmxProjectEmitDir(projectDir);
  const watcher = new ControlledWatcher();
  const published: string[] = [];
  const gates = [deferred<string>(), deferred<string>()];
  let runIndex = 0;
  let newest = "initial";

  const scheduler = createRebuildScheduler({
    async run() {
      const index = runIndex++;
      const value = await gates[index]!.promise;
      return value;
    },
    publish(value) {
      published.push(value);
    },
  });

  bindProjectFileWatcher({
    watcher,
    projectDir,
    emitDir,
    schedule: () => scheduler.schedule(),
  });

  const gameData = path.join(projectDir, "game", "data.json");
  newest = "first";
  watcher.emitAll("change", gameData);
  await Promise.resolve();
  newest = "second";
  watcher.emitAll("change", gameData);
  newest = "third";
  watcher.emitAll("change", gameData);

  gates[0]!.resolve("stale");
  while (runIndex < 2) {
    await Promise.resolve();
  }
  gates[1]!.resolve(newest);
  await scheduler.waitCurrent();

  assert.deepEqual(published, ["third"]);
  assert.equal(runIndex, 2);
});

test("binding rebuild errors are reported and a later valid edit recovers", async () => {
  const projectDir = path.resolve("/tmp/mmx-recover-project");
  const emitDir = defaultMmxProjectEmitDir(projectDir);
  const watcher = new ControlledWatcher();
  const published: string[] = [];
  const errors: unknown[] = [];
  const fail = deferred<string>();
  const ok = deferred<string>();
  let calls = 0;

  const scheduler = createRebuildScheduler({
    async run() {
      calls += 1;
      if (calls === 1) return fail.promise;
      return ok.promise;
    },
    publish(value) {
      published.push(value);
    },
    onError(error) {
      errors.push(error);
    },
  });

  bindProjectFileWatcher({
    watcher,
    projectDir,
    emitDir,
    schedule: () => scheduler.schedule(),
  });

  const gameData = path.join(projectDir, "game", "data.json");
  watcher.emitAll("change", gameData);
  await Promise.resolve();
  fail.reject(new Error("invalid bindings"));
  await scheduler.waitCurrent();

  assert.equal(errors.length, 1);
  assert.deepEqual(published, []);

  watcher.emitAll("change", gameData);
  ok.resolve("recovered-bindings");
  await scheduler.waitCurrent();

  assert.deepEqual(published, ["recovered-bindings"]);
});

test("editing temporary game/data.json through watcher publishes updated binding payload", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-game-watch-"));
  const projectDir = path.join(tempRoot, "project");
  const emitDir = path.join(tempRoot, "emit");
  const gameDir = path.join(projectDir, "game");
  const gameDataPath = path.join(gameDir, "data.json");
  const watcher = new ControlledWatcher();
  const published: Array<{ token: string }> = [];

  try {
    await fs.mkdir(gameDir, { recursive: true });
    await fs.writeFile(gameDataPath, JSON.stringify({ token: "before" }), "utf8");

    const scheduler = createRebuildScheduler({
      async run() {
        const raw = await fs.readFile(gameDataPath, "utf8");
        return JSON.parse(raw) as { token: string };
      },
      publish(value) {
        published.push(value);
      },
    });

    bindProjectFileWatcher({
      watcher,
      projectDir,
      emitDir,
      schedule: () => scheduler.schedule(),
    });

    await fs.writeFile(gameDataPath, JSON.stringify({ token: "after" }), "utf8");
    watcher.emitAll("change", gameDataPath);
    await scheduler.waitCurrent();

    assert.deepEqual(published, [{ token: "after" }]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
