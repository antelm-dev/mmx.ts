// Build the Zero × MMX Studio project from the user's own Steam installs: MMX1 Intro Highway
// (Mega Man X Legacy Collection) + MMZ1 Zero (Mega Man Zero/ZX Legacy Collection).
// The output is Capcom-derived: it gets a catch-all .gitignore and must never be committed.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { withStarterPack, type PackRef } from "@mmx/content-schema";
import type { GameDataOverlay } from "@mmx/engine/data";

import type { FileSystem } from "../fs.js";
import { CANONICAL_GAME_DATA_FILE } from "../paths.js";
import { msAdpcmToPcmWav } from "./adpcm.js";
import { readArc } from "./arc.js";
import {
  cameraZones,
  FEET_BELOW_CENTRE,
  introHighwayArt,
  packFrames,
  SOUND_ROLES,
  splitScript,
  Tile,
  tileOf,
  toClip,
  X_CLIPS,
  type Clip,
  type Frame,
  type Region,
} from "./convert.js";
import { readMmx1Install, type Mmx1Stage, type Mmx1StageJson } from "./mmx1.js";
import {
  EFFECTS_OBJECT,
  PANTHEON_CLIPS,
  PANTHEON_OBJECT,
  PANTHEON_SHOT_CLIP,
  readMmz1Install,
  type SpriteAtlas,
} from "./mmz1.js";
import { decodePng, encodePng } from "./png.js";
import { PANTHEON_SPAWNS, ZERO_MOVES, ZERO_SOUNDS } from "./sheets.js";
import { findSteamGame } from "./steam.js";

export const ZERO_PROJECT_ID = "zero.intro-highway";

/** Everything the project is built from, as the readers return it. */
export interface ZeroSources {
  stage: Mmx1Stage;
  zero: SpriteAtlas;
  /** MMZ1 objects 1 (effects) and 25 (Pantheon), or null: then the level has no enemies. */
  objects: SpriteAtlas | null;
  /** Engine sound id -> 16-bit PCM WAV. */
  sfx: Record<string, Uint8Array>;
  /** The stage music (Ogg Vorbis), or null. */
  music: Uint8Array | null;
}

export type Progress = (step: string) => void;

/** Locate both installs and run the readers. Errors are readable as is (install missing, unexpected version). */
export async function readZeroSources(progress: Progress = () => {}): Promise<ZeroSources> {
  progress("Locating the Steam installs");
  const mmx = await findSteamGame("mmxlc");
  if ("error" in mmx) throw new Error(mmx.error);
  const mmz = await findSteamGame("mzzxlc");
  if ("error" in mmz) throw new Error(mmz.error);
  progress("Reading MMX1 Intro Highway");
  const stage = await readMmx1Install(mmx.root);
  progress("Reading MMZ1 Zero sprites");
  const { zero, objects } = await readMmz1Install(
    mmz.root,
    ZERO_MOVES.map((m) => m.anim),
  );
  progress("Decoding MMZ1 sounds");
  const native = join(mmz.root, "nativePCx64");
  const bank = readArc(await readFile(join(native, "RZZC", "romPC", "Zero1SE.arc"))).filter((e) =>
    e.name.includes("\\wav\\"),
  );
  const sfx: Record<string, Uint8Array> = {};
  for (const [role, id] of Object.entries(SOUND_ROLES)) {
    const entry = ZERO_SOUNDS.sfx[role];
    if (entry === undefined) continue;
    if (!bank[entry])
      throw new Error(
        `Zero1SE.arc has no wav entry ${entry} (sound ${role}): unexpected collection version.`,
      );
    sfx[id] = msAdpcmToPcmWav(bank[entry].data);
  }
  // .sngw is plain Ogg Vorbis
  const music = await readFile(join(native, "sound", "bgm", "wav", ZERO_SOUNDS.music));
  return { stage, zero, objects, sfx, music };
}

/**
 * The same sources from a zero-x-mashup `game/cache`-shaped folder (stage.json/png, background.png, zero.json/png,
 * optional objects.json/png; no sounds). Used by the e2e test (MMX_STUDIO_ZERO_IMPORT_CACHE) instead of the installs.
 */
