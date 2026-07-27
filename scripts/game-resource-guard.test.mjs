import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { findForbiddenGameResourceRefs, scanGameResourceText } from "./check-game-resources.mjs";

describe("game resource guard", () => {
  test("allows isolated test fixtures", () => {
    const hits = scanGameResourceText('{"animations":{"idle":{"loop":true}}}');
    assert.deepEqual(hits, []);
  });

  test("rejects root resources imports", () => {
    const hits = scanGameResourceText('const url = "../../../resources/sprites/player/x.png";\n');
    assert.ok(hits.some((hit) => hit.includes("root resources/")));
    assert.ok(hits.some((hit) => hit.includes("hard-coded MMX sprite path")));
  });

  test("rejects builtin catalog fallbacks", () => {
    const hits = scanGameResourceText(
      'import { createBuiltinRendererAssetManifest } from "./builtinCatalog.js";\n',
    );
    assert.ok(hits.some((hit) => hit.includes("builtin renderer catalog")));
  });

  test("detects builtin sound resolver usage", () => {
    const hits = scanGameResourceText(
      'import { createBuiltinSoundResolver } from "./builtinSoundResolver.js";\n',
    );
    assert.ok(hits.some((hit) => hit.includes("builtin sound resolver")));
  });

  test("repository source has no forbidden game resource references", () => {
    assert.deepEqual(findForbiddenGameResourceRefs(), []);
  });
});
