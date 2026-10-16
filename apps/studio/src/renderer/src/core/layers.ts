import type { DecorationLayer, ImageLayer, LevelDocument, TileLayer } from "@mmx/content-schema";
import type { LayerKey } from "./EditorStore.js";

/** One row of the Layers panel. */
export type LayerRow =
  | { kind: "objects" | "cameras" | "collision"; key: LayerKey }
  | { kind: "decorations"; key: DecorationLayer }
  | { kind: "tile"; key: `tile:${string}`; layer: TileLayer }
  | { kind: "image"; key: `image:${string}`; layer: ImageLayer };

/**
 * Every layer the viewport draws, front first, in {@link EditorViewportRenderer}'s container
 * order (keep the two in sync): foreground and world-front art, catalog decorations of the
 * front layers, objects and cameras (one container), catalog decorations of the back layers,
 * collision, then world-back, background and far-background art. In each art container the
 * image layers sit behind the tile layers, each in list order.
 */
export function layerStack(doc: LevelDocument): LayerRow[] {
  const images = Array.isArray(doc.imageLayers) ? doc.imageLayers : [];
  const tiles = Array.isArray(doc.tileLayers) ? doc.tileLayers : [];
  const art = (on: DecorationLayer): LayerRow[] => [
    ...images
      .filter((l) => l.layer === on)
      .map((layer) => ({ kind: "image" as const, key: `image:${layer.id}` as const, layer })),
    ...tiles
      .filter((l) => l.layer === on)
      .map((layer) => ({ kind: "tile" as const, key: `tile:${layer.id}` as const, layer })),
  ];
  const decorations = (key: DecorationLayer): LayerRow => ({ kind: "decorations", key });
  const backToFront: LayerRow[] = [
    ...art("far-background"),
    ...art("background"),
    ...art("world-back"),
    { kind: "collision", key: "collision" },
    decorations("far-background"),
    decorations("background"),
    decorations("world-back"),
    { kind: "cameras", key: "cameras" },
    { kind: "objects", key: "objects" },
    decorations("world-front"),
    decorations("foreground"),
    ...art("world-front"),
    ...art("foreground"),
  ];
  return backToFront.reverse();
}
