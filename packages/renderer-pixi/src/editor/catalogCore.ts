import type { AnimData, Region } from "@mmx/asset-schema";
import type { Texture } from "pixi.js";
import { oncePromise } from "./once.js";
import {
  resolveSpriteCrop,
  type ClipActor,
  type EditorSpriteDefinition,
  type PreviewTables,
} from "./preview.js";

export interface SpritePreview {
  imageUrl: string;
  region: Region;
  texture: Texture | null;
}

type Animatable = { loadAnimations(data: AnimData): void };

export interface AssetCatalog {
  load(): Promise<void>;
  readonly loaded: boolean;
  getSpritePreview(definition: EditorSpriteDefinition): SpritePreview | null;
  attachPlayerAnimations(player: Animatable): void;
  attachEnemyAnimations(enemy: Animatable & { stats: { sheet: string } }): void;
  attachLifeCapsuleAnimations(pickup: Animatable & { kind: string }): void;
  attachWeaponCapsuleAnimations(capsule: Animatable & { sheet: string }): void;
}

export interface AssetCatalogDeps {
  tables: PreviewTables;
  sheetUrls: Record<string, string>;
  validate: () => void;
  loadSheets: (urls: Record<string, string>) => Promise<void>;
  resolveTexture: (sheet: string, region: Region) => Texture | null;
  toAnimData: (actor: ClipActor | AnimData, label: string) => AnimData;
}

export function createCatalog(deps: AssetCatalogDeps): AssetCatalog {
  let loaded = false;
  const ensureLoaded = oncePromise(async () => {
    deps.validate();
    await deps.loadSheets(deps.sheetUrls);
    loaded = true;
  });

  return {
    get loaded() {
      return loaded;
    },

    load: ensureLoaded,

    getSpritePreview(definition) {
      const crop = resolveSpriteCrop(definition, deps.tables);
      if (!crop) return null;
      return {
        imageUrl: crop.imageUrl,
        region: crop.region,
        texture: deps.resolveTexture(crop.sheet, crop.region),
      };
    },

    attachPlayerAnimations(player) {
      player.loadAnimations(deps.toAnimData(deps.tables.playerAnims, "player animations"));
    },

    attachEnemyAnimations(enemy) {
      const actor = deps.tables.enemyActors[enemy.stats.sheet];
      if (!actor) {
        throw new Error(`No enemy animations for sheet '${enemy.stats.sheet}'`);
      }
      enemy.loadAnimations(deps.toAnimData(actor, `enemy animations '${enemy.stats.sheet}'`));
    },

    attachLifeCapsuleAnimations(pickup) {
      const actor = deps.tables.pickupActors[pickup.kind];
      if (!actor) {
        throw new Error(`No pickup animations for kind '${pickup.kind}'`);
      }
      pickup.loadAnimations(deps.toAnimData(actor, `pickup animations '${pickup.kind}'`));
    },

    attachWeaponCapsuleAnimations(capsule) {
      const actor = deps.tables.pickupActors[capsule.sheet];
      if (!actor) {
        throw new Error(`No weapon capsule animations for sheet '${capsule.sheet}'`);
      }
      capsule.loadAnimations(deps.toAnimData(actor, `pickup animations '${capsule.sheet}'`));
    },
  };
}
