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

function pickupActorKey(kind: string, size: string): string | null {
  if (kind === "life") return size;
  if (kind === "weapon") return size === "large" ? "ammo" : "sammo";
  return null;
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
    const enemy = definition.components.enemy as { kind?: string } | undefined;
    if (!enemy?.kind) return null;
    return fromActor(tables.enemyActors[enemy.kind], ["defense", "idle"], tables.sheetUrls);
  }

  if (definition.category === "pickup") {
    const pickup = definition.components.pickup as { kind?: string; size?: string } | undefined;
    if (!pickup?.kind || !pickup.size) return null;
    const key = pickupActorKey(pickup.kind, pickup.size);
    if (!key) return null;
    return fromActor(tables.pickupActors[key], ["idle", "falling"], tables.sheetUrls);
  }

  return null;
}
