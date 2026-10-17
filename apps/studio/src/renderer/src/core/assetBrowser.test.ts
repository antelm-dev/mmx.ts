import { describe, expect, it } from "vitest";
import { GAME_DATA, mergeGameData } from "@mmx/engine/data";
import type { ProjectAsset } from "@mmx/project-schema";
import { assetGroups } from "./assetBrowser.js";
import { addEnemy, projectGameData } from "./gameData.js";
import { addBlankEnemy, BLANK_ENEMY } from "./enemyEditor.js";
import { MMX_GAME_DATA, MMX_OVERLAY } from "./mmx.test-support.js";

const assets: ProjectAsset[] = [
  { id: "sprite.b", kind: "sprite", path: "b.png" },
  { id: "sprite.a", kind: "sprite", path: "a.png" },
  { id: "tiles.ground", kind: "tileset", path: "t.png", tileSize: 16, collision: {} },
  { id: "anim.a", kind: "animation", path: "a.png", animations: {} },
  { id: "sfx.jump", kind: "sound", path: "j.wav" },
];
const objects = [{ id: "obj.lift", name: "Lift", base: "platform.moving" }];
// A project made from the template: it carries the MMX Starter pack.
const crab = addEnemy(MMX_OVERLAY, MMX_GAME_DATA, {
  name: "Crab",
  base: "metool",
  sheet: "anim.a",
  health: 3,
  touchDamage: 2,
});
const data = projectGameData(crab.overlay).data;

describe("asset browser groups", () => {
  it("groups manifest assets, enemies and objects in browser order, sorted by label", () => {
    const groups = assetGroups({ assets, objects }, data, "");
    expect(groups.map((g) => g.label)).toEqual([
      "Tilesets",
      "Sprites",
      "Animations",
      "Sounds",
      "Enemies",
      "Objects",
    ]);
    expect(groups[1]!.entries.map((e) => e.id)).toEqual(["sprite.a", "sprite.b"]);
    const enemies = groups.find((g) => g.kind === "enemy")!.entries;
    expect(enemies.map((e) => e.label)).toEqual([...enemies.map((e) => e.label)].sort());
    expect(groups.at(-1)!.entries).toEqual([
      { kind: "object", id: "obj.lift", label: "Lift", builtIn: false },
    ]);
  });

  it("flags built-in enemies, not the project's: the pack's, once copied, are the project's", () => {
    const enemies = assetGroups(undefined, data, "", crab.overlay).find(
      (g) => g.kind === "enemy",
    )!.entries;
    expect(enemies.find((e) => e.id === "enemy.metool")).toMatchObject({ builtIn: false });
    const noOverlay = assetGroups(undefined, data, "").find((g) => g.kind === "enemy")!.entries;
    expect(noOverlay.find((e) => e.id === "enemy.metool")).toMatchObject({ builtIn: true });
    expect(enemies.find((e) => e.id === crab.id)).toMatchObject({ label: "Crab", builtIn: false });
  });

  it("filters on label or id and drops empty groups; without a project only enemies remain", () => {
    expect(assetGroups({ assets, objects }, data, "CRAB", crab.overlay)).toEqual([
      {
        kind: "enemy",
        label: "Enemies",
        entries: [{ kind: "enemy", id: crab.id, label: "Crab", builtIn: false }],
      },
    ]);
    expect(assetGroups({ assets, objects }, data, "sprite.a")[0]!.entries).toHaveLength(1);
    expect(assetGroups(undefined, data, "").map((g) => g.kind)).toEqual(["enemy"]);
  });

  it("lists only the project's enemies over a base without the pack's", () => {
    const base = GAME_DATA;
    const blob = addBlankEnemy(undefined, base, {
      name: "Blob",
      health: 2,
      enemy: { ...BLANK_ENEMY, sheet: "anim.a" },
    });
    expect(assetGroups(undefined, base, "")).toEqual([]);
    const merged = mergeGameData(base, blob.overlay);
    if (!merged.ok) throw new Error("merge failed");
    expect(assetGroups(undefined, merged.value, "", blob.overlay)).toEqual([
      {
        kind: "enemy",
        label: "Enemies",
        entries: [{ kind: "enemy", id: blob.id, label: "Blob", builtIn: false }],
      },
    ]);
  });
});
