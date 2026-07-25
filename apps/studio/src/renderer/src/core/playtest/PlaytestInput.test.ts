import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaytestInput } from "./PlaytestInput.js";

/** Bit positions from REPLAY_ACTIONS order in @mmx/engine. */
const MOVE_LEFT = 1 << 0;
const MOVE_RIGHT = 1 << 1;
const JUMP = 1 << 4;

const listeners = new Map<string, Set<(e: unknown) => void>>();

function fire(type: string, code: string): void {
  const event = { code, preventDefault: () => {} };
  for (const fn of listeners.get(type) ?? []) fn(event);
}

beforeEach(() => {
  listeners.clear();
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaytestInput", () => {
  it("packs held keys into the input mask and releases them on keyup", () => {
    const input = new PlaytestInput();
    input.attach();

    fire("keydown", "ArrowRight");
    fire("keydown", "Space");
    expect(input.mask() & MOVE_RIGHT).toBeTruthy();
    expect(input.mask() & JUMP).toBeTruthy();

    fire("keyup", "ArrowRight");
    expect(input.mask() & MOVE_RIGHT).toBeFalsy();
    expect(input.mask() & JUMP).toBeTruthy();
  });

  it("clears all input on window blur, so no movement key stays stuck", () => {
    const input = new PlaytestInput();
    input.attach();
    fire("keydown", "ArrowLeft");
    expect(input.mask() & MOVE_LEFT).toBeTruthy();

    fire("blur", "");
    expect(input.mask()).toBe(0);
  });

  it("detach removes listeners and clears held state", () => {
    const input = new PlaytestInput();
    input.attach();
    fire("keydown", "ArrowRight");
    input.detach();
    expect(input.mask()).toBe(0);

    // A late event after detach must not reach the input.
    fire("keydown", "ArrowRight");
    expect(input.mask()).toBe(0);
  });

  it("is idempotent across repeated attach cycles (no duplicate listeners)", () => {
    const input = new PlaytestInput();
    input.attach();
    input.attach();
    expect(listeners.get("keydown")?.size).toBe(1);
  });
});
