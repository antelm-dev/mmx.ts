import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMEPLAY_SOUND_IDS } from "@mmx/browser-audio";
import type { ProjectDocument } from "@mmx/project-schema";
import type { StudioGameDataFile } from "../../src/studioBindings.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const seedPng = path.join(fixturesDir, "synthetic-project", "assets", "sprites", "bg.png");
const seedWav = path.join(fixturesDir, "synthetic-project", "assets", "sounds", "jump.wav");

const IDLE_CLIP = {
  loop: true,
  speed: 1,
  frames: [{ region: [0, 0, 16, 16] as const, duration: 0.1 }],
};

function soundAssetId(runtimeName: string): string {
  return `sfx.fixture.${runtimeName}`;
}

function completeSoundBindings(): Record<string, string> {
  return Object.fromEntries(
    GAMEPLAY_SOUND_IDS.map((runtimeName) => [runtimeName, soundAssetId(runtimeName)]),
  );
}

function studioGameData(): StudioGameDataFile {
  return {
    schemaVersion: 1,
    bindings: {
      playerAnimation: "anim.fixture.player",
      playerPointingSheet: "sprite.fixture.player-arm",
      sounds: completeSoundBindings(),
      enemyAnimations: { metool: "anim.fixture.enemy" },
      pickupAnimations: { small: "anim.fixture.pickup" },
      shotAnimations: { lemon: "anim.fixture.shot" },
      hudSprites: {
        xBar: "sprite.fixture.hud",
        hpFill: "sprite.fixture.hud",
        weaponBar: "sprite.fixture.hud",
      },
    },
  };
}

function projectManifest(): ProjectDocument {
  const soundAssets = GAMEPLAY_SOUND_IDS.map((runtimeName) => ({
    id: soundAssetId(runtimeName),
    kind: "sound" as const,
    path: `assets/sounds/${runtimeName}.wav`,
  }));

  return {
    schemaVersion: 1,
    id: "fixture.studio-shaped",
    name: "Studio-shaped Fixture",
    gameVersion: "0.1.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "level.fixture",
    levels: [{ id: "level.fixture", path: "levels/level.fixture.json" }],
    assets: [
      {
        id: "sprite.fixture.player",
        kind: "sprite",
        path: "assets/sprites/player.png",
        region: [0, 0, 16, 16],
        anchor: [0.5, 1],
      },
      {
        id: "sprite.fixture.player-arm",
        kind: "sprite",
        path: "assets/sprites/player-arm.png",
        region: [0, 0, 16, 16],
        anchor: [0.5, 1],
      },
      {
        id: "sprite.fixture.enemy",
        kind: "sprite",
        path: "assets/sprites/enemy.png",
        region: [0, 0, 16, 16],
        anchor: [0.5, 1],
      },
      {
        id: "sprite.fixture.pickup",
        kind: "sprite",
        path: "assets/sprites/pickup.png",
        region: [0, 0, 16, 16],
        anchor: [0.5, 1],
      },
      {
        id: "sprite.fixture.hud",
        kind: "sprite",
        path: "assets/sprites/hud.png",
        region: [0, 0, 16, 16],
        anchor: [0, 0],
      },
      {
        id: "anim.fixture.player",
        kind: "animation",
        path: "assets/sprites/player.png",
        sheetAssetId: "sprite.fixture.player",
        animations: { idle: IDLE_CLIP },
      },
      {
        id: "anim.fixture.enemy",
        kind: "animation",
        path: "assets/sprites/enemy.png",
        sheetAssetId: "sprite.fixture.enemy",
        animations: { defense: IDLE_CLIP },
      },
      {
        id: "anim.fixture.pickup",
        kind: "animation",
        path: "assets/sprites/pickup.png",
        sheetAssetId: "sprite.fixture.pickup",
        animations: { idle: IDLE_CLIP },
      },
      {
        id: "anim.fixture.shot",
        kind: "animation",
        path: "assets/sprites/player.png",
        sheetAssetId: "sprite.fixture.player",
        animations: { lemon: { ...IDLE_CLIP, loop: false, speed: 1 } },
      },
      ...soundAssets,
    ],
  };
}

function levelDocument() {
  return {
    schemaVersion: 2,
    id: "level.fixture",
    name: "Fixture Level",
    gridSize: 16,
    cols: 8,
    rows: 4,
    tiles: new Array(32).fill(0),
    objects: [{ id: "spawn.1", definitionId: "spawn", x: 16, y: 32 }],
    decorations: [],
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function createStudioShapedFixture(
  prefix = "mmx-studio-shaped-",
): Promise<{ root: string; dispose: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const manifest = projectManifest();
  const gameData = studioGameData();

  await writeJson(path.join(root, "project.json"), manifest);
  await writeJson(path.join(root, "game/data.json"), gameData);
  await writeJson(path.join(root, "levels/level.fixture.json"), levelDocument());

  const spriteNames = ["player.png", "player-arm.png", "enemy.png", "pickup.png", "hud.png"];
  for (const name of spriteNames) {
    const target = path.join(root, "assets/sprites", name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(seedPng, target);
  }

  for (const runtimeName of GAMEPLAY_SOUND_IDS) {
    const target = path.join(root, "assets/sounds", `${runtimeName}.wav`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(seedWav, target);
  }

  return {
    root,
    dispose: () => fs.rm(root, { recursive: true, force: true }),
  };
}

export { completeSoundBindings, soundAssetId };
