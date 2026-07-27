import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserInput, DEFAULT_BINDINGS } from "@mmx/browser-input";

/**
 * Focused coverage for the Web routing policy that sits on top of
 * {@link BrowserInput}: menu/home precedence, debug unbound keys, and
 * pause-on-blur — without pulling the full Web app graph.
 */

type Listener = (e: unknown) => void;

function createTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    target: {
      addEventListener: (type: string, fn: Listener) => {
        const set = listeners.get(type) ?? new Set();
        set.add(fn);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, fn: Listener) => {
        listeners.get(type)?.delete(fn);
      },
    },
    fire(type: string, event: Record<string, unknown> = {}) {
      const payload = { preventDefault() {}, repeat: false, ...event };
      for (const fn of listeners.get(type) ?? []) fn(payload);
    },
  };
}

test("menu beforeKeyDown swallows gameplay keys", () => {
  const { target, fire } = createTarget();
  const handled: string[] = [];
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    beforeKeyDown: (e) => {
      handled.push(e.code);
      e.preventDefault();
      return true;
    },
  });
  input.attach();
  fire("keydown", { code: "Space" });
  assert.deepEqual(handled, ["Space"]);
  assert.equal(input.packedMask(), 0);
  input.detach();
});

test("unbound keys reach afterUnboundKeyDown for debug routing", () => {
  const { target, fire } = createTarget();
  const seen: string[] = [];
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    afterUnboundKeyDown: (e) => seen.push(e.code),
  });
  input.attach();
  fire("keydown", { code: "F8" });
  assert.deepEqual(seen, ["F8"]);
  input.detach();
});

test("blur clears held state before the host pause callback", () => {
  const { target, fire } = createTarget();
  let paused = false;
  const input = new BrowserInput({
    getBindings: () => DEFAULT_BINDINGS,
    target,
    onBlur: () => {
      assert.equal(input.packedMask(), 0);
      paused = true;
    },
  });
  input.attach();
  fire("keydown", { code: "ArrowLeft" });
  assert.ok(input.packedMask());
  fire("blur");
  assert.equal(input.packedMask(), 0);
  assert.equal(paused, true);
  input.detach();
});
