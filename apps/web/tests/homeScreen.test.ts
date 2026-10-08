import { test } from "node:test";
import assert from "node:assert/strict";

import { homeTitle } from "../src/ui/HomeScreen.js";

test("the home title is the project's name, the template's only when unnamed", () => {
  assert.equal(homeTitle("Zero x MMX - Intro Highway"), "ZERO X MMX - INTRO HIGHWAY");
  assert.equal(homeTitle(""), "MEGA MAN X");
  assert.equal(homeTitle("   "), "MEGA MAN X");
  assert.equal(homeTitle(undefined), "MEGA MAN X");
});
