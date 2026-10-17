import { describe, expect, it } from "vitest";
import { Scene, Tile } from "@mmx/engine";
import { GAME_DATA, type GameDataOverlay } from "@mmx/engine/data";
import { definitionsFromGameData } from "@mmx/content-schema";
import { addEnemy, projectGameData } from "./gameData.js";
import {
  abilitiesFor,
  abilityFields,
  addBlankEnemy,
  BLANK_ENEMY,
  defaultReactions,
  deleteEnemy,
  duplicateEnemy,
  enemyForPrefab,
  ENEMY_ABILITIES,
  isProjectEnemy,
  putEnemy,
  renameEnemy,
  withAbilities,
  withConfig,
  MOVEMENTS,
  withMovement,
  withReaction,
  withWeakPhase,
} from "./enemyEditor.js";

const crab = addEnemy(undefined, GAME_DATA, {
  name: "Crab",
  base: "metool",
  sheet: "anim.crab",
  health: 3,
  touchDamage: 2,
});
const crabEnemy = crab.overlay.enemies!.crab!;
const BLANK_PATROL = GAME_DATA.enemies.metool!.abilityConfig!.Patrol!;
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
    // A field with options picks one; Death's weak clip is one of the animation's.
    expect(abilityFields("Roll", []).find((p) => p.key === "atWall")).toMatchObject({
      type: "enum",
      options: ["turn", "stop"],
    });
    const weakClip = (clips?: string[]) =>
      abilityFields("Death", [], clips).find((p) => p.key === "weakAnimation");
    expect(weakClip(["idle", "fall"])).toMatchObject({ type: "enum", options: ["idle", "fall"] });
    expect(weakClip()).toMatchObject({ type: "string" });
    expect(abilityFields("Death", []).map((p) => p.key)).toEqual([
      "explosionDuration",
      "weakHealth",
      "weakAnimation",
      "weakDuration",
    ]);
  });

  it("gives Death's weak phase a duration, and takes it away whole", () => {
    const death = (enemy: { abilityConfig?: Record<string, Record<string, unknown>> }) =>
      enemy.abilityConfig?.Death;
    const base = withAbilities(BLANK_ENEMY, ["Death"]);
    // A weak phase without a duration would last one frame.
    expect(death(withConfig(base, "Death", "weakHealth", 2))).toEqual({
      explosionDuration: 0,
      weakHealth: 2,
      weakDuration: 1,
    });
    const slow = withConfig(base, "Death", "weakDuration", 3);
    expect(death(withConfig(slow, "Death", "weakHealth", 2))?.weakDuration).toBe(3);
    expect(death(withConfig(base, "Death", "weakHealth", 0))?.weakDuration).toBeUndefined();
    const weak = withWeakPhase(base, "fall");
    expect(death(weak)).toEqual({
      explosionDuration: 0,
      weakHealth: 1,
      weakAnimation: "fall",
      weakDuration: 1,
    });
    expect(withWeakPhase(weak, undefined)).toEqual(base);
  });

  it("re-applies a default conflict with an ability added later, not one the user dropped", () => {
    const roller = withAbilities(BLANK_ENEMY, ["Roll", "Death"]);
    expect(roller.abilityConfig?.Roll?.conflicts).toEqual([]);
    // Stun added after Roll must still interrupt the roll.
    const stunned = withAbilities(roller, ["Roll", "Death", "Stun"]);
    expect(stunned.abilityConfig?.Roll?.conflicts).toEqual(["Stun"]);
    // Dropped while owned, it stays dropped through other changes.
    const free = withConfig(stunned, "Roll", "conflicts", []);
    expect(withAbilities(free, ["Stun", "Roll", "Death"]).abilityConfig?.Roll?.conflicts).toEqual(
      [],
    );
    expect(
      withAbilities(free, ["Roll", "Death", "Stun", "Patrol"]).abilityConfig?.Roll?.conflicts,
    ).toEqual([]);
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

  describe("blank enemy", () => {
    const blank = (abilities: string[], extra: object = {}, overlay = crab.overlay) =>
      addBlankEnemy(overlay, projectGameData(overlay).data, {
        name: "Blob",
        health: 2,
        enemy: {
          ...BLANK_ENEMY,
          sheet: "anim.blob",
          initialAnimation: "walk",
          abilities,
          ...extra,
        },
      });

    it("compiles with no ability, as a complete enemy, actor and placeable prefab", () => {
      const { overlay, id } = blank([]);
      expect(id).toBe("enemy.blob");
      expect(overlay.enemies?.crab).toBe(crabEnemy); // earlier records kept
      expect(overlay.actors?.["enemy.blob"]).toEqual({
        id: "enemy.blob",
        body: { hw: 8, hh: 8 },
        maxHealth: 2,
      });
      expect(overlay.enemies?.blob).toMatchObject({
        id: "blob",
        actor: "enemy.blob",
        sheet: "anim.blob",
        initialAnimation: "walk",
        abilities: [],
        reactions: {},
      });
      expect(overlay.prefabs?.["enemy.blob"]).toMatchObject({
        name: "Blob",
        runtime: "enemy",
        source: { kind: "enemy", ref: "blob" },
      });
      const result = projectGameData(overlay);
      expect(result.issues).toEqual([]);
      expect(result.compiled.enemies.get("blob")?.movement).toBe("ground");
    });

    it("gives each ability a complete config and wires each AI event as a built-in does", () => {
      const { overlay } = blank(["Death", "Pursuit", "Recoil", "Hover"], { movement: "flying" });
      const enemy = overlay.enemies!.blob!;
      expect(Object.keys(enemy.abilityConfig ?? {})).toEqual([
        "Death",
        "Pursuit",
        "Recoil",
        "Hover",
      ]);
      // As the bat: Hover idle, Pursuit on sight, Recoil on touch.
      expect(enemy.reactions).toEqual({
        idle: ["Hover"],
        see_player: ["Pursuit"],
        touch_player: ["Recoil"],
      });
      expect(projectGameData(overlay).issues).toEqual([]);
      // As the Pantheon Hunter, with a flinch also wired to a guard break.
      expect(blank(["Patrol", "Shoot", "Stun", "Death"]).overlay.enemies!.blob!.reactions).toEqual({
        idle: ["Patrol"],
        see_player: ["Shoot"],
        guard_break: ["Stun"],
        get_hit: ["Stun"],
      });
      // The first in order wins an event: Shoot before Hide.
      expect(blank(["Shoot", "Hide"]).overlay.enemies!.blob!.reactions).toEqual({
        see_player: ["Shoot"],
      });
      // Roll starts on idle, ahead of Patrol when listed first; the order decides.
      expect(blank(["Roll", "Death"]).overlay.enemies!.blob!.reactions).toEqual({
        idle: ["Roll"],
      });
      expect(defaultReactions(["Roll", "Patrol"]).idle).toEqual(["Roll"]);
      expect(defaultReactions(["Patrol", "Roll"]).idle).toEqual(["Patrol"]);
      // Death answers zero health by itself.
      expect(blank(["Death"]).overlay.enemies!.blob!.reactions).toEqual({});
      // Every ability a movement allows still compiles.
      for (const movement of MOVEMENTS) {
        const all = blank(abilitiesFor(movement), { movement }).overlay;
        expect(projectGameData(all).issues).toEqual([]);
      }
    });

    it("keeps to the abilities its movement allows", () => {
      expect(abilitiesFor("ground")).toEqual(["Patrol", "Hide", "Stun", "Shoot", "Death", "Roll"]);
      expect(abilitiesFor("flying")).toEqual(["Stun", "Hover", "Pursuit", "Recoil", "Death"]);
      // A flier never gets a gravity ability, and its stun does not fall.
      const flier = blank(["Patrol", "Stun", "Hover", "Death"], { movement: "flying" }).overlay
        .enemies!.blob!;
      expect(flier.abilities).toEqual(["Stun", "Hover", "Death"]);
      expect(flier.abilityConfig?.Stun?.gravity).toBe(false);
      // Switching movement drops what no longer applies.
      const walker = withMovement(
        withAbilities(BLANK_ENEMY, ["Patrol", "Stun", "Death"]),
        "flying",
      );
      expect(walker).toMatchObject({ movement: "flying", abilities: ["Stun", "Death"] });
      expect(walker.abilityConfig?.Patrol).toBeUndefined();
      expect(withMovement(walker, "ground").abilityConfig?.Stun?.gravity).toBe(true);
    });

    it("shoots a player in view when it owns Patrol and Shoot", () => {
      const { overlay } = blank(["Patrol", "Shoot", "Death"]);
      const floorRow = 9;
      const tiles = Array.from({ length: 40 * 10 }, (_, i) =>
        Math.floor(i / 40) === floorRow ? Tile.Solid : Tile.Empty,
      );
      const at = (id: string, x: number, fields = {}) => ({
        id,
        iid: id,
        x,
        y: floorRow * 16,
        w: 16,
        h: 16,
        fields,
      });
      const shotsFired = (gameData: GameDataOverlay) => {
        const scene = Scene.create({
          gameData: projectGameData(gameData).compiled,
          level: {
            identifier: "blank-enemy",
            gridSize: 16,
            cols: 40,
            rows: 10,
            tiles,
            // The player 100 px away: inside the 140 px sight box.
            entities: [at("Spawn", 200), at("Enemy", 300, { Kind: "blob" })],
          },
        });
        let shots = 0;
        for (let i = 0; i < 240; i++) {
          scene.step(0);
          shots += scene.stage.enemies[0]?.projectiles.length ?? 0;
        }
        return shots;
      };
      expect(shotsFired(overlay)).toBeGreaterThan(0);
      // Wired to idle alone, it would only patrol.
      const idleOnly = { ...overlay.enemies!.blob!, reactions: { idle: ["Patrol"] } };
      expect(shotsFired(putEnemy(overlay, idleOnly))).toBe(0);
    });

    it("keeps conflicts to abilities the enemy owns", () => {
      const { overlay } = blank(["Patrol", "Stun", "Death"], {
        abilityConfig: { Patrol: { ...BLANK_PATROL, conflicts: ["Stun", "Hide"] } },
      });
      expect(overlay.enemies!.blob!.abilityConfig?.Patrol?.conflicts).toEqual(["Stun"]);
      // A config for an ability left out is dropped with it.
      expect(overlay.enemies!.blob!.abilityConfig?.Hide).toBeUndefined();
      expect(projectGameData(overlay).issues).toEqual([]);
      // The default config keeps a built-in's conflicts only when owned.
      const metoolLike = blank(["Patrol", "Hide", "Stun"]).overlay.enemies!.blob!;
      expect(metoolLike.abilityConfig?.Patrol?.conflicts).toEqual(["Hide", "Stun"]);
      // Without a built-in, the schema default (Roll's ["Stun"]) is filtered the same way.
      const roller = (abilities: string[]) =>
        blank(abilities).overlay.enemies!.blob!.abilityConfig?.Roll?.conflicts;
      expect(roller(["Roll", "Stun"])).toEqual(["Stun"]);
      expect(roller(["Roll"])).toEqual([]);
    });

    it("compiles a Spiky: Roll, then Death with a weak phase", () => {
      const spiky = withWeakPhase(withAbilities(BLANK_ENEMY, ["Roll", "Death", "Stun"]), "fall");
      const { overlay } = blank(spiky.abilities, { abilityConfig: spiky.abilityConfig });
      const enemy = overlay.enemies!.blob!;
      expect(enemy.abilityConfig).toMatchObject({
        Roll: { speed: 60, facePlayer: true, atWall: "turn", conflicts: ["Stun"] },
        Death: { weakHealth: 1, weakAnimation: "fall", weakDuration: 1 },
      });
      expect(enemy.reactions.idle).toEqual(["Roll"]);
      const result = projectGameData(overlay);
      expect(result.issues).toEqual([]);
      expect(result.compiled.enemies.get("blob")?.abilityConfig.Death).toMatchObject({
        weakHealth: 1,
        weakDuration: 1,
      });
    });

    it("takes a free id", () => {
      const first = blank(["Patrol", "Death"]);
      expect(blank([], {}, first.overlay).id).toBe("enemy.blob-2");
      expect(
        addBlankEnemy(undefined, GAME_DATA, { name: "Metool", health: 1, enemy: BLANK_ENEMY }).id,
      ).toBe("enemy.metool-2");
    });
  });
});
