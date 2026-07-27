import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectDocument } from "@mmx/project-schema";
import { createProjectSoundResolver, SoundAssetError } from "../src/SoundAssetResolver.js";

const manifest: Pick<ProjectDocument, "assets"> = {
  assets: [
    { id: "jump", kind: "sound", path: "assets/sounds/player/jump.wav" },
    { id: "dash", kind: "sound", path: "assets/sounds/player/dash.wav" },
    { id: "x.sheet", kind: "image", path: "assets/sprites/player/x.png" },
  ],
};

test("createProjectSoundResolver resolves portable sound paths against baseUrl", () => {
  const resolver = createProjectSoundResolver(manifest, "https://cdn.example/game/");
  assert.equal(
    resolver.resolveUrl("jump"),
    "https://cdn.example/game/assets/sounds/player/jump.wav",
  );
});

test("createProjectSoundResolver rejects missing sound ids", () => {
  const resolver = createProjectSoundResolver(manifest, "https://cdn.example/game/");
  assert.throws(
    () => resolver.resolveUrl("missing"),
    (error: unknown) => {
      assert.ok(error instanceof SoundAssetError);
      assert.equal(error.code, "missing");
      assert.equal(error.soundId, "missing");
      return true;
    },
  );
});

test("createProjectSoundResolver rejects non-sound assets", () => {
  const resolver = createProjectSoundResolver(manifest, "https://cdn.example/game/");
  assert.throws(
    () => resolver.resolveUrl("x.sheet"),
    (error: unknown) => {
      assert.ok(error instanceof SoundAssetError);
      assert.equal(error.code, "wrong-kind");
      assert.equal(error.soundId, "x.sheet");
      return true;
    },
  );
});
