import { getDefinition } from "@mmx/content-schema";
import type { AnimData, Region } from "@mmx/engine/game/Animation.js";
import {
  animData,
  enemyAnims,
  pickupAnims,
  SHEET_URLS,
} from "@mmx/renderer-pixi";

export interface SpritePreview {
  url: string;
  sheet: string;
  region: Region;
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

function fromActor(actor: ClipTable | undefined, preferred: readonly string[]): SpritePreview | null {
  if (!actor) return null;
  const region = firstRegion(actor, preferred);
  const url = SHEET_URLS[actor.sheet];
  if (!region || !url) return null;
  return { url, sheet: actor.sheet, region };
}

function pickupActorKey(kind: string, size: string): string | null {
  if (kind === "life") return size;
  if (kind === "weapon") return size === "large" ? "ammo" : "sammo";
  return null;
}

/** Idle / defense crop for a definition, or null when it has no game sprite. */
export function previewForDefinition(definitionId: string): SpritePreview | null {
  const def = getDefinition(definitionId);
  if (!def) return null;

  if (definitionId === "spawn") {
    const idle = (animData as AnimData).animations.idle?.frames[0]?.region;
    const url = SHEET_URLS["x.png"];
    if (!idle || !url) return null;
    return { url, sheet: "x.png", region: idle };
  }

  if (def.category === "enemy") {
    const kind = (def.components.enemy as { kind?: string } | undefined)?.kind;
    if (!kind) return null;
    return fromActor(enemyAnims.actors[kind], ["defense", "idle"]);
  }

  if (def.category === "pickup") {
    const pickup = def.components.pickup as { kind?: string; size?: string } | undefined;
    if (!pickup?.kind || !pickup.size) return null;
    const key = pickupActorKey(pickup.kind, pickup.size);
    if (!key) return null;
    return fromActor(pickupAnims.actors[key], ["idle", "falling"]);
  }

  return null;
}