export async function readZeroSourcesFromCache(dir: string): Promise<ZeroSources> {
  const png = async (name: string) => decodePng(await readFile(join(dir, name)));
  const json = async (name: string) => JSON.parse(await readFile(join(dir, name), "utf8"));
  return {
    stage: {
      stage: await png("stage.png"),
      background: await png("background.png"),
      json: (await json("stage.json")) as Mmx1StageJson,
    },
    zero: { atlas: await png("zero.png"), json: await json("zero.json") },
    objects: existsSync(join(dir, "objects.json"))
      ? { atlas: await png("objects.png"), json: await json("objects.json") }
      : null,
    sfx: {},
    music: null,
  };
}

/** Every frame in one fixed cell, 16 cells per row, mirrored so Zero faces right; then the clips. */
export function zeroSheet({ atlas, json }: SpriteAtlas) {
  const anims = Object.entries(json);
  const {
    sheet,
    regions: all,
    cell,
  } = packFrames(
    atlas,
    anims.flatMap(([, a]) => a.frames as Frame[]),
    FEET_BELOW_CENTRE,
    true,
  );
  const regions: Record<string, Region[]> = {};
  let n = 0;
  for (const [anim, { frames }] of anims) regions[anim] = all.slice(n, (n += frames.length));
  const moves = Object.fromEntries(ZERO_MOVES.map((m) => [m.move, m]));
  const clipOf = (move: string, mode?: Parameters<typeof toClip>[2]) => {
    const m = moves[move];
    if (!m) throw new Error(`Zero has no move '${move}'`);
    const script = json[m.anim]?.scripts[m.script];
    if (!script)
      throw new Error(`MMZ1 animation ${m.anim} has no script ${m.script} (move '${move}')`);
    return toClip(script, (f) => regions[m.anim][f], mode);
  };
  const animations: Record<string, Clip> = {};
  for (const { move } of ZERO_MOVES) animations[move] = clipOf(move);
  for (const [name, [move, mode]] of Object.entries(X_CLIPS)) animations[name] = clipOf(move, mode);
  return { sheet, animations, cell, frames: n };
}

// The engine draws an enemy's frame centred on its body (renderer-pixi syncEnemies); enemy.pantheon's body
// half-height is 15 (MMX Starter pack, actors.enemy.pantheon), so the feet anchor sits 15 px under the cell centre.
const PANTHEON_FEET_BELOW_CENTRE = 15;
// The Stun flinch lasts 12 frames (MMX Starter pack, enemies.pantheon): the two hit frames share it.
const PANTHEON_HIT_DURATIONS = [6, 6];

/**
 * The Pantheon Hunter sheet (object 25, frames left-facing like the engine's enemy sheets) with the clips
 * enemy.pantheon plays, and its shot (object 1 script 4, mirrored to face right like the player's shots).
 */
export function pantheonSheets(objects: SpriteAtlas) {
  const pantheon = objects.json[String(PANTHEON_OBJECT)];
  const effects = objects.json[String(EFFECTS_OBJECT)];
  if (!pantheon || !effects)
    throw new Error(`MMZ1 objects ${PANTHEON_OBJECT} / ${EFFECTS_OBJECT} are missing`);
  const body = packFrames(
    objects.atlas,
    pantheon.frames as Frame[],
    PANTHEON_FEET_BELOW_CENTRE,
    false,
  );
  const animations: Record<string, Clip> = {};
  for (const [name, clip] of Object.entries(PANTHEON_CLIPS)) {
    if ("script" in clip) {
      const script = pantheon.scripts[clip.script];
      if (!script)
        throw new Error(
          `MMZ1 object ${PANTHEON_OBJECT} has no script ${clip.script} (clip '${name}')`,
        );
      animations[name] = toClip(script, (f) => body.regions[f]);
      if (animations[name].loop !== clip.loop)
        throw new Error(`Pantheon clip '${name}' should ${clip.loop ? "" : "not "}loop`);
    } else {
      animations[name] = {
        loop: false,
        speed: 60,
        frames: clip.frames.map((f, i) => ({
          duration: PANTHEON_HIT_DURATIONS[i],
          region: body.regions[f],
        })),
      };
    }
  }
  const script = effects.scripts[PANTHEON_SHOT_CLIP.script];
  if (!script)
    throw new Error(
      `MMZ1 object ${EFFECTS_OBJECT} has no script ${PANTHEON_SHOT_CLIP.script} (pantheon_shot)`,
    );
  const used = [...new Set(splitScript(script).steps.map((s) => s.frame))];
  const shot = packFrames(
    objects.atlas,
    used.map((f) => effects.frames[f] as Frame),
    0,
    true,
  );
  const shotClip = toClip(script, (f) => shot.regions[used.indexOf(f)]);
  return {
    pantheon: { sheet: body.sheet, animations },
    shot: { sheet: shot.sheet, animations: { pantheon_shot: shotClip } },
  };
}

