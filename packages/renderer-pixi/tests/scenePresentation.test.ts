import assert from "node:assert/strict";
import { test } from "node:test";
import type { DecorationInstance } from "@mmx/content-schema";
import {
  BODY_HALF_H,
  DASH_FX_OFFSET_X,
  DASH_FX_OFFSET_Y,
  ENEMY_DEBRIS_COUNT,
  ENEMY_EXPLOSION_PUFF_COUNT,
  Scene,
  spawnEnemy,
  type Player,
} from "@mmx/engine";
import type { AssetCatalog } from "../src/editor/catalogCore.js";
import { DashSmoke } from "../src/DashSmoke.js";
import { EnemyDebris } from "../src/EnemyDebris.js";
import { EnemyExplosion } from "../src/EnemyExplosion.js";
import {
  createScenePresentationWithHost,
  type ScenePresentationHost,
} from "../src/presentation/ScenePresentation.js";
import { dashSmokeOrigin, selectTrailStyle } from "../src/presentation/cosmetics.js";
import { DASH_TRAIL, Trail, WALLSLIDE_TRAIL } from "../src/Trail.js";

function stubPlayer(state: string | null): Player {
  return {
    is_executing_either: (names: string[]) => state !== null && names.includes(state),
    is_executing: (name: string) => name === state,
  } as Player;
}

function mockCatalog() {
  const attached = {
    players: [] as unknown[],
    enemies: [] as unknown[],
    pickups: [] as unknown[],
    capsules: [] as unknown[],
  };
  const catalog: AssetCatalog = {
    get loaded() {
      return true;
    },
    load: async () => {},
    getSpritePreview: () => null,
    getDecorationPreview: () => null,
    attachPlayerAnimations(player) {
      attached.players.push(player);
    },
    attachEnemyAnimations(enemy) {
      attached.enemies.push(enemy);
    },
    attachLifeCapsuleAnimations(pickup) {
      attached.pickups.push(pickup);
    },
    attachWeaponCapsuleAnimations(capsule) {
      attached.capsules.push(capsule);
    },
  };
  return { catalog, attached };
}

function mockHost() {
  const stages: unknown[] = [];
  let destroyed = false;
  const host: ScenePresentationHost = {
    setStage(stage) {
      stages.push(stage);
    },
    render() {},
    destroy() {
      destroyed = true;
    },
    fit() {},
    setDecorations() {},
    pixelScale: 2,
    stats: () => ({ draws: 1 }),
    uiLayer: {} as ScenePresentationHost["uiLayer"],
    worldOverlay: {} as ScenePresentationHost["worldOverlay"],
  };
  return {
    host,
    stages,
    isDestroyed: () => destroyed,
  };
}

test("dash smoke origin uses engine offsets and stable feet with reduced hitbox", () => {
  const full = { pos: { x: 100, y: 200 }, hh: BODY_HALF_H };
  const reduced = { pos: { x: 100, y: 204 }, hh: BODY_HALF_H - 4 };
  const dir = 1;

  assert.deepEqual(dashSmokeOrigin(full, dir), {
    x: 100 + DASH_FX_OFFSET_X * dir,
    y: 200 + BODY_HALF_H - BODY_HALF_H + DASH_FX_OFFSET_Y,
  });
  assert.deepEqual(dashSmokeOrigin(reduced, dir), {
    x: 100 + DASH_FX_OFFSET_X * dir,
    y: 204 + (BODY_HALF_H - 4) - BODY_HALF_H + DASH_FX_OFFSET_Y,
  });
  assert.equal(dashSmokeOrigin(full, dir).y, dashSmokeOrigin(reduced, dir).y);
  assert.deepEqual(dashSmokeOrigin(full, -1), {
    x: 100 + DASH_FX_OFFSET_X * -1,
    y: 200 + DASH_FX_OFFSET_Y,
  });
});

test("Dash and AirDash select DASH_TRAIL", () => {
  assert.equal(selectTrailStyle(stubPlayer("Dash")), DASH_TRAIL);
  assert.equal(selectTrailStyle(stubPlayer("AirDash")), DASH_TRAIL);
});

