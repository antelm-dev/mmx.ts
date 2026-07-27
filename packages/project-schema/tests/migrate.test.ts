import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PROJECT_SCHEMA_VERSION,
  migrateProject,
  parseProject,
  serializeProject,
  type ProjectDocument,
} from "../src/index.js";

const fixture: ProjectDocument = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "roundtrip.project",
  name: "Roundtrip",
  gameVersion: "0.1.0",
  compatibleRuntime: { min: "0.1.0" },
  entryLevelId: "one",
  levels: [{ id: "one", path: "levels/one.json" }],
  assets: [
    { id: "img.a", kind: "image", path: "assets/a.png" },
    {
      id: "anim.a",
      kind: "animation",
      path: "assets/a.png",
      sheetAssetId: "img.a",
      animations: {
        z: {
          loop: false,
          speed: 2,
          frames: [{ region: [0, 0, 4, 4], duration: 1, armRegion: [1, 1, 2, 2] }],
        },
        a: {
          loop: true,
          speed: 1,
          frames: [{ region: [4, 0, 4, 4], duration: 0.5 }],
        },
      },
    },
  ],
};

test("migrate + serialize round-trip is stable", () => {
  const json = serializeProject(fixture);
  const back = migrateProject(JSON.parse(json));
  assert.equal(back.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(serializeProject(back), json);

  const parsed = parseProject(JSON.parse(json));
  assert.equal(parsed.ok, true);
  assert.equal(serializeProject(parsed.project!), json);
});
