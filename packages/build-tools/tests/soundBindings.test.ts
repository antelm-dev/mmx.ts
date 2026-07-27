import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GAMEPLAY_SOUND_IDS } from "@mmx/browser-audio";
import {
  compileBrowserProjectBundle,
  compileStudioSoundBindings,
  planAssetEmission,
  ProjectBuildError,
  requireProject,
} from "../src/index.js";
import type { AssetEmissionPlan } from "../src/types.js";
import type { ProjectDocument } from "@mmx/project-schema";

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

test("starter bindings resolve every gameplay sound without legacy runtime preload ids", async () => {
  const studioRoot = process.env.MMX_STUDIO_ROOT;
  assert.ok(studioRoot, "MMX_STUDIO_ROOT must point at the Studio starter worktree");

  const templateRoot = path.join(studioRoot, "templates/mmx-starter");
  const project = await requireProject(templateRoot);
  const emission = await planAssetEmission(project);
  const bundle = await compileBrowserProjectBundle(project, emission);

  assert.ok(bundle.soundBindings);
  for (const runtimeName of GAMEPLAY_SOUND_IDS) {
    const assetId = bundle.soundBindings![runtimeName];
    assert.ok(assetId, `missing binding for ${runtimeName}`);
    assert.ok(bundle.assetUrls[assetId], `missing URL for ${runtimeName} → ${assetId}`);
    assert.ok(bundle.soundIds.includes(assetId));
    assert.equal(bundle.soundIds.includes(runtimeName), false);
  }
});

test("incomplete starter sound map fails before browser bootstrap", async () => {
  const studioRoot = process.env.MMX_STUDIO_ROOT;
  assert.ok(studioRoot, "MMX_STUDIO_ROOT must point at the Studio starter worktree");

  const templateRoot = path.join(studioRoot, "templates/mmx-starter");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-sound-bindings-"));
  try {
    await fs.cp(templateRoot, tempRoot, { recursive: true });
    const dataPath = path.join(tempRoot, "game/data.json");
    const data = JSON.parse(await fs.readFile(dataPath, "utf8")) as {
      bindings: { sounds: Record<string, string> };
    };
    delete data.bindings.sounds.jump;
    await fs.writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

    const project = await requireProject(tempRoot);
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
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
