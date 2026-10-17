import { CATEGORY_ORDER, type GameObjectDefinition, type LevelDocument } from "@mmx/content-schema";
import type { ProjectObjectDefinition } from "@mmx/project-schema";

/**
 * New object…: the categories offered, in palette order, and the built-in bases of
 * each, from catalog `defs`. A spawn must stay unique and a missing object is no base.
 */
export function newObjectBases(
  defs: readonly GameObjectDefinition[],
): { category: string; bases: GameObjectDefinition[] }[] {
  return CATEGORY_ORDER.filter((c) => c !== "spawn" && c !== "unknown")
    .map((category) => ({
      category,
      bases: defs.filter((d) => d.category === category && !d.baseId),
    }))
    .filter((c) => c.bases.length > 0);
}

/**
 * Fallback for New object…'s Behaviour step, by definition id: what each MMX Starter base
 * did before its prefab carried a `description`, for a project whose copied data has none.
 * Presentation only (C-INDEP): an id with no entry, such as an enemy, shows none.
 */
export const BEHAVIOUR_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "pickup.life.small": "Restores a little life.",
  "pickup.life.large": "Restores a lot of life.",
  "pickup.weapon.small": "Refills a little weapon energy.",
  "pickup.weapon.large": "Refills a lot of weapon energy.",
  "platform.moving": "One-way floor that travels between two points, carrying the player.",
  "platform.falling": "One-way floor that drops after a delay once the player lands on it.",
  conveyor: "Strip that pushes the player along while they stand on it.",
  hazard: "Lethal area: touching it kills the player at once.",
  "camera-zone": "Keeps the camera inside its area while the player is in it.",
};

/** What `def` does, from its data, else {@link BEHAVIOUR_DESCRIPTIONS}. */
export function behaviourDescription(def: GameObjectDefinition): string | undefined {
  return def.description ?? BEHAVIOUR_DESCRIPTIONS[def.id];
}

/**
 * The base New object… goes on with: `id` among `bases`, or the only one, whose
 * Behaviour step is skipped since there is nothing to choose.
 */
export function chosenBase(
  bases: readonly GameObjectDefinition[],
  id: string | undefined,
): GameObjectDefinition | undefined {
  return bases.length === 1 ? bases[0] : bases.find((d) => d.id === id);
}

/**
 * `objects` plus a new object based on `base` under a free id, and that id. `exposed`
 * is left out when every property stays editable per instance, as the manifest's default.
 */
export function addObject(
  objects: readonly ProjectObjectDefinition[],
  base: GameObjectDefinition,
  name: string,
  values: Record<string, unknown>,
  exposed: readonly string[],
): { objects: ProjectObjectDefinition[]; id: string } {
  const id = freeObjectId(base.id, objects);
  const keys = base.properties.map((p) => p.key);
  const entry: ProjectObjectDefinition = { id, name: name.trim(), base: base.id };
  if (keys.length > 0) entry.values = values;
  if (keys.some((k) => !exposed.includes(k)))
    entry.exposed = keys.filter((k) => exposed.includes(k));
  return { objects: [...objects, entry], id };
}

/** A free `obj.<base>.<n>` id; built-in ids never start with `obj.`. */
export function freeObjectId(base: string, objects: readonly ProjectObjectDefinition[]): string {
  for (let n = 1; ; n++) {
    const id = `obj.${base}.${n}`;
    if (!objects.some((o) => o.id === id)) return id;
  }
}

/** `objects` with a copy of project object `id` ("<name> copy", a new id) right after it. */
export function duplicateObject(
  objects: readonly ProjectObjectDefinition[],
  id: string,
): ProjectObjectDefinition[] {
  const index = objects.findIndex((o) => o.id === id);
  const source = objects[index];
  if (!source) throw new Error(`Unknown project object '${id}'.`);
  const copy = { ...source, id: freeObjectId(source.base, objects), name: `${source.name} copy` };
  return [...objects.slice(0, index + 1), copy, ...objects.slice(index + 1)];
}

/**
 * Why definition `id` cannot be deleted, or null when nothing uses it: instances
 * placed in `documents`, or project objects based on it.
 */
export function deleteBlocker(
  id: string,
  documents: readonly LevelDocument[],
  objects: readonly ProjectObjectDefinition[],
): string | null {
  const uses = documents.reduce(
    (n, doc) => n + doc.objects.filter((o) => o.definitionId === id).length,
    0,
  );
  if (uses > 0) return `Used by ${uses} placed object${uses === 1 ? "" : "s"}; delete them first`;
  const presets = objects.filter((o) => o.base === id).map((o) => o.name);
  const one = presets.length === 1;
  if (presets.length > 0)
    return `Base of the object${one ? "" : "s"} ${presets.join(", ")}; delete ${one ? "it" : "them"} first`;
  return null;
}
