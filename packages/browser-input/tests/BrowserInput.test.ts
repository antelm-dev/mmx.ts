import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BrowserInput,
  DEFAULT_BINDINGS,
  GamepadInput,
  assignBinding,
  cloneBindings,
  mergeBindings,
  type BrowserInputBindings,
  type EventTargetLike,
} from "../src/index.js";
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

function fakePad(partial: {
  buttons?: Array<{ pressed: boolean; value: number }>;
  axes?: number[];
}): Gamepad {
  return {
    buttons: partial.buttons ?? Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    axes: partial.axes ?? [0, 0, 0, 0],
    index: 0,
    id: "test",
    connected: true,
  } as unknown as Gamepad;
}

test("headless module import does not touch window or navigator", async () => {
  const g = globalThis as { window?: unknown; navigator?: unknown };
  const prevWindow = g.window;
  const prevNavigator = g.navigator;
  delete g.window;
  delete g.navigator;
  try {
    const mod = await import("../src/index.js");
    assert.equal(typeof mod.BrowserInput, "function");
    assert.equal(typeof mod.GamepadInput, "function");
  } finally {
    if (prevWindow !== undefined) g.window = prevWindow;
    else delete g.window;
    if (prevNavigator !== undefined) g.navigator = prevNavigator;
    else delete g.navigator;
  }
});

test("default bindings map keys into the packed mask", () => {
  const { target, fire } = createTarget();
  const input = new BrowserInput({ getBindings: () => DEFAULT_BINDINGS, target });
  input.attach();

  fire("keydown", { code: "ArrowRight" });
  fire("keydown", { code: "Space" });
  assert.ok(input.packedMask() & MOVE_RIGHT);
  assert.ok(input.packedMask() & JUMP);

  fire("keyup", { code: "ArrowRight" });
  assert.equal(input.packedMask() & MOVE_RIGHT, 0);
  assert.ok(input.packedMask() & JUMP);
  input.detach();
});

test("custom bindings replace defaults", () => {
  const { target, fire } = createTarget();
  const bindings: BrowserInputBindings = { jump: ["KeyZ"] };
  const input = new BrowserInput({ getBindings: () => bindings, target });
  input.attach();
  fire("keydown", { code: "Space" });
  assert.equal(input.packedMask() & JUMP, 0);
  fire("keydown", { code: "KeyZ" });
  assert.ok(input.packedMask() & JUMP);
  input.detach();
});

test("repeat keydown keeps the action held", () => {
  const { target, fire } = createTarget();
  const input = new BrowserInput({ getBindings: () => DEFAULT_BINDINGS, target });
  input.attach();
  fire("keydown", { code: "Space", repeat: false });
  fire("keydown", { code: "Space", repeat: true });
  assert.ok(input.packedMask() & JUMP);
  input.detach();
});

test("two keys bound to one action stay held until both release", () => {
  const { target, fire } = createTarget();
  const input = new BrowserInput({ getBindings: () => DEFAULT_BINDINGS, target });
  input.attach();
  fire("keydown", { code: "Space" });
  fire("keydown", { code: "KeyK" });
  fire("keyup", { code: "Space" });
  assert.ok(input.packedMask() & JUMP);
  fire("keyup", { code: "KeyK" });
  assert.equal(input.packedMask() & JUMP, 0);
  input.detach();
});

test("keyboard and gamepad masks compose with OR", () => {
  const { target, fire } = createTarget();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    getGamepads: () => [fakePad({ buttons })],
  });
  input.attach();
  fire("keydown", { code: "ArrowLeft" });
  input.pollGamepads(0, false);
  assert.ok(input.packedMask() & MOVE_LEFT);
  assert.ok(input.packedMask() & JUMP);
  input.detach();
});

test("releasing the gamepad preserves a keyboard-held action", () => {
  const { target, fire } = createTarget();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };
  const pads: Array<Gamepad | null> = [fakePad({ buttons })];
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    getGamepads: () => pads,
  });
  input.attach();
  fire("keydown", { code: "Space" });
  input.pollGamepads(0, false);
  assert.ok(input.packedMask() & JUMP);

  buttons[0] = { pressed: false, value: 0 };
  input.pollGamepads(0, false);
  assert.ok(input.packedMask() & JUMP);

  pads[0] = null;
  fire("gamepaddisconnected", { gamepad: { index: 0, id: "test" } });
  assert.ok(input.packedMask() & JUMP);
  input.detach();
});

test("releasing a keyboard key preserves a gamepad-held action", () => {
  const { target, fire } = createTarget();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    getGamepads: () => [fakePad({ buttons })],
  });
  input.attach();
  fire("keydown", { code: "Space" });
  input.pollGamepads(0, false);
  fire("keyup", { code: "Space" });
  assert.ok(input.packedMask() & JUMP);
  input.detach();
});

test("multiple connected pads OR into one mask", () => {
  const a = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const b = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  a[14] = { pressed: true, value: 1 };
  b[0] = { pressed: true, value: 1 };
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    getGamepads: () => [fakePad({ buttons: a }), fakePad({ buttons: b })],
  });
  input.pollGamepads(0, false);
  assert.ok(input.packedMask() & MOVE_LEFT);
  assert.ok(input.packedMask() & JUMP);
});

test("stick axes respect the dead zone and direction", () => {
  const pad = new GamepadInput(() => [fakePad({ axes: [0.4, -0.4, 0, 0] })]);
  pad.poll(0, false);
  assert.equal(pad.actions.isPressed("move_left"), false);
  assert.equal(pad.actions.isPressed("move_up"), false);

  const pad2 = new GamepadInput(() => [fakePad({ axes: [-0.6, 0.7, 0, 0] })]);
  pad2.poll(0, false);
  assert.equal(pad2.actions.isPressed("move_left"), true);
  assert.equal(pad2.actions.isPressed("move_down"), true);
  assert.equal(pad2.actions.isPressed("move_right"), false);
  assert.equal(pad2.actions.isPressed("move_up"), false);
});