test("WallSlide selects WALLSLIDE_TRAIL", () => {
  assert.equal(selectTrailStyle(stubPlayer("WallSlide")), WALLSLIDE_TRAIL);
});

test("other player states do not sample a sprite trail", () => {
  assert.equal(selectTrailStyle(stubPlayer("Idle")), null);
  assert.equal(selectTrailStyle(stubPlayer("Jump")), null);
  assert.equal(selectTrailStyle(stubPlayer(null)), null);
});

test("attachEnemy is idempotent and a dynamic enemy gets one death burst", () => {
  const live = Scene.create({ seed: 2 });
  const { catalog, attached } = mockCatalog();
  const { host } = mockHost();
  const explosion = new EnemyExplosion();
  const debris = new EnemyDebris();
  const presentation = createScenePresentationWithHost(host, live, {
    assets: catalog,
    effects: { trail: new Trail(), smoke: new DashSmoke(), explosion, debris },
    debugOverlay: null,
  });

  const dynamic = spawnEnemy(
    "metool",
    live.world,
    live.player.pos.x + 80,
    live.player.pos.y,
    -1,
    99,
  );
  live.stage.add(dynamic);

  const animCountBefore = attached.enemies.length;
  presentation.attachEnemy(dynamic);
  presentation.attachEnemy(dynamic);
  assert.equal(attached.enemies.length, animCountBefore + 1);

  dynamic.events.emit("zero_health");
  assert.equal(explosion.puffs.length, ENEMY_EXPLOSION_PUFF_COUNT);
  assert.equal(debris.chunks.length, ENEMY_DEBRIS_COUNT);

  presentation.destroy();
});

test("bindScene attaches actors already present in the Scene", () => {
  const scene = Scene.create({ seed: 3 });
  assert.ok(scene.stage.enemies.length > 0);

  const { catalog, attached } = mockCatalog();
  const { host } = mockHost();
  createScenePresentationWithHost(host, scene, { assets: catalog, debugOverlay: null });

  assert.equal(attached.players.length, 1);
  assert.equal(attached.players[0], scene.player);
  assert.equal(attached.enemies.length, scene.stage.enemies.length);
  assert.equal(attached.pickups.length, scene.stage.pickups.length);
  assert.equal(attached.capsules.length, scene.stage.weaponCapsules.length);
});

test("rebinding clears every cosmetic effect and calls setStage", () => {
  const first = Scene.create({ seed: 4 });
  const second = Scene.create({ seed: 5 });
  const { catalog } = mockCatalog();
  const { host, stages } = mockHost();
  const trail = new Trail();
  const smoke = new DashSmoke();
  const explosion = new EnemyExplosion();
  const debris = new EnemyDebris();
  const presentation = createScenePresentationWithHost(host, first, {
    assets: catalog,
    effects: { trail, smoke, explosion, debris },
    debugOverlay: null,
  });

  smoke.spawn(1, 2, "dash", 1);
  explosion.spawn(3, 4);
  debris.spawn(5, 6);
  trail.sample(1 / 30, {
    x: 0,
    y: 0,
    region: { x: 0, y: 0, w: 1, h: 1 },
    facing: 1,
    layer: "normal",
  }, DASH_TRAIL);
  assert.ok(smoke.puffs.length > 0);
  assert.ok(explosion.puffs.length > 0);
  assert.ok(debris.chunks.length > 0);
  assert.ok(trail.ghosts.length > 0);
  assert.equal(stages.length, 1);
  assert.equal(stages[0], first.stage);

  presentation.bindScene(second);
  assert.equal(smoke.puffs.length, 0);
  assert.equal(explosion.puffs.length, 0);
  assert.equal(debris.chunks.length, 0);
  assert.equal(trail.ghosts.length, 0);
  assert.equal(stages.length, 2);
  assert.equal(stages[1], second.stage);

  presentation.destroy();
});

