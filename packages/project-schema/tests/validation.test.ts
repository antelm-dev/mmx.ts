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

const validLevel = { id: "intro", path: "levels/intro.json" };
const validImage = { id: "image.bg", kind: "image", path: "assets/sprites/bg.png" };
const validAnim = {
  id: "anim.hero",
  kind: "animation",
  path: "assets/anims/hero.json",
  sheetAssetId: "image.bg",
  animations: {
    idle: {
      loop: true,
      speed: 1,
      frames: [{ region: [0, 0, 8, 8], duration: 0.1 }],
    },
  },
};

test("parseProject stays total for malformed levels, assets, and references", () => {
  const cases: Array<{
    name: string;
    overrides: Record<string, unknown>;
    expectedCodes: string[];
  }> = [
    {
      name: "null asset entry",
      overrides: { assets: [null] },
      expectedCodes: ["asset.object"],
    },
    {
      name: "primitive asset entries",
      overrides: { assets: [42, "image", true] },
      expectedCodes: ["asset.object", "asset.object", "asset.object"],
    },
    {
      name: "array asset entry",
      overrides: { assets: [[validImage]] },
      expectedCodes: ["asset.object"],
    },
    {
      name: "partially shaped asset object",
      overrides: { assets: [{ kind: "sprite" }] },
      expectedCodes: ["id.missing", "path.missing"],
    },
    {
      name: "null level entry",
      overrides: { levels: [null], assets: [] },
      expectedCodes: ["level.object"],
    },
    {
      name: "primitive and array level entries",
      overrides: { levels: [1, "intro", [validLevel]], assets: [] },
      expectedCodes: ["level.object", "level.object", "level.object"],
    },
    {
      name: "partially shaped level object",
      overrides: { levels: [{ id: "intro" }], assets: [] },
      expectedCodes: ["path.missing"],
    },
    {
      name: "animation with unknown sheetAssetId",
      overrides: {
        assets: [
          {
            ...validAnim,
            sheetAssetId: "missing.sheet",
          },
        ],
      },
      expectedCodes: ["animation.sheet.unknown"],
    },
    {
      name: "animation with wrong sheet kind",
      overrides: {
        assets: [
          { id: "sfx.jump", kind: "sound", path: "assets/sounds/jump.wav" },
          { ...validAnim, sheetAssetId: "sfx.jump" },
        ],
      },
      expectedCodes: ["animation.sheet.kind"],
    },
    {
      name: "mixed valid and invalid assets including null",
      overrides: {
        assets: [null, validImage, 7, validAnim, { id: "bad", kind: "nope", path: "x.png" }],
      },
      expectedCodes: ["asset.object", "asset.object", "asset.kind"],
    },
    {
      name: "null among assets used by sheet lookup",
      overrides: {
        assets: [null, validImage, validAnim],
      },
      expectedCodes: ["asset.object"],
    },
  ];

  for (const { name, overrides, expectedCodes } of cases) {
    const raw = {
      ...validProject(),
      ...overrides,
    };
    let parsed: ReturnType<typeof parseProject> | undefined;
    assert.doesNotThrow(() => {
      parsed = parseProject(raw);
    }, name);
    assert.ok(parsed, name);
    assert.equal(parsed.ok, false, name);
    for (const code of expectedCodes) {
      assert.ok(
        parsed.issues.some((issue) => issue.code === code),
        `${name}: expected code ${code}, got ${parsed.issues.map((issue) => issue.code).join(", ")}`,
      );
    }
  }
});

test("accepts valid core, prerelease, and build metadata versions", () => {
  const validVersions = [
    "0.0.0",
    "1.0.0",
    "1.2.3",
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-0.3.7",
    "1.0.0-x.7.z.92",
    "1.0.0-alpha+001",
    "1.0.0+20130313144700",
    "1.0.0-beta+exp.sha.5114f85",
    "1.0.0+21AF26D3----117B344092BD",
  ];

  for (const gameVersion of validVersions) {
    const result = validateProject(validProject({ gameVersion }));
    assert.equal(
      result.issues.some((issue) => issue.path === "/gameVersion"),
      false,
      `expected ${gameVersion} to be accepted`,
    );
  }
});

test("rejects invalid core, prerelease, and build metadata versions", () => {
  const invalidVersions = [
    "01.0.0",
    "1.0",
    "1",
    "v1.0.0",
    "1.0.0-",
    "1.0.0+",
    "1.0.0-..",
    "1.0.0-alpha..1",
    "1.0.0-01",
    "1.0.0-alpha_beta",
    "1.0.0+build!",
  ];

  for (const gameVersion of invalidVersions) {
    const result = validateProject(validProject({ gameVersion }));
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "version.malformed" && issue.path === "/gameVersion",
      ),
      `expected ${gameVersion} to be rejected`,
    );
  }
});

test("rejects numeric prerelease identifiers with leading zeroes", () => {
  const result = validateProject(
    validProject({
      gameVersion: "1.0.0-01",
      compatibleRuntime: { min: "1.0.0-01.0" },
    }),
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "version.malformed" && issue.path === "/gameVersion",
    ),
  );
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === "version.malformed" && issue.path === "/compatibleRuntime/min",
    ),
  );
});

test("compatibleRuntime compares prerelease precedence and ignores build metadata", () => {
  const releaseAfterPrerelease = validateProject(
    validProject({
      compatibleRuntime: { min: "1.0.0-alpha", max: "1.0.0" },
    }),
  );
  assert.equal(
    releaseAfterPrerelease.issues.some((issue) => issue.code === "runtime.range"),
    false,
  );

  const equalWithBuild = validateProject(
    validProject({
      compatibleRuntime: { min: "1.0.0+build.1", max: "1.0.0+build.2" },
    }),
  );
  assert.equal(equalWithBuild.issues.some((issue) => issue.code === "runtime.range"), false);

  const invertedPrerelease = validateProject(
    validProject({
      compatibleRuntime: { min: "1.0.0", max: "1.0.0-alpha" },
    }),
  );
  assert.ok(
    invertedPrerelease.issues.some(
      (issue) => issue.code === "runtime.range" && issue.path === "/compatibleRuntime/max",
    ),
  );

  const invertedCore = validateProject(
    validProject({
      compatibleRuntime: { min: "2.0.0", max: "1.0.0" },
    }),
  );
  assert.ok(
    invertedCore.issues.some(
      (issue) => issue.code === "runtime.range" && issue.path === "/compatibleRuntime/max",
    ),
  );
});

