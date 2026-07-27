import assert from "node:assert/strict";
import { test } from "node:test";
import { Texture } from "pixi.js";
import { SHEET_URLS } from "../src/render/assets.js";
import { Hud } from "../src/render/Hud.js";
import { loadSheets, resetTextureCacheForTests } from "../src/render/textures.js";

const EXPECTED_SHEETS = {
  "x.png": "/sprites/player/x.png",
  "x_leftarm.png": "/sprites/player/x_leftarm.png",
  "lemon.png": "/sprites/effects/lemon.png",
  "medium_shot.png": "/sprites/effects/medium_shot.png",
  "heavy_shot.png": "/sprites/effects/heavy_shot.png",
  "dark_arrow.png": "/sprites/effects/dark_arrow.png",
  "lemon_hit.png": "/sprites/effects/lemon_hit.png",
  "charge_hit.png": "/sprites/effects/charge_hit.png",
  "charge_1.png": "/sprites/effects/charge_1.png",
  "charge_2.png": "/sprites/effects/charge_2.png",
  "dash.png": "/sprites/effects/dash.png",
  "explosion.png": "/sprites/effects/explosion.png",
  "remains.png": "/sprites/effects/remains.png",
  "x_bar.png": "/sprites/hud/x_bar.png",
  "hp_fill.png": "/sprites/hud/hp_fill.png",
  "weapon_bar.png": "/sprites/hud/weapon_bar.png",
  "weapon_icon_dark_arrow.png": "/sprites/hud/weapon_icon_dark_arrow.png",
  "metool.png": "/sprites/enemies/metool.png",
  "sbat.png": "/sprites/enemies/sbat.png",
  "heal.png": "/sprites/pickups/heal.png",
  "sheal.png": "/sprites/pickups/sheal.png",
  "ammo.png": "/sprites/pickups/ammo.png",
  "sammo.png": "/sprites/pickups/sammo.png",
} as const;

test("every renderer sheet URL is defined and does not end with /undefined", () => {
  for (const [name, url] of Object.entries(SHEET_URLS)) {
    assert.equal(typeof url, "string", name);
    assert.ok(url.length > 0, name);
    assert.ok(!url.endsWith("/undefined"), `${name}: ${url}`);
    assert.ok(!url.includes("assets/undefined"), `${name}: ${url}`);
  }
});

test("renderer sheet URLs refer to the intended asset paths", () => {
  assert.deepEqual(Object.keys(SHEET_URLS).sort(), Object.keys(EXPECTED_SHEETS).sort());
  for (const [name, suffix] of Object.entries(EXPECTED_SHEETS)) {
    const url = SHEET_URLS[name as keyof typeof SHEET_URLS];
    assert.ok(url.includes(suffix), `${name}: expected ${suffix} in ${url}`);
  }
});

test("loadSheets rejects an invalid loader result with the sheet name", async (t) => {
  resetTextureCacheForTests();
  const { Assets } = await import("pixi.js");
  const original = Assets.load;
  t.after(() => {
    Assets.load = original;
    resetTextureCacheForTests();
  });

  Assets.load = (async () => null) as typeof Assets.load;

  await assert.rejects(
    () => loadSheets({ "x_bar.png": "https://example.test/x_bar.png" }),
    /Failed to load renderer sheet 'x_bar\.png' from 'https:\/\/example\.test\/x_bar\.png'/,
  );
});

test("a failed in-flight load does not permanently prevent retrying", async (t) => {
  resetTextureCacheForTests();
  const { Assets } = await import("pixi.js");
  const original = Assets.load;
  t.after(() => {
    Assets.load = original;
    resetTextureCacheForTests();
  });

  let calls = 0;
  Assets.load = (async () => {
    calls += 1;
    if (calls === 1) return null;
    return Texture.EMPTY;
  }) as typeof Assets.load;

  await assert.rejects(() => loadSheets({ "x.png": "https://example.test/x.png" }), /x\.png/);

  await loadSheets({ "x.png": "https://example.test/x.png" });
  assert.equal(calls, 2);
});

test("required HUD textures throw a contextual error instead of Pixi null height", () => {
  resetTextureCacheForTests();
  assert.throws(() => new Hud(), /Required HUD texture 'x_bar\.png' is not loaded/);
});
