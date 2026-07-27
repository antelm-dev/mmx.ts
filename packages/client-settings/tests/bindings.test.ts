import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_BINDINGS,
  cloneBindings,
  resolveBindingConflict,
  resetBindings,
} from "../src/index.js";

test("cloneBindings copies slots", () => {
  const original = cloneBindings(DEFAULT_BINDINGS);
  const copy = cloneBindings(original);
  copy.jump[0] = "KeyZ";
  assert.equal(original.jump[0], "Space");
  assert.equal(copy.jump[0], "KeyZ");
});

test("duplicate key conflict removal", () => {
  const bindings = cloneBindings(DEFAULT_BINDINGS);
  const next = resolveBindingConflict(bindings, "jump", 1, "KeyA");
  assert.equal(next.jump[1], "KeyA");
  assert.equal(next.move_left[1], "");
  assert.equal(bindings.move_left[1], "KeyA");
});

test("resetBindings restores defaults", () => {
  const mutated = cloneBindings(DEFAULT_BINDINGS);
  mutated.fire[0] = "KeyZ";
  const restored = resetBindings();
  assert.deepEqual(restored.fire, DEFAULT_BINDINGS.fire);
  assert.equal(mutated.fire[0], "KeyZ");
});
