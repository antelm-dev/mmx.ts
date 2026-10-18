import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_PALETTE, WEAPON_PALETTE, weaponPalette } from "../src/render/weaponPalette.js";

test("a weapon's palette is looked up by its id", () => {
  assert.equal(weaponPalette("dark_arrow"), WEAPON_PALETTE.dark_arrow);
  assert.equal(weaponPalette("buster"), BASE_PALETTE, "the buster is the identity recolor");
});

test("an unknown weapon, or none, falls back to the identity recolor", () => {
  assert.equal(weaponPalette("not_a_weapon"), BASE_PALETTE);
  assert.equal(weaponPalette(null), BASE_PALETTE);
});
