import { describe, expect, it } from "vitest";
import { GAME_DATA } from "@mmx/engine/data";
import { addEnemy, projectGameData, uniqueEnemySlug } from "./gameData.js";

const crab = { name: "Crab", base: "metool", sheet: "anim.crab", health: 5, touchDamage: 4 };

describe("project game data", () => {
  it("is the engine's without an overlay, and compiles an added enemy over it", () => {
    expect(projectGameData(undefined).data).toBe(GAME_DATA);
    const { overlay, id } = addEnemy(undefined, GAME_DATA, crab);
    expect(id).toBe("enemy.crab");
    expect(overlay.actors?.["enemy.crab"]).toMatchObject({ id: "enemy.crab", maxHealth: 5 });
    expect(overlay.enemies?.crab).toMatchObject({
      id: "crab",
      actor: "enemy.crab",
      sheet: "anim.crab",
      touchDamage: 4,
      abilities: GAME_DATA.enemies.metool!.abilities,
    });
    expect(overlay.prefabs?.["enemy.crab"]?.source).toEqual({ kind: "enemy", ref: "crab" });

    const result = projectGameData(overlay);
    expect(result.issues).toEqual([]);
    expect(result.compiled.enemies.get("crab")?.sheet).toBe("anim.crab");
    expect(projectGameData(overlay)).toBe(result); // memoized per overlay
  });

  it("picks a free id and keeps earlier records", () => {
    const first = addEnemy(undefined, GAME_DATA, crab);
    const data = projectGameData(first.overlay).data;
    expect(uniqueEnemySlug(data, "Crab")).toBe("crab-2");
    expect(uniqueEnemySlug(GAME_DATA, "Metool")).toBe("metool-2");
    const second = addEnemy(first.overlay, data, crab);
    expect(second.id).toBe("enemy.crab-2");
    expect(Object.keys(second.overlay.enemies ?? {})).toEqual(["crab", "crab-2"]);
  });

  it("reports merge and compile errors at /data/game.json and falls back to the engine's data", () => {
    const unsupported = projectGameData({ weapons: {} } as never);
    expect(unsupported.data).toBe(GAME_DATA);
    expect(unsupported.issues).toEqual([
      expect.objectContaining({ severity: "error", code: "game-data.overlay.category", path: "/data/game.json" }),
    ]);
    const { overlay } = addEnemy(undefined, GAME_DATA, crab);
    const badAbility = { ...overlay, enemies: { crab: { ...overlay.enemies!.crab!, abilities: ["Nope"] } } };
    expect(projectGameData(badAbility).issues.length).toBeGreaterThan(0);
    expect(projectGameData(badAbility).issues.every((issue) => issue.code.startsWith("game-data."))).toBe(true);
  });
});
