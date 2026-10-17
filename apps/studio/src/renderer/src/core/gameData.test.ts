import { describe, expect, it } from "vitest";
import { GAME_DATA } from "@mmx/engine/data";
import { addEnemy, projectGameData, uniqueEnemySlug } from "./gameData.js";
import { MMX_GAME_DATA, MMX_OVERLAY } from "./mmx.test-support.js";

const crab = { name: "Crab", base: "metool", sheet: "anim.crab", health: 5, touchDamage: 4 };

describe("project game data", () => {
  it("is the engine's without an overlay, and compiles an added enemy over it", () => {
    expect(projectGameData(undefined).data).toBe(GAME_DATA);
    // Over a project carrying the MMX Starter pack, the crab copies its Metool.
    const { overlay, id } = addEnemy(MMX_OVERLAY, MMX_GAME_DATA, crab);
    expect(id).toBe("enemy.crab");
    expect(overlay.actors?.["enemy.crab"]).toMatchObject({ id: "enemy.crab", maxHealth: 5 });
    expect(overlay.enemies?.crab).toMatchObject({
      id: "crab",
      actor: "enemy.crab",
      sheet: "anim.crab",
      touchDamage: 4,
      abilities: MMX_GAME_DATA.enemies.metool!.abilities,
    });
    expect(overlay.prefabs?.["enemy.crab"]?.source).toEqual({ kind: "enemy", ref: "crab" });

    const result = projectGameData(overlay);
    expect(result.issues).toEqual([]);
    expect(result.compiled.enemies.get("crab")?.sheet).toBe("anim.crab");
    expect(projectGameData(overlay)).toBe(result); // memoized per overlay
  });

  it("never gives the new enemy its base's name or description", () => {
    const data = structuredClone(MMX_GAME_DATA);
    data.prefabs["enemy.metool"]!.description = "Hides under its helmet.";
    const prefab = addEnemy(MMX_OVERLAY, data, crab).overlay.prefabs?.["enemy.crab"];
    expect(prefab?.name).toBe("Crab");
    expect(prefab).not.toHaveProperty("description");
  });

  it("picks a free id and keeps earlier records", () => {
    const first = addEnemy(MMX_OVERLAY, MMX_GAME_DATA, crab);
    const data = projectGameData(first.overlay).data;
    expect(uniqueEnemySlug(data, "Crab")).toBe("crab-2");
    expect(uniqueEnemySlug(MMX_GAME_DATA, "Metool")).toBe("metool-2");
    expect(uniqueEnemySlug(GAME_DATA, "Metool")).toBe("metool");
    const second = addEnemy(first.overlay, data, crab);
    expect(second.id).toBe("enemy.crab-2");
    expect(Object.keys(second.overlay.enemies ?? {})).toEqual([
      ...Object.keys(MMX_OVERLAY.enemies!),
      "crab",
      "crab-2",
    ]);
  });

  it("reports merge and compile errors at /data/game.json and falls back to the engine's data", () => {
    const unsupported = projectGameData({ weapons: {} } as never);
    expect(unsupported.data).toBe(GAME_DATA);
    expect(unsupported.issues).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "game-data.overlay.category",
        path: "/data/game.json",
      }),
    ]);
    // Everything the file defines falls back to the core: the message says so, once.
    expect(unsupported.issues[0]!.message).toMatch(/unavailable until it is fixed$/);
    const { overlay } = addEnemy(MMX_OVERLAY, MMX_GAME_DATA, crab);
    const badAbility = {
      ...overlay,
      enemies: { crab: { ...overlay.enemies!.crab!, abilities: ["Nope"] } },
    };
    expect(projectGameData(badAbility).issues.length).toBeGreaterThan(0);
    expect(
      projectGameData(badAbility).issues.every((issue) => issue.code.startsWith("game-data.")),
    ).toBe(true);
  });
});
