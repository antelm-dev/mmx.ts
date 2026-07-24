import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Search, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  effectiveValue,
  requireDefinition,
  type GameObjectDefinition,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { SpritePreview } from "./SpritePreview.js";

type PaletteRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "def"; key: string; def: GameObjectDefinition };

type SceneRow = { inst: LevelObjectInstance; def: GameObjectDefinition };

/** Left dock: searchable, virtualized object palette + scene tree, in two tabs. */
export function LeftSidebar() {
  const snap = useEditorSnapshot();
  const tab = useUiStore((s) => s.sidebarTab);
  const setTab = useUiStore((s) => s.setSidebarTab);
  const query = useUiStore((s) => s.paletteQuery);
  const setQuery = useUiStore((s) => s.setPaletteQuery);

  const sceneRows = useMemo<SceneRow[]>(
    () =>
      snap.state.document.objects.map((inst) => ({
        inst,
        def: requireDefinition(inst.definitionId),
      })),
    [snap.state.document.objects],
  );

  return (
    <div className="panel">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          className={`tab${tab === "palette" ? " active" : ""}`}
          aria-selected={tab === "palette"}
          onClick={() => setTab("palette")}
        >
          Object Palette
        </button>
        <button
          role="tab"
          className={`tab${tab === "scene" ? " active" : ""}`}
          aria-selected={tab === "scene"}
          onClick={() => setTab("scene")}
        >
          Scene <span className="count">{sceneRows.length}</span>
        </button>
      </div>

      {tab === "palette" ? (
        <>
          <div className="search-wrap">
            <Search size={16} className="section-icon" style={{ margin: 0 }} />
            <input
              className="search-input"
              placeholder="Search objects…"
              aria-label="Search objects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="clear" aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            )}
          </div>
          <PaletteList query={query} snap={snap} />
        </>
      ) : (
        <SceneList rows={sceneRows} snap={snap} />
      )}
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
    estimateSize: (i) => (rows[i].kind === "header" ? 28 : 36),
    overscan: 12,
  });

  const active = snap.state;
  const isActive = (id: string) =>
    active.activeTool === "place" && active.placingDefinitionId === id;

  if (rows.length === 0) {
    return (
      <div className="scroll" ref={scrollRef}>
        <div className="empty">No objects match your search.</div>
      </div>
    );
  }

  return (
    <div className="scroll" ref={scrollRef}>
      <div className="virtual-list" style={{ height: virtualizer.getTotalSize() }}>
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
              <div key={v.key} className="cat" style={style}>
                {row.label}
              </div>
            );
          }
          const def = row.def;
          return (
            <div key={v.key} style={style}>
              <button
                className={`item${isActive(def.id) ? " active" : ""}`}
                title={`Place ${def.name}`}
                onClick={() => editor.selectPalette(def.id)}
              >
                <SpritePreview definitionId={def.id} size={28} fallbackColor={def.editor.color} />
                <span className="item-name">{def.name}</span>
                <span className="add">
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

function SceneList({
  rows,
  snap,
}: {
  rows: SceneRow[];
  snap: ReturnType<typeof useEditorSnapshot>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });

  const selected = new Set(snap.state.selectedIds);
  const sceneFlip = (row: SceneRow) =>
    row.def.category === "enemy" && effectiveValue(row.inst, "FacesRight") === true;

  if (rows.length === 0) {
    return (
      <div className="scroll" ref={scrollRef}>
        <div className="empty">No objects in the scene. Place one from the Object Palette.</div>
      </div>
    );
  }

  return (
    <div className="scroll" ref={scrollRef}>
      <div className="virtual-list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index];
          return (
            <div
              key={row.inst.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${v.start}px)`,
                height: v.size,
              }}
            >
              <button
                className={`item${selected.has(row.inst.id) ? " active" : ""}`}
                title={row.inst.id}
                onClick={() => editor.focusObject(row.inst.id)}
              >
                <SpritePreview
                  definitionId={row.def.id}
                  size={28}
                  flip={sceneFlip(row)}
                  fallbackColor={row.def.editor.color}
                />
                <span className="label">
                  <span className="name">{row.def.name}</span>
                  <span className="meta">
                    {row.inst.x}, {row.inst.y}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
