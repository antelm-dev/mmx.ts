import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  GAMEPLAY_SOUND_IDS,
  OPTIONAL_GAMEPLAY_SOUND_IDS,
  STAGE_MUSIC_ID,
} from "@mmx/browser-audio";
import {
  compileBrowserProjectBundle,
  compileStudioSoundBindings,
  planAssetEmission,
  ProjectBuildError,
  requireProject,
} from "../src/index.js";
import type { AssetEmissionPlan } from "../src/types.js";
import type { ProjectDocument } from "@mmx/project-schema";
import { createStudioShapedFixture, soundAssetId } from "./helpers/createStudioShapedFixture.js";

function emissionFor(ids: string[]): AssetEmissionPlan {
  const assets = ids.map((assetId) => ({
    assetId,
    logicalPath: `assets/${assetId}.wav`,
    fileName: `${assetId}.wav`,
    publicUrl: `/assets/${assetId}.wav`,
    contentHash: "hash",
  }));
  return {
    assets,
    byId: Object.fromEntries(assets.map((asset) => [asset.assetId, asset])),
    byLogicalPath: Object.fromEntries(assets.map((asset) => [asset.logicalPath, asset])),
  };
}

function manifestWithSounds(
  entries: Array<{ id: string; kind?: ProjectDocument["assets"][number]["kind"] }>,
): ProjectDocument {
  return {
    schemaVersion: 1,
    id: "test.sounds",
    name: "Sounds",
    gameVersion: "0.1.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "level.main",
    levels: [{ id: "level.main", path: "levels/main.json" }],
    assets: entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind ?? "sound",
      path: `assets/${entry.id}.wav`,
    })),
  };
}

function completeStudioSounds(overrides: Record<string, string> = {}): Record<string, string> {
  const sounds = Object.fromEntries(
    GAMEPLAY_SOUND_IDS.map((runtimeName) => [runtimeName, `sfx.${runtimeName}`]),
  );
  return { ...sounds, ...overrides };
}

test("compileStudioSoundBindings accepts complete required mappings", () => {
  const sounds = completeStudioSounds();
  const ids = Object.values(sounds);
  const result = compileStudioSoundBindings(
    sounds,
    manifestWithSounds(ids.map((id) => ({ id }))),
    emissionFor(ids),
  );
  assert.equal(result.soundBindings.jump, "sfx.jump");
  assert.ok(result.soundIds.includes("sfx.jump"));
  assert.equal(result.soundIds.includes("jump"), false);
  assert.equal(result.soundIds.length, new Set(ids).size);
});

test("an optional gameplay sound is bound when present and never required", () => {
  for (const runtimeName of OPTIONAL_GAMEPLAY_SOUND_IDS) {
    assert.equal((GAMEPLAY_SOUND_IDS as readonly string[]).includes(runtimeName), false);
  }
  const sounds = completeStudioSounds({ slash: "sfx.slash" });
  const ids = Object.values(sounds);
  const result = compileStudioSoundBindings(
    sounds,
    manifestWithSounds(ids.map((id) => ({ id }))),
    emissionFor(ids),
  );
  assert.equal(result.soundBindings.slash, "sfx.slash");
  assert.ok(result.soundIds.includes("sfx.slash"));
});

test("stage music is optional and carried into the sound bindings when bound", () => {
  const sounds = completeStudioSounds();
  const ids = Object.values(sounds);
  const absent = compileStudioSoundBindings(
    sounds,
    manifestWithSounds(ids.map((id) => ({ id }))),
    emissionFor(ids),
  );
  assert.equal(absent.soundBindings[STAGE_MUSIC_ID], undefined);

  const withMusic = [...ids, "music.stage"];
  const bound = compileStudioSoundBindings(
    sounds,
    manifestWithSounds(withMusic.map((id) => ({ id }))),
    emissionFor(withMusic),
    { stage: "music.stage" },
  );
  assert.equal(bound.soundBindings[STAGE_MUSIC_ID], "music.stage");
  assert.ok(bound.soundIds.includes("music.stage"));
});

test("stage music bound to a missing asset fails the build", () => {
  const sounds = completeStudioSounds();
  const ids = Object.values(sounds);
  assert.throws(
    () =>
      compileStudioSoundBindings(
        sounds,
        manifestWithSounds(ids.map((id) => ({ id }))),
        emissionFor(ids),
        { stage: "music.missing" },
      ),
    (error: unknown) => {
      assert.ok(error instanceof ProjectBuildError);
      assert.match(error.message, /music\.stage/);
      assert.match(error.message, /music\.missing/);
      return true;
    },
  );
});

