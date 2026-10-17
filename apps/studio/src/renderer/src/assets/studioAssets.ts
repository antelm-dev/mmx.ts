import { STAGE_MUSIC_ID } from "@mmx/browser-audio";
import type { ProjectAsset, ProjectDocument } from "@mmx/project-schema";
import {
  buildRendererAssetManifestFromProject,
  createAssetCatalog,
  createRendererAssetResolver,
  type AssetCatalog,
  type RendererAssetBindings,
  type RendererAssetManifest,
  type ShotAnimManifest,
} from "@mmx/renderer-pixi";
import starterProjectJson from "../../../../templates/mmx-starter/project.json";
import studioGameDataJson from "../../../../templates/mmx-starter/game/data.json";

/** The `game/data.json` bindings shape (mirrors build-tools `StudioGameDataFile`). */
export type StudioGameData = {
  bindings: {
    playerAnimation: string;
    playerPointingSheet?: string;
    sounds: Record<string, string>;
    /** Optional level music (a sound asset id), looped while Play runs. */
    music?: { stage?: string };
    enemyAnimations: Record<string, string>;
    pickupAnimations: Record<string, string>;
    shotAnimations: Record<string, string>;
    hudSprites?: Record<string, string>;
  };
};

/** Everything Play and the viewport resolve sprites, animations and sounds from. */
export type StudioAssets = {
  project: ProjectDocument;
  manifest: RendererAssetManifest;
  catalog: AssetCatalog;
  soundBindings: Record<string, string>;
  soundIds: string[];
  resolveUrl: (asset: ProjectAsset) => string;
};

const bundledAssetUrls = import.meta.glob("../../../../templates/mmx-starter/assets/**/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function resolveStarterAssetUrl(asset: ProjectAsset): string {
  const suffix = `/templates/mmx-starter/${asset.path}`.replaceAll("\\", "/");
  const match = Object.entries(bundledAssetUrls).find(([sourcePath]) =>
    sourcePath.replaceAll("\\", "/").endsWith(suffix),
  );
  if (!match) throw new Error(`Starter asset '${asset.id}' is not bundled (${asset.path}).`);
  return match[1];
}

/**
 * Builds the renderer manifest and catalog for a project from its `game/data.json`
 * bindings. `enemies` (the project's game data enemies): each one whose sheet is an
 * animation asset is drawn from it (keyed by sheet, like the renderer), unless
 * `bindings.enemyAnimations` binds that sheet. Throws on missing or invalid
 * bindings; callers report the message.
 */
export function buildStudioAssets(
  project: ProjectDocument,
  gameData: StudioGameData,
  resolveUrl: (asset: ProjectAsset) => string,
  enemies: Record<string, { sheet: string }> = {},
): StudioAssets {
  const bindings = gameData?.bindings;
  if (!bindings || typeof bindings !== "object") {
    throw new Error("game/data.json has no 'bindings' object.");
  }
  const playerAnimation = project.assets.find((asset) => asset.id === bindings.playerAnimation);
  if (!playerAnimation || playerAnimation.kind !== "animation" || !playerAnimation.sheetAssetId) {
    throw new Error(
      `Player animation '${bindings.playerAnimation}' is missing or has no sprite sheet binding.`,
    );
  }

  const hud = bindings.hudSprites;
  if (!hud?.xBar || !hud.hpFill || !hud.weaponBar) {
    throw new Error("HUD sprite bindings must define xBar, hpFill and weaponBar.");
  }

  const sheetImages = Object.fromEntries(
    project.assets
      .filter((asset) => ["image", "sprite", "tileset"].includes(asset.kind))
      .map((asset) => [asset.id, asset.id]),
  );
  const shotBindings = bindings.shotAnimations ?? {};
  const firstShotAnimation = Object.values(shotBindings)[0];
  if (!firstShotAnimation) throw new Error("Shot animation bindings are empty.");

  const rendererBindings: RendererAssetBindings = {
    playerAnimation: bindings.playerAnimation,
    playerSheetNormal: playerAnimation.sheetAssetId,
    playerSheetPointing: bindings.playerPointingSheet,
    enemyActors: {
      ...Object.fromEntries(
        Object.values(enemies)
          .filter(({ sheet }) =>
            project.assets.some((asset) => asset.id === sheet && asset.kind === "animation"),
          )
          .map(({ sheet }) => [sheet, sheet]),
      ),
      ...bindings.enemyAnimations,
    },
    pickupActors: { ...bindings.pickupAnimations },
    shotAnimations: firstShotAnimation,
    sheetImages,
    hudSheets: {
      xBar: hud.xBar,
      hpFill: hud.hpFill,
      weaponBar: hud.weaponBar,
      weaponIconDarkArrow: hud.weaponIconDarkArrow,
    },
  };

  const resolver = createRendererAssetResolver({ assets: project.assets, resolveUrl });
  const shotAnims: ShotAnimManifest = { sheets: {}, animations: {} };
  for (const [clipName, assetId] of Object.entries(shotBindings)) {
    const asset = resolver.requireKind(assetId, ["animation"]);
    const clip = asset.animations[clipName] ?? Object.values(asset.animations)[0];
    if (!clip) throw new Error(`Shot animation '${assetId}' has no clips.`);
    const sheet = asset.sheetAssetId ?? asset.id;
    shotAnims.sheets[clipName] = resolver.sheetKey(sheet);
    shotAnims.animations[clipName] = clip;
  }

  const manifest = buildRendererAssetManifestFromProject(project, rendererBindings, resolveUrl, {
    shotAnims,
  });
  const soundBindings: Record<string, string> = { ...bindings.sounds };
  if (bindings.music?.stage) soundBindings[STAGE_MUSIC_ID] = bindings.music.stage;
  return {
    project,
    manifest,
    catalog: createAssetCatalog({ manifest }),
    soundBindings,
    soundIds: [...new Set(Object.values(soundBindings))],
    resolveUrl,
  };
}

/**
 * Fallback used when no project is open. Build a fresh one after `resetSheetCache()`:
 * a catalog loads its sheets only once.
 */
export function buildStarterAssets(): StudioAssets {
  return buildStudioAssets(
    starterProjectJson as ProjectDocument,
    studioGameDataJson as StudioGameData,
    resolveStarterAssetUrl,
  );
}

/** The starter's `game/data.json`: what a new project plays with until it has its own. */
export const starterGameData = studioGameDataJson as StudioGameData;

/**
 * A project without `game/data.json` (a new one), played with `gameData` (the
 * {@link starterGameData}, maybe with its own player animation): the starter's assets, plus the
 * project's own, which win on an id clash and are resolved by `resolveUrl`.
 */
export function buildStarterBasedAssets(
  project: ProjectDocument,
  gameData: StudioGameData,
  resolveUrl: (asset: ProjectAsset) => string,
  enemies: Record<string, { sheet: string }> = {},
): StudioAssets {
  const own = new Set(project.assets.map((asset) => asset.id));
  const starter = (starterProjectJson as ProjectDocument).assets.filter((a) => !own.has(a.id));
  return buildStudioAssets(
    { ...project, assets: [...starter, ...project.assets] },
    gameData,
    (asset) => (own.has(asset.id) ? resolveUrl(asset) : resolveStarterAssetUrl(asset)),
    enemies,
  );
}

/** The starter assets the viewport draws before any project is opened. */
export const starterAssets = buildStarterAssets();
