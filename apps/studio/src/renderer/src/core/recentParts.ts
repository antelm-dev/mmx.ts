import { getDefinition } from "@mmx/content-schema";
import { getDecorationAsset } from "@mmx/renderer-pixi";
import type { EditorState, EditorStore } from "./EditorStore.js";

/** A piece the place tools put down: an object definition or a decoration asset. */
export interface RecentPart {
  kind: "object" | "decoration";
  id: string;
}

/** How many parts the recent bar keeps (keys 1 to 8). */
export const MAX_RECENT_PARTS = 8;

/** `part` first, without duplicates, at most {@link MAX_RECENT_PARTS}; the same list when it already leads. */
export function pushRecentPart(list: readonly RecentPart[], part: RecentPart): RecentPart[] {
  const first = list[0];
  if (first && first.kind === part.kind && first.id === part.id) return list as RecentPart[];
  const rest = list.filter((p) => p.kind !== part.kind || p.id !== part.id);
  return [part, ...rest].slice(0, MAX_RECENT_PARTS);
}

/** The display name of a part, or undefined when its definition or asset is gone (another project). */
export function partName(part: RecentPart): string | undefined {
  return part.kind === "object" ? getDefinition(part.id)?.name : getDecorationAsset(part.id)?.name;
}

/** The parts still in the catalog, in bar order: the bar's slots and keys 1 to 8. */
export function availableParts(list: readonly RecentPart[]): RecentPart[] {
  return list.filter((part) => partName(part) !== undefined);
}

/** The part the active place tool puts down, if any. */
export function placingPart(
  state: Pick<EditorState, "activeTool" | "placingDefinitionId" | "placingAssetId">,
): RecentPart | undefined {
  if (state.activeTool === "place" && state.placingDefinitionId)
    return { kind: "object", id: state.placingDefinitionId };
  if (state.activeTool === "placeDecoration" && state.placingAssetId)
    return { kind: "decoration", id: state.placingAssetId };
  return undefined;
}

/** The tool card's label for a place tool ("Place: Metool"). */
export function placingLabel(
  state: Pick<EditorState, "activeTool" | "placingDefinitionId" | "placingAssetId">,
): string | undefined {
  const part = placingPart(state);
  return part && `Place: ${partName(part) ?? part.id}`;
}

/** The store's tool for placing `part`. */
export function placeTool(part: RecentPart): "place" | "placeDecoration" {
  return part.kind === "object" ? "place" : "placeDecoration";
}

/**
 * Feeds `add` every place tool the store picks (palette, wheel, new enemy), and returns the
 * bar's own pick: it sets the tool without reordering the bar, so slot 2 stays slot 2.
 */
export function trackRecentParts(
  store: Pick<EditorStore, "subscribe" | "setTool">,
  add: (part: RecentPart) => void,
): (part: RecentPart) => void {
  let fromBar = false;
  let last: RecentPart | undefined;
  store.subscribe((state, reason) => {
    if (reason !== "ui") return;
    // Push on a change of placing part only: grid, snap, layer and save emissions also
    // report "ui" and must not bump the active part.
    const part = placingPart(state);
    const same = !!part && !!last && part.kind === last.kind && part.id === last.id;
    last = part;
    if (part && !same && !fromBar) add(part);
  });
  return (part) => {
    fromBar = true;
    try {
      store.setTool(placeTool(part), part.id);
    } finally {
      fromBar = false;
    }
  };
}