test("compileStudioSoundBindings rejects missing required runtime mapping", () => {
  const sounds = completeStudioSounds();
  delete sounds.jump;
  const ids = Object.values(sounds);
  assert.throws(
    () =>
      compileStudioSoundBindings(
        sounds,
        manifestWithSounds(ids.map((id) => ({ id }))),
        emissionFor(ids),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ProjectBuildError);
      assert.match(error.message, /jump/);
      assert.match(error.message, /logical asset ID/);
      return true;
    },
  );
});

test("compileStudioSoundBindings rejects missing target asset", () => {
  const sounds = completeStudioSounds({ jump: "sfx.missing" });
  const ids = Object.values(sounds).filter((id) => id !== "sfx.missing");
  assert.throws(
    () =>
      compileStudioSoundBindings(
        sounds,
        manifestWithSounds(ids.map((id) => ({ id }))),
        emissionFor(ids),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ProjectBuildError);
      assert.match(error.message, /jump/);
      assert.match(error.message, /sfx\.missing/);
      return true;
    },
  );
});

test("compileStudioSoundBindings rejects wrong-kind target", () => {
  const sounds = completeStudioSounds();
  const ids = Object.values(sounds);
  assert.throws(
    () =>
      compileStudioSoundBindings(
        sounds,
        manifestWithSounds(ids.map((id) => ({ id, kind: id === "sfx.jump" ? "sprite" : "sound" }))),
        emissionFor(ids),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ProjectBuildError);
      assert.match(error.message, /jump/);
      assert.match(error.message, /sfx\.jump/);
      assert.match(error.message, /sprite/);
      return true;
    },
  );
});

test("compileStudioSoundBindings rejects missing emitted URL", () => {
  const sounds = completeStudioSounds();
  const ids = Object.values(sounds);
  const emission = emissionFor(ids.filter((id) => id !== "sfx.jump"));
  assert.throws(
    () =>
      compileStudioSoundBindings(sounds, manifestWithSounds(ids.map((id) => ({ id }))), emission),
    (error: unknown) => {
      assert.ok(error instanceof ProjectBuildError);
      assert.match(error.message, /jump/);
      assert.match(error.message, /sfx\.jump/);
      assert.match(error.message, /emitted URL/);
      return true;
    },
  );
});

test("studio-shaped bindings resolve every gameplay sound without legacy runtime preload ids", async () => {
  const fixture = await createStudioShapedFixture();
  try {
    const project = await requireProject(fixture.root);
    const emission = await planAssetEmission(project);
    const bundle = await compileBrowserProjectBundle(project, emission);

    assert.ok(bundle.soundBindings);
    for (const runtimeName of GAMEPLAY_SOUND_IDS) {
      const assetId = bundle.soundBindings![runtimeName];
      assert.ok(assetId, `missing binding for ${runtimeName}`);
      assert.equal(assetId, soundAssetId(runtimeName));
      assert.ok(bundle.assetUrls[assetId], `missing URL for ${runtimeName} → ${assetId}`);
      assert.ok(bundle.soundIds.includes(assetId));
      assert.equal(bundle.soundIds.includes(runtimeName), false);
    }
  } finally {
    await fixture.dispose();
  }
});

test("studio-shaped project without playerPointingSheet compiles", async () => {
  const fixture = await createStudioShapedFixture("mmx-no-arm-sheet-");
  try {
    const dataPath = path.join(fixture.root, "game/data.json");
    const data = JSON.parse(await fs.readFile(dataPath, "utf8")) as {
      bindings: { playerPointingSheet?: string };
    };
    delete data.bindings.playerPointingSheet;
    await fs.writeFile(dataPath, JSON.stringify(data), "utf8");

    const project = await requireProject(fixture.root);
    const emission = await planAssetEmission(project);
    const bundle = await compileBrowserProjectBundle(project, emission);

    assert.equal(bundle.rendererBindings?.playerSheetPointing, undefined);
    assert.deepEqual(bundle.rendererManifest?.playerSheets, {
      normal: "sprite.fixture.player",
      pointing_cannon: "sprite.fixture.player",
    });
  } finally {
    await fixture.dispose();
  }
});

test("incomplete studio-shaped sound map fails before browser bootstrap", async () => {
  const fixture = await createStudioShapedFixture("mmx-sound-bindings-");
  try {
    const dataPath = path.join(fixture.root, "game/data.json");
    const data = JSON.parse(await fs.readFile(dataPath, "utf8")) as {
      bindings: { sounds: Record<string, string> };
    };
    delete data.bindings.sounds.jump;
    await fs.writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

    const project = await requireProject(fixture.root);
    const emission = await planAssetEmission(project);
    await assert.rejects(
      () => compileBrowserProjectBundle(project, emission),
      (error: unknown) => {
        assert.ok(error instanceof ProjectBuildError);
        assert.match(error.message, /jump/);
        return true;
      },
    );
  } finally {
    await fixture.dispose();
  }
});
