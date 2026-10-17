import type { AnimData, Region } from "@mmx/contracts/animation";

export interface EditorSpriteDefinition {
  id: string;
  category: string;
  components: Record<string, unknown>;
}

export interface ClipActor {
  sheet: string;
  animations: AnimData["animations"];
}

export interface PreviewTables {
  sheetUrls: Record<string, string>;
  playerAnims: AnimData;
  playerSheet: string;
  enemyActors: Record<string, ClipActor>;
  pickupActors: Record<string, ClipActor>;
}

export interface ResolvedSpriteCrop {
  imageUrl: string;
  region: Region;
  sheet: string;
}

type ClipTable = {
  sheet: string;
  animations: Record<string, { frames: { region: Region }[] }>;
};

function firstRegion(actor: ClipTable, preferred: readonly string[]): Region | null {
  for (const name of preferred) {
    const frame = actor.animations[name]?.frames[0];
    if (frame) return frame.region;
  }
  for (const clip of Object.values(actor.animations)) {
    const frame = clip.frames[0];
    if (frame) return frame.region;
  }
  return null;
}

function fromActor(
  actor: ClipTable | undefined,
  preferred: readonly string[],
  sheetUrls: Record<string, string>,
): ResolvedSpriteCrop | null {
  if (!actor) return null;
  const region = firstRegion(actor, preferred);
  const imageUrl = sheetUrls[actor.sheet];
  if (!region || !imageUrl) return null;
  return { imageUrl, region, sheet: actor.sheet };
}

/**
 * Pure crop resolution for editor previews. Sheet keys stay internal to the
 * returned crop so callers can resolve a texture without learning spritesheet layout.
 */
export function resolveSpriteCrop(
  definition: EditorSpriteDefinition,
  tables: PreviewTables,
): ResolvedSpriteCrop | null {
  if (definition.id === "spawn" || definition.category === "spawn") {
    const region = tables.playerAnims.animations.idle?.frames[0]?.region;
    const imageUrl = tables.sheetUrls[tables.playerSheet];
    if (!region || !imageUrl) return null;
    return { imageUrl, region, sheet: tables.playerSheet };
  }

  if (definition.category === "enemy") {
    // Clips are keyed by the enemy's sheet, like the game renderer; older definitions carry only the kind.
    const enemy = definition.components.enemy as { kind?: string; sheet?: string } | undefined;
    const sheet = enemy?.sheet ?? enemy?.kind;
    if (!sheet) return null;
    return fromActor(tables.enemyActors[sheet], ["defense", "idle"], tables.sheetUrls);
  }

  if (definition.category === "pickup") {
    // Clips are keyed by the pickup's sheet; older bindings key life capsules by their size.
    const pickup = definition.components.pickup as
      | { kind?: string; size?: string; sheet?: string }
      | undefined;
    const actor =
      (pickup?.sheet ? tables.pickupActors[pickup.sheet] : undefined) ??
      (pickup?.kind === "life" && pickup.size ? tables.pickupActors[pickup.size] : undefined);
    return fromActor(actor, ["idle", "falling"], tables.sheetUrls);
  }

  return null;
}
