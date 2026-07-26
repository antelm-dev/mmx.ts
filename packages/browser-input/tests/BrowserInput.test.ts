import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserInput, GamepadInput } from "../src/index.js";

test("compatibility facade re-exports browser input", () => {
  assert.equal(typeof BrowserInput, "function");
  assert.equal(typeof GamepadInput, "function");
});
