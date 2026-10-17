import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  isBaseDefinition,
  type GameObjectDefinition,
} from "@mmx/content-schema";

export type PaletteRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "def"; key: string; def: GameObjectDefinition };

/**
 * The palette's rows for `query` (by name or category): the Base section first,
 * what neither the project's data nor its objects add, then the project's own
 * definitions by category. `defs` are in palette order (`allDefinitions()`).
 */
export function paletteRows(defs: readonly GameObjectDefinition[], query: string): PaletteRow[] {
  const q = query.trim().toLowerCase();
  const shown = defs.filter(
    (d) => !q || d.name.toLowerCase().includes(q) || d.category.includes(q),
  );
  const out: PaletteRow[] = [];
  const section = (key: string, label: string, list: readonly GameObjectDefinition[]) => {
    if (list.length === 0) return;
    out.push({ kind: "header", key: `h:${key}`, label });
    for (const def of list) out.push({ kind: "def", key: def.id, def });
  };
  // Searching "base" (or a prefix of 2+ letters) lists the whole Base section.
  const wholeBase = q.length >= 2 && "base".startsWith(q);
  section(
    "base",
    "Base",
    defs.filter((d) => isBaseDefinition(d) && (wholeBase || shown.includes(d))),
  );
  for (const category of CATEGORY_ORDER) {
    section(
      category,
      CATEGORY_LABELS[category] ?? category,
      shown.filter((d) => d.category === category && !isBaseDefinition(d)),
    );
  }
  return out;
}
