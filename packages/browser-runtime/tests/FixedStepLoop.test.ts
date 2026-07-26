import { test } from "node:test";
import assert from "node:assert/strict";
import { FixedStepLoop } from "../src/index.js";

test("compatibility facade re-exports FixedStepLoop", () => {
  assert.equal(typeof FixedStepLoop, "function");
});
