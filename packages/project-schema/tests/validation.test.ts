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
  type AnimationClip,
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

test("serialization is deterministic regardless of asset order and keeps the level order", () => {
  const a = validProject();
  const b = validProject({ assets: [...validProject().assets].reverse() });

  const left = serializeProject(a);
  const right = serializeProject(b);
  assert.equal(left, right);

  const again = serializeProject(JSON.parse(left) as ProjectDocument);
  assert.equal(again, left);

  const reordered = validProject({
    levels: [
      { id: "intro", path: "levels/intro.json" },
      { id: "boss", path: "levels/boss.json" },
    ],
  });
  assert.deepEqual(
    normalizeProject(reordered).levels.map((level) => level.id),
    ["intro", "boss"],
  );

  const normalized = normalizeProject(b);
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
      (issue) => issue.code === "version.malformed" && issue.path === "/compatibleRuntime/min",
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
  assert.equal(
    equalWithBuild.issues.some((issue) => issue.code === "runtime.range"),
    false,
  );

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

test("animation loopStart is validated and survives serialization", () => {
  const withLoopStart = (loopStart: number): ProjectDocument =>
    validProject({
      assets: [
        {
          id: "anim.hero",
          kind: "animation",
          path: "assets/anims/hero.json",
          animations: {
            run: {
              loop: true,
              loopStart,
              speed: 1,
              frames: [
                { region: [0, 0, 8, 8], duration: 0.1 },
                { region: [8, 0, 8, 8], duration: 0.1 },
                { region: [16, 0, 8, 8], duration: 0.1 },
              ],
            },
          },
        },
      ],
    });

  for (const bad of [-1, 3, 1.5]) {
    const issues = validateProject(withLoopStart(bad)).issues;
    assert.ok(
      issues.some((issue) => issue.code === "animation.loopStart"),
      `loopStart ${bad}`,
    );
  }

  const good = withLoopStart(2);
  assert.ok(!validateProject(good).issues.some((issue) => issue.code === "animation.loopStart"));
  const reparsed = JSON.parse(serializeProject(good)) as ProjectDocument;
  const anim = reparsed.assets.find((asset) => asset.id === "anim.hero");
  assert.ok(anim && anim.kind === "animation");
  assert.equal(anim.animations.run?.loopStart, 2);
});

test("animation segments are validated and survive serialization", () => {
  const withSegments = (segments: unknown, extra: Record<string, unknown> = {}): ProjectDocument =>
    validProject({
      assets: [
        {
          id: "anim.door",
          kind: "animation",
          path: "assets/anims/door.json",
          animations: {
            door: {
              loop: false,
              speed: 1,
              frames: [0, 8, 16, 24].map((x) => ({
                region: [x, 0, 8, 8] as const,
                duration: 0.1,
              })),
              segments,
              ...extra,
            } as AnimationClip,
          },
        },
      ],
    });
  const segment = (name: string, start: number, end: number, loop = false) => ({
    name,
    start,
    end,
    loop,
  });
  const has = (project: ProjectDocument) =>
    validateProject(project).issues.some((issue) => issue.code === "animation.segments");

  const bad: [string, unknown][] = [
    ["empty", []],
    ["gap", [segment("a", 0, 0), segment("b", 2, 3)]],
    ["short", [segment("a", 0, 2)]],
    ["duplicate", [segment("a", 0, 1), segment("a", 2, 3)]],
    ["hash", [segment("a#b", 0, 3)]],
    ["blank", [segment("", 0, 3)]],
  ];
  for (const [why, segments] of bad) assert.ok(has(withSegments(segments)), why);
  const segments = [segment("intro", 0, 0), segment("loop", 1, 2, true), segment("end", 3, 3)];
  assert.ok(has(withSegments(segments, { loopStart: 1 })), "segments replace loopStart");

  const good = withSegments(segments);
  assert.ok(!has(good));
  const reparsed = JSON.parse(serializeProject(good)) as ProjectDocument;
  const anim = reparsed.assets.find((asset) => asset.id === "anim.door");
  assert.ok(anim && anim.kind === "animation");
  assert.deepEqual(anim.animations.door?.segments, segments);
});

test("frame anchor is validated inside its region and survives serialization", () => {
  const withAnchor = (anchor: unknown): ProjectDocument =>
    validProject({
      assets: [
        {
          id: "anim.hero",
          kind: "animation",
          path: "assets/anims/hero.json",
          animations: {
            idle: {
              loop: true,
              speed: 60,
              frames: [{ region: [0, 0, 34, 39], duration: 6, anchor: anchor as [number, number] }],
            },
          },
        },
      ],
    });

  for (const bad of [[-1, 0], [35, 0], [0, 40], [1.5, 2], [1], "19,35"]) {
    const issues = validateProject(withAnchor(bad)).issues;
    assert.ok(
      issues.some((issue) => issue.code === "animation.anchor"),
      `anchor ${JSON.stringify(bad)}`,
    );
  }

  for (const edge of [
    [0, 0],
    [34, 39],
  ]) {
    assert.ok(!validateProject(withAnchor(edge)).issues.some((i) => i.code === "animation.anchor"));
  }
  const good = withAnchor([19, 35]);
  const parsed = parseProject(JSON.parse(serializeProject(good)));
  assert.equal(parsed.ok, true);
  const anim = parsed.project!.assets.find((asset) => asset.id === "anim.hero");
  assert.ok(anim && anim.kind === "animation");
  assert.deepEqual(anim.animations.idle?.frames[0]?.anchor, [19, 35]);
  assert.equal(serializeProject(parsed.project!), serializeProject(good));
});

test("player.loadout is optional, validated against known loadouts, and serialized", () => {
  const loadoutIds = ["player.x", "player.zero"];
  assert.equal(parseProject(validProject(), { loadoutIds }).ok, true);
  assert.equal(serializeProject(validProject()).includes('"player"'), false);

  const zero = validProject({ player: { loadout: "player.zero" } });
  const parsed = parseProject(JSON.parse(serializeProject(zero)), { loadoutIds });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.project?.player, { loadout: "player.zero" });

  const unknown = parseProject(validProject({ player: { loadout: "player.vile" } }), {
    loadoutIds,
  });
  assert.equal(unknown.ok, false);
  assert.deepEqual(
    unknown.issues.map((issue) => [issue.code, issue.path]),
    [["reference.invalid", "/player/loadout"]],
  );
  assert.match(unknown.issues[0]!.message, /'player\.vile'.*player\.x, player\.zero/);

  // Without known ids only the shape is checked.
  assert.equal(validateProject(validProject({ player: { loadout: "player.vile" } })).ok, true);
  const malformed = validateProject({
    ...validProject(),
    player: { loadout: "" },
  });
  assert.deepEqual(
    malformed.issues.map((issue) => issue.code),
    ["id.missing"],
  );
  assert.deepEqual(
    validateProject({
      ...validProject(),
      player: "player.zero",
    } as unknown as ProjectDocument).issues.map((issue) => issue.code),
    ["player.object"],
  );
});

test("tileset assets validate tileSize, columns, collision and slopes, and serialize sorted", () => {
  const tileset = {
    id: "tiles.stage",
    kind: "tileset" as const,
    path: "assets/tiles/stage.png",
    tileSize: 16,
    columns: 4,
    collision: { 3: 2, 0: 1 },
    slopes: { 3: [0, 8] as const },
  };
  const ok = parseProject(validProject({ assets: [tileset] }), { terrainTiles: [0, 1, 2, 3] });
  assert.equal(ok.ok, true);
  const out = JSON.parse(serializeProject(validProject({ assets: [tileset] })));
  assert.deepEqual(Object.keys(out.assets[0].collision), ["0", "3"]);
  assert.equal(out.assets[0].columns, 4);

  const bad = validateProject(
    validProject({
      assets: [
        {
          ...tileset,
          tileSize: 0,
          columns: 1.5,
          collision: { "-1": 1, 2: 9, x: 1 },
          slopes: { 1: [0] },
        } as never,
      ],
    }),
    { terrainTiles: [0, 1, 2, 3] },
  );
  const codes = bad.issues.map((issue) => issue.code);
  assert.ok(codes.includes("tileset.tileSize"));
  assert.ok(codes.includes("tileset.columns"));
  assert.equal(codes.filter((code) => code === "tileset.collision").length, 3);
  assert.ok(codes.includes("tileset.slopes"));
  // Without the TerrainTile list only the shape is checked.
  assert.equal(
    validateProject(validProject({ assets: [{ ...tileset, collision: { 0: 9 } }] })).ok,
    true,
  );
});

test("sprite regions round-trip, are validated, and stay absent when unset", () => {
  assert.equal(serializeProject(validProject()).includes('"regions"'), false);

  const withRegions = (regions: unknown): ProjectDocument => {
    const project = validProject();
    const assets = project.assets.map((asset) =>
      asset.id === "sprite.hero" ? { ...asset, regions } : asset,
    );
    return { ...project, assets } as ProjectDocument;
  };
  const regions = [
    { id: "b", region: [32, 0, 16, 24] },
    { id: "a", region: [0, 0, 32, 32] },
  ];
  const parsed = parseProject(JSON.parse(serializeProject(withRegions(regions))));
  assert.equal(parsed.ok, true);
  const sprite = parsed.project?.assets.find((asset) => asset.id === "sprite.hero");
  assert.deepEqual(sprite?.kind === "sprite" ? sprite.regions : undefined, regions);

  const codes = (value: unknown) =>
    validateProject(withRegions(value)).issues.map((issue) => [issue.code, issue.path]);
  assert.deepEqual(
    codes([
      { id: "a", region: [0, 0, 8, 8] },
      { id: "a", region: [8, 0, 8, 8] },
    ]),
    [["sprite.regions", "/assets/2/regions/1/id"]],
  );
  assert.deepEqual(codes([{ id: "a", region: [0, 0, 0, 8] }]), [
    ["region.invalid", "/assets/2/regions/0/region"],
  ]);
  assert.deepEqual(codes([{ id: "", region: [0, 0, 8, 8] }]), [
    ["sprite.regions", "/assets/2/regions/0"],
  ]);
  assert.deepEqual(codes({}), [["sprite.regions", "/assets/2/regions"]]);
});

test("objects are optional, shape-checked and serialized sorted", () => {
  assert.equal(serializeProject(validProject()).includes('"objects"'), false);

  const fast = {
    id: "obj.fast",
    name: "Fast platform",
    base: "platform.moving",
    values: { Speed: 120 },
    exposed: ["Travel"],
  };
  const slow = { id: "obj.slow", name: "Slow platform", base: "platform.moving" };
  const parsed = parseProject(
    JSON.parse(serializeProject(validProject({ objects: [slow, fast] }))),
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.project?.objects, [fast, slow]);

  const bad = validateProject({
    ...validProject(),
    objects: [
      fast,
      { ...fast },
      { id: "obj.x", name: "", base: "", values: [], exposed: [1] },
      "nope",
    ],
  } as unknown as ProjectDocument);
  assert.deepEqual(
    bad.issues.map((issue) => [issue.code, issue.path]),
    [
      ["id.duplicate", "/objects/1/id"],
      ["name.missing", "/objects/2/name"],
      ["id.missing", "/objects/2/base"],
      ["object.values", "/objects/2/values"],
      ["object.exposed", "/objects/2/exposed"],
      ["object.shape", "/objects/3"],
    ],
  );
});

test("packs are optional, kept in order and kept when empty, and shape-checked", () => {
  assert.equal(serializeProject(validProject()).includes('"packs"'), false);
  const roundTrip = (packs: ProjectDocument["packs"]) =>
    parseProject(JSON.parse(serializeProject(validProject({ packs })))).project?.packs;
  assert.deepEqual(roundTrip([]), []);
  const packs = [
    { id: "mmx-starter", version: 1 },
    { id: "a.pack", version: 3 },
  ];
  assert.deepEqual(roundTrip(packs), packs);

  const codes = (value: unknown) =>
    validateProject({ ...validProject(), packs: value } as unknown as ProjectDocument).issues.map(
      (issue) => [issue.code, issue.path],
    );
  assert.deepEqual(codes({}), [["packs.array", "/packs"]]);
  assert.deepEqual(
    codes([packs[0], { ...packs[0] }, { id: "", version: 0 }, { id: "x", version: 1.5 }, "nope"]),
    [
      ["id.duplicate", "/packs/1/id"],
      ["id.missing", "/packs/2/id"],
      ["pack.version", "/packs/2/version"],
      ["pack.version", "/packs/3/version"],
      ["pack.shape", "/packs/4"],
    ],
  );
});

test("frame hurtbox and hitboxes are validated and survive serialization", () => {
  const withBoxes = (frame: Record<string, unknown>): ProjectDocument =>
    validProject({
      assets: [
        {
          id: "anim.hero",
          kind: "animation",
          path: "assets/anims/hero.json",
          animations: {
            idle: {
              loop: true,
              speed: 60,
              frames: [{ region: [0, 0, 34, 39], duration: 6, ...frame }],
            },
          },
        },
      ],
    });

  for (const bad of [{ x: 0, y: 0, w: 0, h: 4 }, { x: 0.5, y: 0, w: 4, h: 4 }, [0, 0, 4, 4]]) {
    const issues = validateProject(withBoxes({ hurtbox: bad, hitboxes: [bad] })).issues;
    assert.ok(issues.some((i) => i.code === "animation.box" && i.path.endsWith("/hurtbox")));
    assert.ok(issues.some((i) => i.code === "animation.box" && i.path.endsWith("/hitboxes/0")));
  }
  assert.ok(
    validateProject(withBoxes({ hitboxes: { x: 0, y: 0, w: 4, h: 4 } })).issues.some(
      (i) => i.code === "animation.box",
    ),
  );

  const good = withBoxes({
    hurtbox: { x: -8, y: -20, w: 16, h: 20 },
    hitboxes: [{ x: 4, y: -10, w: 12, h: 6 }],
  });
  const parsed = parseProject(JSON.parse(serializeProject(good)));
  assert.equal(parsed.ok, true);
  const anim = parsed.project!.assets.find((asset) => asset.id === "anim.hero");
  assert.ok(anim && anim.kind === "animation");
  const frame = anim.animations.idle?.frames[0];
  assert.deepEqual(frame?.hurtbox, { x: -8, y: -20, w: 16, h: 20 });
  assert.deepEqual(frame?.hitboxes, [{ x: 4, y: -10, w: 12, h: 6 }]);
  assert.equal(serializeProject(parsed.project!), serializeProject(good));
  assert.deepEqual(normalizeProject(good), JSON.parse(serializeProject(good)));
});
