import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { chakra } from "@chakra-ui/react";
import { Search, Trash2, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  allDefinitions,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { editor, projectSession, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { ListRow, ListRowAdd } from "../ui/editor/list-row.js";
import { Panel, PanelActions, PanelNote, PanelScroll, SearchBox } from "../ui/editor/panel.js";
import { CategoryHeader } from "../ui/editor/section-title.js";
import { NewEnemyDialog } from "./NewEnemyDialog.js";
import { definitionUseCount } from "./ObjectDefinitionSection.js";
import { SpritePreview } from "./SpritePreview.js";

type PaletteRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "def"; key: string; def: GameObjectDefinition };

/** Detachable dock panel: the searchable, virtualized object palette. */
export function PalettePanel() {
  const snap = useEditorSnapshot();
  const query = useUiStore((s) => s.paletteQuery);
  const setQuery = useUiStore((s) => s.setPaletteQuery);
  const projectOpen = useProjectSession().open;
  const [newEnemy, setNewEnemy] = useState(false);

  return (
    <Panel>
      <SearchBox>
        <Search size={16} />
        <input
          placeholder="Search objects…"
          aria-label="Search objects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={15} />
          </button>
        )}
      </SearchBox>
      <PaletteList query={query} snap={snap} />
      {/* A project's enemies are saved in its data/game.json. */}
      {projectOpen && (
        <PanelActions>
          <ActionButton onClick={() => setNewEnemy(true)}>New enemy…</ActionButton>
          <NewEnemyDialog open={newEnemy} onClose={() => setNewEnemy(false)} />
        </PanelActions>
      )}
    </Panel>
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
  const project = useProjectSession().project;

  const rows = useMemo<PaletteRow[]>(() => {
    const q = query.trim().toLowerCase();
    const out: PaletteRow[] = [];
    for (const category of CATEGORY_ORDER) {
      const defs = allDefinitions().filter(
        (d) =>
          d.category === category &&
          (!q || d.name.toLowerCase().includes(q) || d.category.includes(q)),
      );
      if (defs.length === 0) continue;
      out.push({
        kind: "header",
        key: `h:${category}`,
        label: CATEGORY_LABELS[category] ?? category,
      });
      for (const def of defs) out.push({ kind: "def", key: def.id, def });
    }
    return out;
    // The project's objects and game data change whenever the definitions allDefinitions reads do.
  }, [query, project?.manifest.objects, project?.gameData]);

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
      <PanelScroll ref={scrollRef}>
        <PanelNote>No objects match your search.</PanelNote>
      </PanelScroll>
    );
  }

  return (
    <PanelScroll ref={scrollRef}>
      <chakra.div position="relative" w="full" style={{ height: virtualizer.getTotalSize() }}>
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
              <CategoryHeader key={v.key} style={style}>
                {row.label}
              </CategoryHeader>
            );
          }
          const def = row.def;
          // Project objects (derived from a built-in) can be deleted once nothing uses them.
          const uses = def.baseId ? definitionUseCount(def.id) : 0;
          return (
            <div key={v.key} style={style}>
              <ListRow
                active={isActive(def.id)}
                title={`Place ${def.name}`}
                onClick={() => editor.selectPalette(def.id)}
                pr={def.baseId ? "10" : undefined}
              >
                <SpritePreview definitionId={def.id} size={28} fallbackColor={def.editor.color} />
                <chakra.span minW="0" flex="1" truncate>
                  {def.name}
                </chakra.span>
                <ListRowAdd />
              </ListRow>
              {def.baseId && (
                <chakra.button
                  type="button"
                  position="absolute"
                  top="50%"
                  right="52px"
                  transform="translateY(-50%)"
                  display="grid"
                  placeItems="center"
                  w="6"
                  h="6"
                  rounded="md"
                  color="studio.fgTertiary"
                  cursor="pointer"
                  _hover={{ color: "studio.dangerFg", bg: "studio.hover" }}
                  _disabled={{ opacity: 0.35, cursor: "default", _hover: { color: "studio.fgTertiary", bg: "transparent" } }}
                  disabled={uses > 0}
                  aria-label={`Delete ${def.name}`}
                  title={
                    uses > 0
                      ? `Used by ${uses} placed object${uses === 1 ? "" : "s"}; delete them first`
                      : `Delete ${def.name}`
                  }
                  onClick={() => {
                    if (!window.confirm(`Delete the object '${def.name}' from the project?`)) return;
                    const objects = projectSession.getSnapshot().project?.manifest.objects ?? [];
                    projectSession.setObjects(objects.filter((o) => o.id !== def.id));
                  }}
                >
                  <Trash2 size={14} />
                </chakra.button>
              )}
            </div>
          );
        })}
      </chakra.div>
    </PanelScroll>
  );
}
