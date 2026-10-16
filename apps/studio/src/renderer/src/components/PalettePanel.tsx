import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { chakra } from "@chakra-ui/react";
import { Copy, Pencil, Search, Trash2, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  allDefinitions,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { openEnemyDocument } from "../app/dock.js";
import { DEFINITIONS_SCOPE } from "../app/editorKeyboard.js";
import { duplicateObject, freeObjectId } from "../core/objectDefinitions.js";
import { editor, projectSession, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { ListRow, ListRowAdd } from "../ui/editor/list-row.js";
import { Panel, PanelActions, PanelNote, PanelScroll, SearchBox } from "../ui/editor/panel.js";
import { CategoryHeader } from "../ui/editor/section-title.js";
import { definitionDeleteBlocker } from "./ObjectDefinitionSection.js";
import { SpritePreview } from "./SpritePreview.js";

type PaletteRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "def"; key: string; def: GameObjectDefinition };

/**
 * Palette → Duplicate: a project object or enemy is copied under a new id; any
 * other built-in becomes a new project object based on it.
 */
function duplicateDefinition(def: GameObjectDefinition): void {
  const objects = projectSession.getSnapshot().project?.manifest.objects ?? [];
  if (def.baseId) projectSession.setObjects(duplicateObject(objects, def.id));
  else if (def.category === "enemy") editor.duplicateEnemy(String(def.fields.Kind), def.name);
  else
    projectSession.setObjects([
      ...objects,
      { id: freeObjectId(def.id, objects), name: `${def.name} copy`, base: def.id },
    ]);
}

const rowAction = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  display: "grid",
  placeItems: "center",
  w: "6",
  h: "6",
  rounded: "md",
  color: "studio.fgTertiary",
  cursor: "pointer",
  _disabled: {
    opacity: 0.35,
    cursor: "default",
    _hover: { color: "studio.fgTertiary", bg: "transparent" },
  },
} as const;

/** Detachable dock panel: the searchable, virtualized object palette. */
export function PalettePanel() {
  const snap = useEditorSnapshot();
  const query = useUiStore((s) => s.paletteQuery);
  const setQuery = useUiStore((s) => s.setPaletteQuery);
  const session = useProjectSession();
  const openNewObject = useUiStore((s) => s.openNewObject);
  // New ids are picked against the merged data, which is the engine's alone while data/game.json has errors.
  const broken = session.open && projectSession.gameData().issues.length > 0;

  return (
    <Panel {...DEFINITIONS_SCOPE}>
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
      {/* New objects are saved in the project: its manifest, or data/game.json for enemies. */}
      {session.open && (
        <PanelActions>
          <ActionButton
            disabled={broken}
            title={broken ? "Fix the data/game.json errors in Problems first" : undefined}
            onClick={() => openNewObject()}
          >
            New object…
          </ActionButton>
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
  const { project, open: projectOpen } = useProjectSession();
  // Enemy copies get ids picked against the merged data, the engine's alone while data/game.json has errors.
  const broken = projectOpen && projectSession.gameData().issues.length > 0;

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
          const blocker = def.baseId ? definitionDeleteBlocker(def.id) : null;
          // Enemy types (not project presets of them) open in the Enemy panel.
          const editable = projectOpen && def.category === "enemy" && !def.baseId;
          const duplicable = projectOpen && def.id !== "spawn";
          const copyEnemy = def.category === "enemy" && !def.baseId;
          return (
            // Duplicate shows on hover and keyboard focus, like the row's add icon.
            <chakra.div
              key={v.key}
              style={style}
              css={{
                "& [data-row-reveal]": { opacity: 0 },
                "&:is(:hover, :focus-within) [data-row-reveal]": { opacity: 1 },
              }}
            >
              <ListRow
                active={isActive(def.id)}
                title={`Place ${def.name}`}
                onClick={() => editor.selectPalette(def.id)}
                pr={def.baseId || editable ? "10" : undefined}
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
                  {...rowAction}
                  right="52px"
                  _hover={{ color: "studio.dangerFg", bg: "studio.hover" }}
                  disabled={!!blocker}
                  aria-label={`Delete ${def.name}`}
                  title={blocker ?? `Delete ${def.name}`}
                  onClick={() => {
                    if (!window.confirm(`Delete the object '${def.name}' from the project?`))
                      return;
                    const objects = projectSession.getSnapshot().project?.manifest.objects ?? [];
                    projectSession.setObjects(objects.filter((o) => o.id !== def.id));
                  }}
                >
                  <Trash2 size={14} />
                </chakra.button>
              )}
              {editable && (
                <chakra.button
                  type="button"
                  {...rowAction}
                  right="52px"
                  _hover={{ color: "studio.fg", bg: "studio.hover" }}
                  aria-label={`Edit ${def.name}`}
                  title={`Edit ${def.name}`}
                  onClick={() => openEnemyDocument(def.id, def.name)}
                >
                  <Pencil size={14} />
                </chakra.button>
              )}
              {duplicable && (
                <chakra.button
                  type="button"
                  data-row-reveal=""
                  {...rowAction}
                  right={def.baseId || editable ? "80px" : "52px"}
                  bg="studio.raised"
                  _hover={{ color: "studio.fg", bg: "studio.hover" }}
                  disabled={copyEnemy && broken}
                  aria-label={`Duplicate ${def.name}`}
                  title={
                    copyEnemy && broken
                      ? "Fix the data/game.json errors in Problems first"
                      : `Duplicate ${def.name}`
                  }
                  onClick={() => duplicateDefinition(def)}
                >
                  <Copy size={14} />
                </chakra.button>
              )}
            </chakra.div>
          );
        })}
      </chakra.div>
    </PanelScroll>
  );
}
