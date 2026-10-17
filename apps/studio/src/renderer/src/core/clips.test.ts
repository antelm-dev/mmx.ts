import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENEMY_BEHAVIOR_SCHEMAS } from "@mmx/engine/behaviors";
import { GAME_DATA } from "@mmx/engine/data";
import type { AnimationAsset, AnimationFrame } from "@mmx/project-schema";
import { addBlankEnemy, BLANK_ENEMY } from "./enemyEditor.js";
import {
  boxFromPoints,
  canDeleteClip,
  copyBoxes,
  ENEMY_ABILITY_CLIPS,
  enemyClipIssues,
  enemyClips,
  feetAnchor,
  moveBox,
  moveItem,
  requiredPlayerClips,
  withBoxes,
} from "./clips.js";

describe("clips helpers", () => {
  it("anchors the feet at the bottom-centre of the opaque pixels", () => {
    const width = 8;
    const px = new Uint8ClampedArray(width * 8 * 4);
    // Opaque block x 2..4, y 1..5 inside the region [1, 0, 6, 8].
    for (let y = 1; y <= 5; y++) for (let x = 2; x <= 4; x++) px[(y * width + x) * 4 + 3] = 255;
    expect(feetAnchor(px, width, [1, 0, 6, 8])).toEqual([3, 6]);
    expect(feetAnchor(new Uint8ClampedArray(px.length), width, [0, 0, 6, 8])).toEqual([3, 8]);
  });

  it("keeps the last clip of the bound player animation", () => {
    expect(canDeleteClip(1, true)).toBe(false);
    expect(canDeleteClip(2, true)).toBe(true);
    expect(canDeleteClip(1, false)).toBe(true);
  });

  it("moves a frame", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });

  it("lists the clips each loadout plays", () => {
    expect(requiredPlayerClips().sort()).toEqual([
      "beam",
      "beam_equip",
      "beam_in",
      "damage",
      "dash",
      "fall",
      "idle",
      "jump",
      "recover",
      "slide",
      "walk",
      "walk_start",
      "walljump",
      "weak",
    ]);
    expect(requiredPlayerClips("player.zero")).toEqual(
      expect.arrayContaining(["walk", "slash_1", "wall_slash"]),
    );
    expect(requiredPlayerClips("player.x")).not.toContain("slash_1");
  });

  describe("frame boxes", () => {
    const anchor = [16, 28] as const;
    const size = [32, 32] as const;

    it("measures a dragged box from the feet, in whole pixels, in any drag direction", () => {
      expect(boxFromPoints([10, 8], [22.4, 28], anchor, size)).toEqual({
        x: -6,
        y: -20,
        w: 12,
        h: 20,
      });
      expect(boxFromPoints([22.4, 28], [10, 8], anchor, size)).toEqual({
        x: -6,
        y: -20,
        w: 12,
        h: 20,
      });
      expect(boxFromPoints([9.6, 7.5], [9.6, 7.5], anchor, size)).toEqual({
        x: -6,
        y: -20,
        w: 1,
        h: 1,
      });
    });

    it("clamps a dragged box to the region and keeps it at least 1×1", () => {
      expect(boxFromPoints([-5, -5], [40, 40], anchor, size)).toEqual({
        x: -16,
        y: -28,
        w: 32,
        h: 32,
      });
      expect(boxFromPoints([40, 40], [50, 50], anchor, size)).toEqual({ x: 15, y: 3, w: 1, h: 1 });
    });

    it("moves a box by whole pixels and keeps it inside the region", () => {
      const box = { x: -6, y: -20, w: 12, h: 20 };
      expect(moveBox(box, 2.4, -1.6, anchor, size)).toEqual({ x: -4, y: -22, w: 12, h: 20 });
      expect(moveBox(box, 100, 100, anchor, size)).toEqual({ x: 4, y: -16, w: 12, h: 20 });
      expect(moveBox(box, -100, -100, anchor, size)).toEqual({ x: -16, y: -28, w: 12, h: 20 });
    });

    it("leaves absent boxes out of the frame", () => {
      const frame: AnimationFrame = {
        region: [0, 0, 32, 32],
        duration: 4,
        hurtbox: { x: 0, y: 0, w: 1, h: 1 },
        hitboxes: [],
      };
      expect(withBoxes(frame, undefined, [])).toEqual({ region: [0, 0, 32, 32], duration: 4 });
    });

    it("copies one frame's boxes onto the other frames, replacing theirs", () => {
      const hurtbox = { x: -6, y: -20, w: 12, h: 20 };
      const hit = { x: 4, y: -12, w: 8, h: 4 };
      const frames: AnimationFrame[] = [
        { region: [0, 0, 32, 32], duration: 4, anchor: [16, 28], hurtbox, hitboxes: [hit] },
        { region: [32, 0, 32, 32], duration: 4, anchor: [15, 29], hitboxes: [hurtbox, hurtbox] },
        { region: [64, 0, 32, 32], duration: 6 },
      ];
      const all = copyBoxes(frames, 0, [0, 1, 2]);
      expect(all[0]).toBe(frames[0]);
      expect(all[1]).toEqual({
        region: [32, 0, 32, 32],
        duration: 4,
        anchor: [15, 29],
        hurtbox,
        hitboxes: [hit],
      });
      expect(all[2]).toEqual({ region: [64, 0, 32, 32], duration: 6, hurtbox, hitboxes: [hit] });
      expect(copyBoxes(frames, 0, [1])[2]).toBe(frames[2]);
      // A frame without boxes clears them on the targets.
      expect(copyBoxes(frames, 2, [1])[1]).toEqual({
        region: [32, 0, 32, 32],
        duration: 4,
        anchor: [15, 29],
      });
    });
  });
});

