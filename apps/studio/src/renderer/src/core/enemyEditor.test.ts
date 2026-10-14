import { describe, expect, it } from "vitest";
import { GAME_DATA } from "@mmx/engine/data";
import { definitionsFromGameData } from "@mmx/content-schema";
import { addEnemy, projectGameData } from "./gameData.js";
import {
  abilityFields,
  deleteEnemy,
  duplicateEnemy,
  enemyForPrefab,
  ENEMY_ABILITIES,
  isProjectEnemy,
  putEnemy,
  renameEnemy,
  withAbilities,
  withConfig,
  withReaction,
} from "./enemyEditor.js";

const crab = addEnemy(undefined, GAME_DATA, {
  name: "Crab",
  base: "metool",
  sheet: "anim.crab",
  health: 3,
  touchDamage: 2,
});
const crabEnemy = crab.overlay.enemies!.crab!;
const compiles = (enemy = crabEnemy) => projectGameData(putEnemy(crab.overlay, enemy)).issues;

describe("enemy editor", () => {
  it("finds the enemy a palette definition places; only project enemies are editable", () => {
    expect(enemyForPrefab(crab.overlay, "enemy.crab")).toMatchObject({
      enemy: { id: "crab" },
      editable: true,
    });
    expect(enemyForPrefab(crab.overlay, "enemy.metool")).toMatchObject({
      enemy: { id: "metool" },
      editable: false,
    });
    expect(enemyForPrefab(crab.overlay, "spawn")).toBeNull();
  });

  it("gives no enemy for a hand-edited record the panel cannot show, instead of throwing", () => {
    const malformed = (enemy: unknown, extra: object = {}) =>
      enemyForPrefab(
        { ...crab.overlay, enemies: { crab: enemy as never }, ...extra },
        "enemy.crab",
      );
    const { reactions: _reactions, ...noReactions } = crabEnemy;
    const { hurtbox: _hurtbox, ...noHurtbox } = crabEnemy;
    expect(() => malformed(noReactions)).not.toThrow();
    expect(malformed(noReactions)).toBeNull();
    expect(malformed({ ...crabEnemy, abilities: "Patrol" })).toBeNull();
    expect(malformed(noHurtbox)).toBeNull();
    expect(malformed({ ...crabEnemy, reactions: { idle: "Patrol" } })).toBeNull();
    expect(malformed(null)).toBeNull();
    const { body: _body, ...noBody } = crab.overlay.actors!["enemy.crab"]!;
    expect(malformed(crabEnemy, { actors: { "enemy.crab": noBody } })).toBeNull();
    expect(
      enemyForPrefab({ ...crab.overlay, prefabs: { "enemy.crab": {} as never } }, "enemy.crab"),
    ).toBeNull();
  });

  it("adds every registered ability with a complete config, and removes them again, still compiling", () => {
    for (const ability of ENEMY_ABILITIES) {
      if (crabEnemy.abilities.includes(ability)) continue;
      const added = withAbilities(crabEnemy, [...crabEnemy.abilities, ability]);
      expect(added.abilityConfig?.[ability], ability).toBeDefined();
      expect(compiles(added), ability).toEqual([]);
      expect(withAbilities(added, crabEnemy.abilities)).toEqual(
        withAbilities(crabEnemy, crabEnemy.abilities),
      );
    }
  });

  it("removing an ability drops its config, reactions, conflicts and hooks", () => {
    const noHide = withAbilities(crabEnemy, ["Patrol", "Stun", "Death"]);
    expect(noHide.abilityConfig?.Hide).toBeUndefined();
    expect(noHide.abilityConfig?.Patrol?.conflicts).toEqual(["Stun"]);
    expect(noHide.reactions).toEqual({ idle: ["Patrol"], guard_break: ["Stun"] });
    expect(compiles(noHide)).toEqual([]);

    const bat = GAME_DATA.enemies.bat!;
    expect(withAbilities(bat, ["Pursuit", "Recoil", "Death"]).hooks).toEqual([]);
    expect(withAbilities(bat, ["Hover", "Pursuit", "Death"]).hooks).toEqual([]);
    expect(withAbilities(bat, ["Death", "Hover", "Pursuit", "Recoil"]).hooks).toEqual(bat.hooks);
  });

  it("reorders abilities without touching their configs", () => {
    const reordered = withAbilities(crabEnemy, ["Hide", "Patrol", "Stun", "Death"]);
    expect(reordered.abilities).toEqual(["Hide", "Patrol", "Stun", "Death"]);
    expect(reordered.abilityConfig).toEqual(crabEnemy.abilityConfig);
  });

  it("edits a config field and reactions", () => {
    const faster = withConfig(crabEnemy, "Patrol", "travelSpeed", 40);
    expect(faster.abilityConfig?.Patrol).toMatchObject({ travelSpeed: 40, travelTime: 0.8 });
    expect(compiles(faster)).toEqual([]);
    expect(
      projectGameData(putEnemy(crab.overlay, faster)).compiled.enemies.get("crab")?.abilityConfig
        .Patrol?.travelSpeed,
    ).toBe(40);

    const touchy = withReaction(crabEnemy, "touch_player", "Hide", true);
    expect(touchy.reactions.touch_player).toEqual(["Hide"]);
    expect(compiles(touchy)).toEqual([]);
    expect(withReaction(touchy, "touch_player", "Hide", false).reactions).toEqual(
      crabEnemy.reactions,
    );

    const negative = withConfig(crabEnemy, "Patrol", "travelSpeed", -1);
    const { diagnostics } = projectGameData(putEnemy(crab.overlay, negative));
    expect(diagnostics.map((d) => d.fieldPath)).toEqual([
      "enemies.crab.abilityConfig.Patrol.travelSpeed",
    ]);
  });

  it("maps ability schemas to properties, with projectiles to pick from", () => {
    expect(abilityFields("Patrol", []).map((p) => [p.key, p.label, p.type])).toEqual([
      ["travelSpeed", "Travel speed", "number"],
      ["travelTime", "Travel time", "number"],
      ["restMin", "Rest min", "number"],
      ["randomTurn", "Random turn", "boolean"],
    ]);
    expect(abilityFields("Shoot", ["a", "b"])[0]).toMatchObject({
      key: "projectile",
      type: "enum",
      options: ["a", "b"],
    });
  });

  it("duplicates an enemy into the overlay under a new id, named after the original", () => {
    const { overlay, id } = duplicateEnemy(
      crab.overlay,
      projectGameData(crab.overlay).data,
      "metool",
      "Metool",
    );
    expect(id).toBe("enemy.metool-copy");
    expect(overlay.enemies?.["metool-copy"]).toMatchObject({
      actor: "enemy.metool-copy",
      sheet: "metool",
    });
    expect(overlay.prefabs?.[id]?.name).toBe("Metool copy");
    expect(overlay.enemies?.crab).toBe(crabEnemy);
    expect(projectGameData(overlay).issues).toEqual([]);

    // A second copy of the same name gets the next free id.
    const again = duplicateEnemy(overlay, projectGameData(overlay).data, "metool", "Metool");
    expect(again.id).toBe("enemy.metool-copy-2");
    expect(again.overlay.prefabs?.[again.id]?.name).toBe("Metool copy");
  });

  it("the catalog shows a project enemy under its name, not its id", () => {
    const named = addEnemy(undefined, GAME_DATA, {
      name: "Spiky Crab",
      base: "metool",
      sheet: "anim.crab",
      health: 3,
      touchDamage: 2,
    });
    const def = definitionsFromGameData(projectGameData(named.overlay).data).find(
      (d) => d.id === "enemy.spiky-crab",
    );
    expect(def?.name).toBe("Spiky Crab");
  });

  it("renames a project enemy without changing any id", () => {
    const renamed = renameEnemy(crab.overlay, "enemy.crab", "Hermit Crab");
    expect(renamed.prefabs?.["enemy.crab"]).toMatchObject({
      id: "enemy.crab",
      name: "Hermit Crab",
      source: { ref: "crab" },
    });
    expect(renamed.enemies).toBe(crab.overlay.enemies);
    expect(renamed.actors).toBe(crab.overlay.actors);
    expect(projectGameData(renamed).issues).toEqual([]);
    expect(() => renameEnemy(crab.overlay, "enemy.metool", "Nope")).toThrow();
  });

  it("deletes a project enemy's prefab, enemy and actor together; never a built-in or an override", () => {
    expect(isProjectEnemy(crab.overlay, "enemy.crab")).toBe(true);
    expect(isProjectEnemy(crab.overlay, "enemy.metool")).toBe(false);
    const both = duplicateEnemy(crab.overlay, projectGameData(crab.overlay).data, "crab", "Crab");
    const deleted = deleteEnemy(both.overlay, "enemy.crab");
    expect(deleted.prefabs?.["enemy.crab"]).toBeUndefined();
    expect(deleted.enemies?.crab).toBeUndefined();
    expect(deleted.actors?.["enemy.crab"]).toBeUndefined();
    expect(Object.keys(deleted.enemies ?? {})).toEqual(["crab-copy"]);
    expect(projectGameData(deleted).issues).toEqual([]);

    const override = putEnemy(crab.overlay, { ...GAME_DATA.enemies.metool!, touchDamage: 9 });
    expect(
      isProjectEnemy(
        {
          ...override,
          prefabs: { ...override.prefabs, "enemy.metool": GAME_DATA.prefabs["enemy.metool"]! },
        },
        "enemy.metool",
      ),
    ).toBe(false);
    expect(() => deleteEnemy(override, "enemy.metool")).toThrow();
  });
});
