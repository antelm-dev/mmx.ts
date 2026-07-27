import assert from "node:assert/strict";
import { test } from "node:test";
import { createRebuildScheduler } from "../src/vite/rebuildScheduler.js";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("coalesces bursts into one pending rebuild and publishes newest result only", async () => {
  const started: number[] = [];
  const published: number[] = [];
  const gates = [deferred(), deferred(), deferred()];
  let runIndex = 0;

  const scheduler = createRebuildScheduler({
    async run() {
      const index = runIndex++;
      started.push(index);
      await gates[index]!.promise;
      return index;
    },
    publish(value) {
      published.push(value);
    },
  });

  scheduler.schedule();
  await Promise.resolve();
  assert.deepEqual(started, [0]);

  scheduler.schedule();
  scheduler.schedule();
  await Promise.resolve();
  assert.deepEqual(started, [0]);

  gates[0]!.resolve();
  while (started.length < 2) {
    await Promise.resolve();
  }
  assert.deepEqual(started, [0, 1]);
  gates[1]!.resolve();
  await scheduler.waitCurrent();

  assert.deepEqual(published, [1]);
});

test("older rebuild completing after newer events cannot overwrite published result", async () => {
  const published: string[] = [];
  const first = deferred<string>();
  const second = deferred<string>();
  let calls = 0;

  const scheduler = createRebuildScheduler({
    async run() {
      calls += 1;
      if (calls === 1) return first.promise;
      return second.promise;
    },
    publish(value) {
      published.push(value);
    },
  });

  scheduler.schedule();
  await Promise.resolve();
  scheduler.schedule();

  second.resolve("new");
  first.resolve("old");
  await scheduler.waitCurrent();

  assert.deepEqual(published, ["new"]);
  assert.equal(calls, 2);
});

test("failed generation is reported and does not block a later rebuild", async () => {
  const published: number[] = [];
  const errors: unknown[] = [];
  const fail = deferred<number>();
  const ok = deferred<number>();
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

  scheduler.schedule();
  await Promise.resolve();
  fail.reject(new Error("boom"));
  await scheduler.waitCurrent();

  assert.equal(errors.length, 1);
  assert.deepEqual(published, []);

  scheduler.schedule();
  ok.resolve(7);
  await scheduler.waitCurrent();

  assert.deepEqual(published, [7]);
});

test("waitCurrent awaits the generation current at call time", async () => {
  const order: string[] = [];
  const gate = deferred();

  const scheduler = createRebuildScheduler({
    async run() {
      order.push("run-start");
      await gate.promise;
      order.push("run-end");
      return "bundle";
    },
    publish() {
      order.push("publish");
    },
  });

  scheduler.schedule();
  const waiting = scheduler.waitCurrent().then(() => {
    order.push("wait-done");
  });

  await Promise.resolve();
  assert.ok(order.includes("run-start"));
  assert.equal(order.includes("wait-done"), false);

  gate.resolve();
  await waiting;

  assert.deepEqual(order, ["run-start", "run-end", "publish", "wait-done"]);
});

test("schedule does not leave unhandled rejections", async () => {
  const errors: unknown[] = [];
  const scheduler = createRebuildScheduler({
    async run() {
      throw new Error("handled");
    },
    publish() {
      assert.fail("should not publish");
    },
    onError(error) {
      errors.push(error);
    },
  });

  scheduler.schedule();
  await scheduler.waitCurrent();
  await Promise.resolve();

  assert.equal(errors.length, 1);
});
