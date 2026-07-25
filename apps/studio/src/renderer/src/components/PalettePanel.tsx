import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Search, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { itemCls, panel, scroll } from "../ui.js";
import { SpritePreview } from "./SpritePreview.js";

const cat = "flex items-end text-[9.5px] uppercase tracking-[0.7px] text-fg-3 pt-[14px] px-3.5 pb-[5px] font-extrabold";
const emptyNote = "px-3 py-3.5 text-muted text-xs";
const itemName = "min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis";

type PaletteRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "def"; key: string; def: GameObjectDefinition };

/** Detachable dock panel: the searchable, virtualized object palette. */
export function PalettePanel() {
  const snap = useEditorSnapshot();
  const query = useUiStore((s) => s.paletteQuery);
  const setQuery = useUiStore((s) => s.setPaletteQuery);

  return (
    <div className={panel}>
      <div className="flex items-center gap-2 h-9 mt-3 mx-3 mb-2 px-2.5 border border-border-strong rounded-lg bg-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-[border-color,box-shadow] duration-[120ms] focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]">
        <Search size={16} className="text-[#7792bc]" />
        <input
          className="min-w-0 flex-1 border-0 outline-0 bg-transparent text-fg text-xs placeholder:text-fg-3"
          placeholder="Search objects…"
          aria-label="Search objects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="border-0 bg-transparent text-fg-3 cursor-pointer inline-flex"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <X size={15} />
          </button>
        )}
      </div>
      <PaletteList query={query} snap={snap} />
    </div>
  );
}

function PaletteList({
  query,
  snap,
}: {
  query: string;
  snap: ReturnType<typeof useEditorSnapshot>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<PaletteRow[]>(() => {
    const q = query.trim().toLowerCase();
    const out: PaletteRow[] = [];
    for (const category of CATEGORY_ORDER) {
      const defs = OBJECT_DEFINITIONS.filter(
        (d) =>
          d.category === category &&
          (!q || d.name.toLowerCase().includes(q) || d.category.includes(q)),
      );
      if (defs.length === 0) continue;
      out.push({ kind: "header", key: `h:${category}`, label: CATEGORY_LABELS[category] ?? category });
      for (const def of defs) out.push({ kind: "def", key: def.id, def });
    }
    return out;
  }, [query]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === "header" ? 30 : 40),
    overscan: 12,
  });

  const active = snap.state;
  const isActive = (id: string) =>
    active.activeTool === "place" && active.placingDefinitionId === id;

  if (rows.length === 0) {
    return (
      <div className={scroll} ref={scrollRef}>
        <div className={emptyNote}>No objects match your search.</div>
      </div>
    );
  }

  return (
    <div className={scroll} ref={scrollRef}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index];
          const style = {
            position: "absolute" as const,
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${v.start}px)`,
            height: v.size,
          };
          if (row.kind === "header") {
            return (
              <div key={v.key} className={cat} style={style}>
                {row.label}
              </div>
            );
          }
          const def = row.def;
          return (
            <div key={v.key} style={style}>
              <button
                className={itemCls(isActive(def.id))}
                title={`Place ${def.name}`}
                onClick={() => editor.selectPalette(def.id)}
              >
                <span className="grid place-items-center w-7 h-7 flex-none rounded-md bg-[#0b1018] ring-1 ring-border/80">
                  <SpritePreview definitionId={def.id} size={24} fallbackColor={def.editor.color} />
                </span>
                <span className={itemName}>{def.name}</span>
                <span className="grid place-items-center w-6 h-6 rounded-md text-fg-3 opacity-0 bg-[#26344a] group-hover:opacity-100 group-hover:text-accent-fg transition-opacity">
                  <Plus size={16} />
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
