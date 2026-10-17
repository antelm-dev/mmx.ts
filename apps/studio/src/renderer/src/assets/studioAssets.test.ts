import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProjectDocument } from "@mmx/project-schema";
import { describe, expect, it } from "vitest";
import {
  buildProjectAssets,
  buildStudioAssets,
  starterAssets,
  starterGameData,
  type StudioGameData,
} from "./studioAssets.js";

const fixtureRoot = resolve(__dirname, "../../../../tests/project-io/fixtures/minimal-project");
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(fixtureRoot, path), "utf8"));
const project = readJson("project.json") as ProjectDocument;
const gameData = readJson("game/data.json") as StudioGameData;
const resolveUrl = (asset: { path: string }): string => `fixture://${asset.path}`;

describe("buildStudioAssets", () => {
  it("resolves the player sheet and bindings from a loaded project", () => {
    const { manifest, soundIds } = buildStudioAssets(project, gameData, resolveUrl);
    expect(manifest.playerSheet).toBe("sprite.player.fixture");
    expect(manifest.playerSheets.pointing_cannon).toBe("sprite.player.fixture");
    expect(manifest.sheetUrls["sprite.player.fixture"]).toBe("fixture://assets/sprites/player.png");
    expect(manifest.shotAnims.sheets.lemon).toBe("sprite.bg");
    expect(manifest.hudSheets.xBar).toBe("sprite.bg");
    expect(soundIds).toEqual([]);
    expect(starterAssets.manifest.playerSheet).not.toBe(manifest.playerSheet);
  });

  it("binds the stage music to the runtime id musicStage", () => {
    const withMusic = { bindings: { ...gameData.bindings, music: { stage: "music.stage" } } };
    const { soundBindings, soundIds } = buildStudioAssets(project, withMusic, resolveUrl);
    expect(soundBindings.musicStage).toBe("music.stage");
    expect(soundIds).toEqual(["music.stage"]);
  });

  it("draws project enemies from their animation-asset sheet; explicit bindings win", () => {
    const enemies = { crab: { sheet: "anim.player.fixture" }, ghost: { sheet: "sprite.bg" } };
    const { manifest } = buildStudioAssets(project, gameData, resolveUrl, enemies);
    expect(manifest.enemyActorIds).toEqual({ "anim.player.fixture": "anim.player.fixture" });
    const bound = {
      bindings: {
        ...gameData.bindings,
        enemyAnimations: { "anim.player.fixture": "anim.effect.fixture" },
      },
    };
    expect(buildStudioAssets(project, bound, resolveUrl, enemies).manifest.enemyActorIds).toEqual({
      "anim.player.fixture": "anim.effect.fixture",
    });
  });

  it("throws a readable error for missing or invalid bindings", () => {
    const broken = { bindings: { ...gameData.bindings, playerAnimation: "anim.nope" } };
    expect(() => buildStudioAssets(project, broken, resolveUrl)).toThrow(/anim\.nope/);
    expect(() => buildStudioAssets(project, {} as StudioGameData, resolveUrl)).toThrow(/bindings/);
    expect(() => buildStudioAssets(project, gameData, () => "")).toThrow(/empty string/);
  });
});

describe("buildProjectAssets", () => {
  it("draws a project with the starter's game data from the starter's assets and its own", () => {
    const enemies = { crab: { sheet: "anim.player.fixture" } };
    const { manifest } = buildProjectAssets(project, starterGameData, resolveUrl, enemies);
    expect(manifest.playerSheet).toBe(starterAssets.manifest.playerSheet);
    expect(manifest.enemyActorIds["anim.player.fixture"]).toBe("anim.player.fixture");
    expect(manifest.sheetUrls["sprite.player.fixture"]).toBe("fixture://assets/sprites/player.png");
  });

  it("keeps the project's own asset when it has a starter asset's id", () => {
    const fixtureSheet = project.assets.find((asset) => asset.id === "sprite.player.fixture")!;
    const clash = {
      ...project,
      assets: [...project.assets, { ...fixtureSheet, id: "sprite.player.x" }],
    };
    const { manifest } = buildProjectAssets(clash, starterGameData, resolveUrl);
    expect(manifest.sheetUrls["sprite.player.x"]).toBe("fixture://assets/sprites/player.png");
  });

  it("draws a project bound to its own assets from them alone", () => {
    const { manifest } = buildProjectAssets(project, gameData, resolveUrl);
    expect(manifest).toEqual(buildStudioAssets(project, gameData, resolveUrl).manifest);
    expect(manifest.sheetUrls["sprite.player.x"]).toBeUndefined();
  });
});