/** The level document: collision -> tiles + slopes, spawn at checkpoint 0, camera zones, Pantheons, image layers. */
export function introHighwayLevel(stage: Mmx1StageJson, withEnemies: boolean) {
  const tiles: number[] = [];
  const slopes: Record<number, [number, number]> = {};
  for (const row of stage.collision) {
    for (const byte of row) {
      const [tile, profile] = tileOf(byte);
      if (profile) slopes[tiles.length] = profile;
      tiles.push(tile);
    }
  }
  return {
    schemaVersion: 2,
    id: "IntroHighway",
    name: "Intro Highway",
    gridSize: stage.cell,
    cols: stage.w,
    rows: stage.h,
    tiles,
    slopes,
    objects: [
      { id: "spawn-checkpoint-0", definitionId: "spawn", x: stage.spawn[0], y: stage.spawn[1] },
      ...cameraZones(stage.cameras, stage.w * stage.cell, stage.h * stage.cell),
      ...(withEnemies
        ? PANTHEON_SPAWNS.filter(
            ([x, y]) => x < stage.w * stage.cell && y < stage.h * stage.cell,
          ).map(([x, y], i) => ({ id: `pantheon-${i}`, definitionId: "enemy.pantheon", x, y }))
        : []),
    ],
    decorations: [],
    ...introHighwayArt(stage.backdrop),
  };
}

interface TemplateAsset {
  id: string;
  kind: string;
  path: string;
  sheetAssetId?: string;
}

/**
 * Write the project into `out` (an empty folder or a previous import). `template` is templates/mmx-demo: the HUD,
 * shot/effect animations, the gameplay sounds MMZ1 does not map and the UI font are borrowed from it, with the
 * template's ids so its bindings copy verbatim.
 */
