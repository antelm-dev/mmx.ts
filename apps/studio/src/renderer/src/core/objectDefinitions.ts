import type { LevelDocument } from "@mmx/content-schema";
import type { ProjectObjectDefinition } from "@mmx/project-schema";

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
