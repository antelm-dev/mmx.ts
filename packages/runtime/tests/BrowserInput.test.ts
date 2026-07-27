import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserInput, DEFAULT_BINDINGS } from "@mmx/browser-input";

const MOVE_LEFT = 1 << 0;
const MOVE_RIGHT = 1 << 1;
const JUMP = 1 << 4;
const DASH = 1 << 5;

const listeners = new Map<string, Set<(e: unknown) => void>>();

function fire(type: string, code: string, extra: Record<string, unknown> = {}): void {
  const event = { code, preventDefault: () => {}, ...extra };
  for (const fn of listeners.get(type) ?? []) fn(event);
}

function installWindow(): void {
  listeners.clear();
  (globalThis as { window?: unknown }).window = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
  };
}

test("maps keys to actions and clears on blur", () => {
  installWindow();
  const input = new BrowserInput({ getBindings: () => DEFAULT_BINDINGS });
  input.attach();

  fire("keydown", "ArrowRight");
  fire("keydown", "Space");
  assert.ok(input.toMask() & MOVE_RIGHT);
  assert.ok(input.toMask() & JUMP);

  fire("keyup", "ArrowRight");
  assert.equal(input.toMask() & MOVE_RIGHT, 0);
  assert.ok(input.toMask() & JUMP);

  fire("blur", "");
  assert.equal(input.toMask(), 0);

  input.detach();
  fire("keydown", "ArrowLeft");
  assert.equal(input.toMask(), 0);
});

test("set drives actions without the keyboard", () => {
  const input = new BrowserInput({ getBindings: () => DEFAULT_BINDINGS });
  input.set("move_left", true);
  assert.ok(input.toMask() & MOVE_LEFT);
  input.releaseAll();
  assert.equal(input.toMask(), 0);
});

test("attach is idempotent", () => {
  installWindow();
  const input = new BrowserInput({ getBindings: () => DEFAULT_BINDINGS });
  input.attach();
  input.attach();
  assert.equal(listeners.get("keydown")?.size, 1);
  input.detach();
});

test("bindings are read live", () => {
  installWindow();
  let bindings = { ...DEFAULT_BINDINGS, jump: ["Space"] as const };
  const input = new BrowserInput({ getBindings: () => bindings });
  input.attach();

  fire("keydown", "KeyK");
  assert.equal(input.toMask() & JUMP, 0);

  bindings = { ...bindings, jump: ["KeyK"] };
  fire("keydown", "KeyK");
  assert.ok(input.toMask() & JUMP);
  input.detach();
});

test("beforeKeyDown can swallow gameplay", () => {
  installWindow();
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    beforeKeyDown: () => true,
  });
  input.attach();
  fire("keydown", "Space");
  assert.equal(input.toMask() & JUMP, 0);
  input.detach();
});

test("afterUnboundKeyDown runs for unmapped keys", () => {
  installWindow();
  let seen = "";
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    afterUnboundKeyDown: (e) => {
      seen = e.code;
    },
  });
  input.attach();
  fire("keydown", "F1");
  assert.equal(seen, "F1");
  input.detach();
});

function fakePad(buttons: Array<{ pressed: boolean; value: number }>) {
  return {
    buttons,
    axes: [0, 0, 0, 0],
    index: 0,
    id: "test",
    connected: true,
  } as unknown as Gamepad;
}

test("merges keyboard and gamepad masks", () => {
  installWindow();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };

  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    getGamepads: () => [fakePad(buttons)],
  });
  input.attach();
  fire("keydown", "ArrowLeft");
  input.poll(0, false);
  assert.ok(input.toMask() & MOVE_LEFT);
  assert.ok(input.toMask() & JUMP);
  input.detach();
});

test("suppressGameplay stales held pad actions until release", () => {
  installWindow();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[1] = { pressed: true, value: 1 };

  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    getGamepads: () => [fakePad(buttons)],
  });
  input.poll(0, true);
  assert.equal(input.toMask() & DASH, 0);

  input.poll(0, false);
  assert.equal(input.toMask() & DASH, 0);

  buttons[1] = { pressed: false, value: 0 };
  input.poll(0, false);
  buttons[1] = { pressed: true, value: 1 };
  input.poll(0, false);
  assert.ok(input.toMask() & DASH);
});

test("takeMenuCodes emits edges and direction repeats", () => {
  installWindow();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[12] = { pressed: true, value: 1 };

  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    getGamepads: () => [fakePad(buttons)],
  });
  input.poll(0, true);
  assert.deepEqual(input.takeMenuCodes(), ["ArrowUp"]);
  assert.deepEqual(input.takeMenuCodes(), []);

  input.poll(0.5, true);
  assert.deepEqual(input.takeMenuCodes(), ["ArrowUp"]);
});