describe("enemy clips", () => {
  it("lists every clip literal each enemy ability plays in the engine", () => {
    const dir = new URL("../../../../../../packages/engine/src/game/enemy/", import.meta.url);
    expect(Object.keys(ENEMY_ABILITY_CLIPS).sort()).toEqual(
      Object.keys(ENEMY_BEHAVIOR_SCHEMAS).sort(),
    );
    for (const [ability, clips] of Object.entries(ENEMY_ABILITY_CLIPS)) {
      const source = readFileSync(new URL(`${ability}.ts`, dir), "utf8");
      const played = [
        ...source.matchAll(/(?:animation = |play_animation(?:_once)?\()"(\w+)"/g),
      ].map((m) => m[1]);
      expect([...new Set(played)].sort(), ability).toEqual([...clips].sort());
    }
  });

  it("names the clips an enemy plays, its configs' included", () => {
    expect(
      enemyClips({ ...BLANK_ENEMY, initialAnimation: "stand", abilities: ["Patrol", "Death"] }),
    ).toEqual(["stand", "walk", "idle"]);
    // Roll's clip, and Death's weak clip once set.
    const spiky = { ...BLANK_ENEMY, abilities: ["Roll", "Death"] };
    expect(enemyClips(spiky)).toEqual(["idle", "roll"]);
    expect(
      enemyClips({
        ...spiky,
        abilityConfig: { Death: { explosionDuration: 0, weakHealth: 1, weakAnimation: "fall" } },
      }),
    ).toEqual(["idle", "roll", "fall"]);
    expect(enemyClips(GAME_DATA.enemies.metool!)).toEqual([
      "idle",
      "walk",
      "defense",
      "open",
      "stun",
    ]);
  });

  it("warns, per project enemy, about the clips its animation lacks", () => {
    const sheet = {
      id: "anim.blob",
      kind: "animation",
      animations: { idle: {}, walk: {} },
    } as unknown as AnimationAsset;
    const blob = addBlankEnemy(undefined, GAME_DATA, {
      name: "Blob",
      health: 2,
      enemy: { ...BLANK_ENEMY, sheet: "anim.blob", abilities: ["Patrol", "Shoot", "Death"] },
    }).overlay;
    expect(enemyClipIssues(blob, [sheet])).toEqual([
      {
        severity: "warning",
        code: "enemy.clips",
        path: "/data/game.json",
        message: "Enemy 'blob' animation 'anim.blob' has no clip for: aim, shoot.",
      },
    ]);
    // Nothing to say with every clip, or for a sheet that is not a project animation.
    expect(
      enemyClipIssues(blob, [
        { ...sheet, animations: { idle: {}, walk: {}, aim: {}, shoot: {} } } as never,
      ]),
    ).toEqual([]);
    expect(enemyClipIssues(blob, [])).toEqual([]);
    expect(enemyClipIssues(undefined, [sheet])).toEqual([]);
    // A rolling enemy that falls over before exploding needs both clips.
    const spiky = addBlankEnemy(undefined, GAME_DATA, {
      name: "Spiky",
      health: 3,
      enemy: {
        ...BLANK_ENEMY,
        sheet: "anim.blob",
        abilities: ["Roll", "Death"],
        abilityConfig: { Death: { explosionDuration: 0, weakHealth: 1, weakAnimation: "fall" } },
      },
    }).overlay;
    expect(enemyClipIssues(spiky, [sheet]).map((issue) => issue.message)).toEqual([
      "Enemy 'spiky' animation 'anim.blob' has no clip for: roll, fall.",
    ]);
  });
});
