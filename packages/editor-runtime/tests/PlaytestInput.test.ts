import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaytestInput } from "../src/PlaytestInput.js";

const MOVE_LEFT = 1 << 0;
const MOVE_RIGHT = 1 << 1;
const JUMP = 1 << 4;
const DASH = 1 << 5;

const listeners = new Map<string, Set<(e: unknown) => void>>();

function fire(type: string, code: string): void {
  const event = { code, preventDefault: () => {} };
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

function fakePad(buttons: Array<{ pressed: boolean; value: number }>) {
  return {
    buttons,
    axes: [0, 0, 0, 0],
    index: 0,
    id: "test",
    connected: true,
  };
}

test("PlaytestInput maps keys to actions and clears on blur", () => {
  installWindow();
  const input = new PlaytestInput();
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

test("PlaytestInput.set drives actions without the keyboard", () => {
  const input = new PlaytestInput();
  input.set("move_left", true);
  assert.ok(input.toMask() & MOVE_LEFT);
  input.clear();
  assert.equal(input.toMask(), 0);
});

test("attach is idempotent", () => {
  installWindow();
  const input = new PlaytestInput();
  input.attach();
  input.attach();
  assert.equal(listeners.get("keydown")?.size, 1);
  input.detach();
});

test("PlaytestInput polls gamepad into the packed mask", () => {
  installWindow();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[1] = { pressed: true, value: 1 };

  const input = new PlaytestInput({
    getGamepads: () => [fakePad(buttons) as Gamepad],
  });
  input.poll(0);
  assert.ok(input.toMask() & DASH);

  input.clear();
  assert.equal(input.toMask() & DASH, 0);
  input.poll(0);
  assert.equal(input.toMask() & DASH, 0);
});
