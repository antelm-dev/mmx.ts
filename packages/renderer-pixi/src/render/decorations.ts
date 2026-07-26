import type { Region } from "@mmx/asset-schema";
import type { DecorationInstance, DecorationLayer } from "@mmx/content-schema";

/**
 * Catalog of placeable decoration sprites. Instances store only {@link DecorationAsset.id};
 * sheets resolve through {@link SHEET_URLS} — never through paths in level documents.
 *
 * Placeholder assets reuse existing game sheets until a dedicated decorations atlas ships.
 * Animated decoration clips are deferred; only static regions are registered here.
 */

export interface DecorationAsset {
  id: string;
  name: string;
  category: string;
  sheet: string;
  region: Region;
  anchor: [number, number];
  defaultLayer: DecorationLayer;
  defaultParallax?: number;
}

export const DEFAULT_LAYER_PARALLAX: Record<DecorationLayer, number> = {
  "far-background": 0.15,
  background: 0.5,
  "world-back": 1,
  "world-front": 1,
  foreground: 1.15,
};

export const DECORATION_ASSETS: readonly DecorationAsset[] = [
  {
    id: "prop.life-capsule",
    name: "Life Capsule",
    category: "props",
    sheet: "heal.png",
    region: [0, 0, 16, 16],
    anchor: [0.5, 0.5],
    defaultLayer: "world-front",
  },
  {
    id: "prop.small-life",
    name: "Small Life",
    category: "props",
    sheet: "sheal.png",
    region: [0, 0, 16, 16],
    anchor: [0.5, 0.5],
    defaultLayer: "world-front",
  },
  {
    id: "prop.ammo",
    name: "Ammo Capsule",
    category: "props",
    sheet: "ammo.png",
    region: [0, 0, 16, 16],
    anchor: [0.5, 0.5],
    defaultLayer: "world-back",
  },
  {
    id: "fx.remains",
    name: "Debris",
    category: "fx",
    sheet: "remains.png",
    region: [0, 0, 16, 16],
    anchor: [0.5, 0.5],
    defaultLayer: "foreground",
    defaultParallax: 1.15,
  },
  {
    id: "fx.explosion",
    name: "Blast Mark",
    category: "fx",
    sheet: "explosion.png",
    region: [0, 0, 32, 32],
    anchor: [0.5, 0.5],
    defaultLayer: "background",
    defaultParallax: 0.5,
  },
  {
    id: "bg.cloud",
    name: "Soft Cloud",
    category: "backdrop",
    sheet: "charge_1.png",
    region: [0, 0, 32, 32],
    anchor: [0.5, 0.5],
    defaultLayer: "far-background",
    defaultParallax: 0.15,
  },
];

const BY_ID = new Map(DECORATION_ASSETS.map((a) => [a.id, a]));

export function getDecorationAsset(id: string): DecorationAsset | undefined {
  return BY_ID.get(id);
}

export function requireDecorationAsset(id: string): DecorationAsset {
  const asset = BY_ID.get(id);
  if (!asset) throw new Error(`Unknown decoration asset '${id}'.`);
  return asset;
}

export function knownDecorationAssetIds(): ReadonlySet<string> {
  return new Set(BY_ID.keys());
}

export function effectiveDecorationParallax(inst: DecorationInstance): number {
  if (inst.parallax !== undefined) return inst.parallax;
  const asset = BY_ID.get(inst.assetId);
  if (asset?.defaultParallax !== undefined) return asset.defaultParallax;
  return DEFAULT_LAYER_PARALLAX[inst.layer];
}

/** Axis-aligned box for selection/hit-testing, in world pixels. */
export function decorationBounds(inst: DecorationInstance): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const asset = BY_ID.get(inst.assetId);
  if (!asset) return null;
  const [, , w, h] = asset.region;
  const [ax, ay] = asset.anchor;
  return { x: inst.x - ax * w, y: inst.y - ay * h, w, h };
}