test("events from the old Scene are ignored after rebinding", () => {
  const first = Scene.create({ seed: 6 });
  const second = Scene.create({ seed: 7 });
  const { catalog } = mockCatalog();
  const { host } = mockHost();
  const smoke = new DashSmoke();
  const explosion = new EnemyExplosion();
  const debris = new EnemyDebris();
  const presentation = createScenePresentationWithHost(host, first, {
    assets: catalog,
    effects: { trail: new Trail(), smoke, explosion, debris },
    debugOverlay: null,
  });

  const oldPlayer = first.player;
  const oldEnemy = first.stage.enemies[0];
  assert.ok(oldEnemy);

  presentation.bindScene(second);

  oldPlayer.events.emit("dash_smoke", "dash", 1);
  oldEnemy.events.emit("zero_health");
  assert.equal(smoke.puffs.length, 0);
  assert.equal(explosion.puffs.length, 0);
  assert.equal(debris.chunks.length, 0);

  second.player.events.emit("dash_smoke", "dash", 1);
  assert.equal(smoke.puffs.length, 1);
  const expected = dashSmokeOrigin(second.player, 1);
  assert.equal(smoke.puffs[0].x, expected.x);
  assert.equal(smoke.puffs[0].y, expected.y);

  presentation.destroy();
});

test("stepCosmetics uses its dt argument rather than a hardcoded DT", () => {
  const scene = Scene.create({ seed: 8 });
  const { catalog } = mockCatalog();
  const { host } = mockHost();
  const smoke = new DashSmoke();
  const seen: number[] = [];
  const original = smoke.tick.bind(smoke);
  smoke.tick = (dt: number) => {
    seen.push(dt);
    original(dt);
  };
  const presentation = createScenePresentationWithHost(host, scene, {
    assets: catalog,
    effects: { trail: new Trail(), smoke, explosion: new EnemyExplosion(), debris: new EnemyDebris() },
    debugOverlay: null,
  });

  presentation.stepCosmetics(scene, 0.05);
  presentation.stepCosmetics(scene, 1 / 120);
  assert.deepEqual(seen, [0.05, 1 / 120]);

  presentation.destroy();
});

test("destroy releases the host and disables further presentation use", () => {
  const scene = Scene.create({ seed: 9 });
  const { catalog } = mockCatalog();
  const { host, isDestroyed } = mockHost();
  const smoke = new DashSmoke();
  const presentation = createScenePresentationWithHost(host, scene, {
    assets: catalog,
    effects: { trail: new Trail(), smoke, explosion: new EnemyExplosion(), debris: new EnemyDebris() },
    debugOverlay: null,
  });

  presentation.destroy();
  presentation.destroy();
  assert.equal(isDestroyed(), true);
  assert.throws(() => presentation.stepCosmetics(scene, 1 / 60), /destroyed/);
  assert.throws(() => presentation.bindScene(scene), /destroyed/);

  scene.player.events.emit("dash_smoke", "dash", 1);
  assert.equal(smoke.puffs.length, 0);
});

test("player animations attach exactly once across repeated bindScene calls", () => {
  const scene = Scene.create({ seed: 10 });
  const { catalog, attached } = mockCatalog();
  const { host } = mockHost();
  const presentation = createScenePresentationWithHost(host, scene, {
    assets: catalog,
    debugOverlay: null,
  });

  assert.equal(attached.players.length, 1);
  presentation.bindScene(scene);
  presentation.bindScene(scene);
  assert.equal(attached.players.length, 1);
  assert.equal(attached.players[0], scene.player);

  presentation.destroy();
});

test("decorations survive presentation rebinding", () => {
  const first = Scene.create({ seed: 11 });
  const second = Scene.create({ seed: 12 });
  const { catalog } = mockCatalog();
  const decorations: DecorationInstance[] = [
    { id: "d1", assetId: "prop.crate", x: 8, y: 8, layer: "world-front" },
  ];
  const seen: unknown[] = [];
  const { host } = mockHost();
  host.setDecorations = (instances) => {
    seen.push(instances);
  };

  const presentation = createScenePresentationWithHost(host, first, {
    assets: catalog,
    decorations,
    debugOverlay: null,
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0], decorations);

  presentation.bindScene(second);
  assert.equal(seen.length, 1);

  presentation.destroy();
});
