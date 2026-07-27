import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaytestInput } from "../src/PlaytestInput.js";
import type { EventTargetLike } from "@mmx/browser-input";

const MOVE_LEFT = 1 << 0;
const MOVE_RIGHT = 1 << 1;
const JUMP = 1 << 4;
const DASH = 1 << 5;

type Listener = (e: unknown) => void;

function createTarget(): {
  target: EventTargetLike;
  fire: (type: string, event?: Record<string, unknown>) => void;
  listenerCount: (type: string) => number;
} {
  const listeners = new Map<string, Set<Listener>>();
  const target: EventTargetLike = {
    addEventListener: (type, fn) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn as Listener);
      listeners.set(type, set);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn as Listener);
    },
  };
  return {
    target,
    fire(type, event = {}) {
      const payload = { preventDefault() {}, ...event };
      for (const fn of listeners.get(type) ?? []) fn(payload);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
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
  const { target, fire } = createTarget();
  const input = new PlaytestInput({ target });
  input.attach();

  fire("keydown", { code: "ArrowRight" });
  fire("keydown", { code: "Space" });
  assert.ok(input.toMask() & MOVE_RIGHT);
  assert.ok(input.toMask() & JUMP);

  fire("keyup", { code: "ArrowRight" });
  assert.equal(input.toMask() & MOVE_RIGHT, 0);
  assert.ok(input.toMask() & JUMP);

  fire("blur");
  assert.equal(input.toMask(), 0);

  input.detach();
  fire("keydown", { code: "ArrowLeft" });
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
  const { target, listenerCount } = createTarget();
  const input = new PlaytestInput({ target });
  input.attach();
  input.attach();
  assert.equal(listenerCount("keydown"), 1);
  input.detach();
  assert.equal(listenerCount("keydown"), 0);
});

test("PlaytestInput polls gamepad into the packed mask", () => {
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

test("PlaytestInput accepts custom bindings without replacing the class", () => {
  const { target, fire } = createTarget();
  const input = new PlaytestInput({
    target,
    getBindings: () => ({ jump: ["KeyF"] }),
  });
  input.attach();
  fire("keydown", { code: "Space" });
  assert.equal(input.toMask() & JUMP, 0);
  fire("keydown", { code: "KeyF" });
  assert.ok(input.toMask() & JUMP);
  input.detach();
});