export async function writeZeroProject(
  out: FileSystem,
  template: FileSystem,
  src: ZeroSources,
  progress: Progress = () => {},
) {
  progress("Writing the project");
  const json = (path: string, data: unknown) =>
    out.writeText(path, `${JSON.stringify(data, null, 2)}\n`);

  // The MMX Starter pack (Pantheon, pantheon_shot…); a previous import's own records are kept.
  const previous: GameDataOverlay | undefined = (await out.exists(CANONICAL_GAME_DATA_FILE))
    ? JSON.parse(await out.readText(CANONICAL_GAME_DATA_FILE))
    : undefined;
  const { manifest: packed, overlay } = withStarterPack<{ packs?: PackRef[] }>({}, previous);
  // Left unchanged, it is not an object of records: fail before writing rather than overwrite it.
  if (!packed.packs) throw new Error(`${CANONICAL_GAME_DATA_FILE} is not an object of records.`);

  const { sheet, animations, cell, frames } = zeroSheet(src.zero);
  await out.writeBytes("assets/sprites/player/zero.png", encodePng(sheet));
  await json("assets/sprites/player/zero_anims.json", { animations });

  const level = introHighwayLevel(src.stage.json, src.objects !== null);
  await json("levels/level.intro-highway.json", level);
  const artAssets = [];
  for (const name of ["stage", "background"] as const) {
    const path = `assets/images/${name}.png`;
    await out.writeBytes(path, encodePng(src.stage[name]));
    artAssets.push({ id: `image.${name}`, kind: "image", path });
  }

  const enemyAssets = [];
  const enemyAnimations: Record<string, string> = {};
  const enemyShots: Record<string, string> = {};
  if (src.objects) {
    const { pantheon, shot } = pantheonSheets(src.objects);
    for (const [sheet, path, anim, sprite, clips] of [
      [
        pantheon.sheet,
        "assets/sprites/enemies/pantheon.png",
        "anim.enemy.pantheon",
        "sprite.enemies.pantheon",
        pantheon.animations,
      ],
      [
        shot.sheet,
        "assets/sprites/effects/pantheon_shot.png",
        "anim.effect.pantheon_shot",
        "sprite.effects.pantheon-shot",
        shot.animations,
      ],
    ] as const) {
      await out.writeBytes(path, encodePng(sheet));
      enemyAssets.push(
        { id: anim, kind: "animation", path, sheetAssetId: sprite, animations: clips },
        { id: sprite, kind: "sprite", path },
      );
    }
    enemyAnimations.pantheon = "anim.enemy.pantheon";
    enemyShots.pantheon_shot = "anim.effect.pantheon_shot";
  }

  const zeroSounds: Record<string, string> = {};
  const soundAssets = [];
  for (const [id, wav] of Object.entries(src.sfx)) {
    const path = `assets/sounds/zero/${id}.wav`;
    await out.writeBytes(path, wav);
    zeroSounds[id] = `sfx.zero.${id}`;
    soundAssets.push({ id: `sfx.zero.${id}`, kind: "sound", path });
  }
  if (src.music) {
    await out.writeBytes("assets/music/stage.ogg", src.music);
    soundAssets.push({ id: "music.stage", kind: "sound", path: "assets/music/stage.ogg" });
  }

  // ponytail: borrowed HUD/effects are a stopgap until Zero has his own; drop then.
  const tplBindings = JSON.parse(await template.readText("game/data.json")).bindings;
  const borrowed = {
    fontUi: tplBindings.fontUi as string,
    sounds: Object.fromEntries(
      Object.entries(tplBindings.sounds as Record<string, string>).filter(
        ([id]) => !zeroSounds[id],
      ),
    ),
    shotAnimations: tplBindings.shotAnimations as Record<string, string>,
    hudSprites: tplBindings.hudSprites as Record<string, string>,
  };
  const tplAssets: TemplateAsset[] = JSON.parse(await template.readText("project.json")).assets;
  const wanted = new Set(
    Object.values(borrowed).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v))),
  );
  for (const a of tplAssets) if (wanted.has(a.id) && a.sheetAssetId) wanted.add(a.sheetAssetId);
  const borrowedAssets = tplAssets.filter((a) => wanted.has(a.id));
  if (borrowedAssets.length !== wanted.size)
    throw new Error("templates/mmx-demo/project.json is missing a bound asset");
  for (const path of [...borrowedAssets.map((a) => a.path), "ATTRIBUTION.md"])
    await out.writeBytes(path, await template.readBytes(path));

  await json(CANONICAL_GAME_DATA_FILE, overlay);

  // No playerPointingSheet: Zero has no detached arm.
  await json("project.json", {
    schemaVersion: 1,
    id: ZERO_PROJECT_ID,
    name: "Zero x MMX - Intro Highway",
    gameVersion: "0.1.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "level.intro-highway",
    levels: [{ id: "level.intro-highway", path: "levels/level.intro-highway.json" }],
    player: { loadout: "player.zero" },
    assets: [
      {
        id: "anim.player.zero",
        kind: "animation",
        path: "assets/sprites/player/zero.png",
        sheetAssetId: "sprite.player.zero",
        animations,
      },
      { id: "sprite.player.zero", kind: "sprite", path: "assets/sprites/player/zero.png" },
      ...artAssets,
      ...enemyAssets,
      ...soundAssets,
      ...borrowedAssets,
    ],
    packs: packed.packs,
  });
  await json("game/data.json", {
    schemaVersion: 1,
    bindings: {
      playerAnimation: "anim.player.zero",
      ...borrowed,
      shotAnimations: { ...borrowed.shotAnimations, ...enemyShots },
      sounds: { ...borrowed.sounds, ...zeroSounds },
      ...(src.music && { music: { stage: "music.stage" } }),
      enemyAnimations,
      pickupAnimations: {},
    },
  });
  await out.writeText(
    ".gitignore",
    "# Capcom-derived assets generated by MMX Studio (Import from Steam installs): never commit.\n*\n",
  );
  return {
    clips: Object.keys(animations).length,
    frames,
    cell,
    tiles: [level.cols, level.rows],
    slopes: Object.keys(level.slopes).length,
    oneWay: level.tiles.filter((t) => t === Tile.OneWay).length,
    sounds: Object.keys(zeroSounds).length,
    enemies: level.objects.filter((o) => o.definitionId === "enemy.pantheon").length,
  };
}
