import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PROJECT_SCHEMA_VERSION,
  isLogicalId,
  isPortableRelativePath,
  migrateProject,
  normalizeProject,
  parseProject,
  serializeProject,
  validateProject,
  type ProjectDocument,
} from "../src/index.js";

function validProject(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "demo.project",
    name: "Demo",
    gameVersion: "1.0.0",
    compatibleRuntime: { min: "1.0.0", max: "2.0.0" },
    entryLevelId: "intro",
    levels: [
      { id: "boss", path: "levels/boss.json" },
      { id: "intro", path: "levels/intro.json" },
    ],
    assets: [
      { id: "font.ui", kind: "font", path: "assets/fonts/ui.ttf" },
      { id: "sfx.jump", kind: "sound", path: "assets/sounds/jump.wav" },
      {
        id: "sprite.hero",
        kind: "sprite",
        path: "assets/sprites/hero.png",
        region: [0, 0, 32, 32],
        anchor: [0.5, 1],
      },
      {
        id: "anim.hero",
        kind: "animation",
        path: "assets/sprites/hero.png",
        sheetAssetId: "sprite.hero",
        animations: {
          walk: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 32, 32], duration: 0.1 }],
          },
          idle: {
            loop: true,
            speed: 1,
            frames: [{ region: [32, 0, 32, 32], duration: 0.2 }],
          },
        },
      },
      { id: "image.bg", kind: "image", path: "assets/sprites/bg.png" },
    ],
    ...overrides,
  };
}

test("valid project parses and validates clean", () => {
  const parsed = parseProject(validProject());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.errorCount, 0);
  assert.ok(parsed.project);
});

test("migrateProject accepts current schema and rejects newer versions", () => {
  const doc = migrateProject(validProject());
  assert.equal(doc.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.throws(() => migrateProject({ schemaVersion: 99 }), /newer than supported/);
  assert.throws(() => migrateProject(null), /must be an object/);
});

test("rejects absolute paths, traversal, and backslashes", () => {
  const cases: Array<{ path: string; code: string }> = [
    { path: "/abs/hero.png", code: "path.absolute" },
    { path: "C:/abs/hero.png", code: "path.absolute" },
    { path: "file:hero.png", code: "path.absolute" },
    { path: "../hero.png", code: "path.traversal" },
    { path: "assets/../hero.png", code: "path.traversal" },
    { path: "assets\\hero.png", code: "path.separator" },
  ];

  for (const { path, code } of cases) {
    const result = validateProject(
      validProject({
        assets: [{ id: "bad.path", kind: "image", path }],
      }),
    );
    assert.ok(
      result.issues.some((issue) => issue.code === code && issue.path === "/assets/0/path"),
      `expected ${code} for ${path}`,
    );
  }
});

test("rejects malformed and duplicate ids", () => {
  assert.equal(isLogicalId("ok.id"), true);
  assert.equal(isLogicalId("1bad"), false);
  assert.equal(isLogicalId("bad/id"), false);

  const malformed = validateProject(validProject({ id: "1bad" }));
  assert.ok(
    malformed.issues.some((issue) => issue.code === "id.malformed" && issue.path === "/id"),
  );

  const duplicates = validateProject(
    validProject({
      assets: [
        { id: "same", kind: "image", path: "a.png" },
        { id: "same", kind: "sound", path: "b.wav" },
      ],
    }),
  );
  assert.ok(duplicates.issues.some((issue) => issue.code === "asset.id.duplicate"));
});

test("rejects unsupported schema versions through parseProject", () => {
  const parsed = parseProject({ ...validProject(), schemaVersion: 99 });
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.some((issue) => issue.code === "schema.parse"));
});

test("entry level must reference a known level", () => {
  const result = validateProject(validProject({ entryLevelId: "missing" }));
  assert.ok(result.issues.some((issue) => issue.code === "entryLevel.unknown"));
});

test("animation sheetAssetId must resolve to image or sprite", () => {
  const result = validateProject(
    validProject({
      assets: [
        { id: "sfx.jump", kind: "sound", path: "assets/sounds/jump.wav" },
        {
          id: "anim.hero",
          kind: "animation",
          path: "assets/anims/hero.json",
          sheetAssetId: "sfx.jump",
          animations: {
            idle: {
              loop: true,
              speed: 1,
              frames: [{ region: [0, 0, 8, 8], duration: 0.1 }],
            },
          },
        },
      ],
    }),
  );
  assert.ok(result.issues.some((issue) => issue.code === "animation.sheet.kind"));
});

test("serialization is deterministic regardless of input order", () => {
  const a = validProject();
  const b = validProject({
    levels: [
      { id: "intro", path: "levels/intro.json" },
      { id: "boss", path: "levels/boss.json" },
    ],
    assets: [...validProject().assets].reverse(),
  });

  const left = serializeProject(a);
  const right = serializeProject(b);
  assert.equal(left, right);

  const again = serializeProject(JSON.parse(left) as ProjectDocument);
  assert.equal(again, left);

  const normalized = normalizeProject(b);
  assert.deepEqual(
    normalized.levels.map((level) => level.id),
    ["boss", "intro"],
  );
  assert.deepEqual(
    normalized.assets.map((asset) => asset.id),
    ["anim.hero", "font.ui", "image.bg", "sfx.jump", "sprite.hero"],
  );
  const anim = normalized.assets.find((asset) => asset.id === "anim.hero");
  assert.ok(anim && anim.kind === "animation");
  assert.deepEqual(Object.keys(anim.animations), ["idle", "walk"]);
});

test("isPortableRelativePath helper matches validation rules", () => {
  assert.equal(isPortableRelativePath("assets/x.png"), true);
  assert.equal(isPortableRelativePath("../x.png"), false);
  assert.equal(isPortableRelativePath("/x.png"), false);
  assert.equal(isPortableRelativePath("C:/x.png"), false);
});
