import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaytestInput } from "../src/PlaytestInput.js";

const MOVE_LEFT = 1 << 0;
const MOVE_RIGHT = 1 << 1;
const JUMP = 1 << 4;

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