test("menu button edges emit once and arrows repeat on a delay", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };
  buttons[12] = { pressed: true, value: 1 };
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    getGamepads: () => [fakePad({ buttons })],
  });
  input.pollGamepads(0, true);
  assert.deepEqual(input.takeMenuCodes().sort(), ["ArrowUp", "Enter"].sort());
  assert.deepEqual(input.takeMenuCodes(), []);

  input.pollGamepads(0.2, true);
  assert.deepEqual(input.takeMenuCodes(), []);
  input.pollGamepads(0.3, true);
  assert.deepEqual(input.takeMenuCodes(), ["ArrowUp"]);
});

test("onNavigation receives menu commands during poll", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[1] = { pressed: true, value: 1 };
  const seen: string[] = [];
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    getGamepads: () => [fakePad({ buttons })],
    onNavigation: (command) => seen.push(command),
  });
  input.pollGamepads(0, true);
  assert.deepEqual(seen, ["Escape"]);
  assert.deepEqual(input.takeMenuCodes(), []);
});

test("blur clears keyboard and gamepad held state", () => {
  const { target, fire } = createTarget();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[1] = { pressed: true, value: 1 };
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    getGamepads: () => [fakePad({ buttons })],
  });
  input.attach();
  fire("keydown", { code: "ArrowLeft" });
  input.pollGamepads(0, false);
  assert.ok(input.packedMask() & (MOVE_LEFT | DASH));
  fire("blur");
  assert.equal(input.packedMask(), 0);
  input.detach();
});

test("bindings can change at runtime without reconstructing input", () => {
  const { target, fire } = createTarget();
  let bindings: BrowserInputBindings = { ...DEFAULT_BINDINGS, jump: ["Space"] };
  const input = new BrowserInput({ getBindings: () => bindings, target });
  input.attach();
  fire("keydown", { code: "KeyK" });
  assert.equal(input.packedMask() & JUMP, 0);
  bindings = { ...bindings, jump: ["KeyK"] };
  fire("keydown", { code: "KeyK" });
  assert.ok(input.packedMask() & JUMP);
  input.detach();
});

test("attach and detach are idempotent and remove listeners", () => {
  const { target, fire, listenerCount } = createTarget();
  const input = new BrowserInput({ getBindings: () => DEFAULT_BINDINGS, target });
  input.attach();
  input.attach();
  assert.equal(listenerCount("keydown"), 1);
  input.detach();
  input.detach();
  assert.equal(listenerCount("keydown"), 0);
  fire("keydown", { code: "Space" });
  assert.equal(input.packedMask(), 0);
});

test("set drives virtual actions without the keyboard", () => {
  const input = new BrowserInput({ getBindings: () => DEFAULT_BINDINGS });
  input.set("move_left", true);
  assert.ok(input.packedMask() & MOVE_LEFT);
  input.clearKeyboard();
  assert.equal(input.packedMask(), 0);
});

test("beforeKeyDown can swallow gameplay mapping", () => {
  const { target, fire } = createTarget();
  let activity = 0;
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    beforeKeyDown: () => true,
    onActivity: () => {
      activity += 1;
    },
  });
  input.attach();
  fire("keydown", { code: "Space" });
  assert.equal(input.packedMask() & JUMP, 0);
  assert.equal(activity, 0);
  input.detach();
});

test("afterUnboundKeyDown runs for unmapped keys", () => {
  const { target, fire } = createTarget();
  let seen = "";
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    afterUnboundKeyDown: (e) => {
      seen = e.code;
    },
  });
  input.attach();
  fire("keydown", { code: "F1" });
  assert.equal(seen, "F1");
  input.detach();
});

test("suppressGameplay stales held pad actions until release", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[1] = { pressed: true, value: 1 };
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    getGamepads: () => [fakePad({ buttons })],
  });
  input.pollGamepads(0, true);
  assert.equal(input.packedMask() & DASH, 0);
  input.pollGamepads(0, false);
  assert.equal(input.packedMask() & DASH, 0);
  buttons[1] = { pressed: false, value: 0 };
  input.pollGamepads(0, false);
  buttons[1] = { pressed: true, value: 1 };
  input.pollGamepads(0, false);
  assert.ok(input.packedMask() & DASH);
});

test("assignBinding removes conflicts across actions", () => {
  const next = assignBinding(DEFAULT_BINDINGS, "jump", 0, "KeyA");
  assert.equal(next.jump[0], "KeyA");
  assert.equal(next.move_left[1], "");
});

test("mergeBindings fills missing actions from defaults", () => {
  const merged = mergeBindings({ jump: ["KeyZ", ""] });
  assert.deepEqual(merged.jump, ["KeyZ", ""]);
  assert.deepEqual(merged.move_left, DEFAULT_BINDINGS.move_left);
});

test("cloneBindings returns an independent copy", () => {
  const copy = cloneBindings(DEFAULT_BINDINGS);
  copy.jump[0] = "KeyZ";
  assert.equal(DEFAULT_BINDINGS.jump[0], "Space");
});

test("secondary stick axes also drive movement", () => {
  const pad = new GamepadInput(() => [fakePad({ axes: [0, 0, 0.8, -0.8] })]);
  pad.poll(0, false);
  assert.equal(pad.actions.isPressed("move_right"), true);
  assert.equal(pad.actions.isPressed("move_up"), true);
  assert.equal(pad.actions.isPressed("move_left"), false);
});
