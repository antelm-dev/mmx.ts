import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { chakra } from "@chakra-ui/react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
  openClipsDocument,
  openEnemyDocument,
  openSlicerDocument,
  openTilesetDocument,
} from "../app/dock.js";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import { assetGroups, type AssetEntry, type AssetEntryKind } from "../core/assetBrowser.js";
import { ListRow } from "../ui/editor/list-row.js";
import { Panel, PanelNote, PanelScroll, SearchBox } from "../ui/editor/panel.js";
import { CategoryHeader } from "../ui/editor/section-title.js";

const Count = chakra("span", {
  base: {
    fontFamily: "mono",
    fontSize: "9px",
    fontWeight: "medium",
    letterSpacing: "0em",
    textTransform: "none",
    color: "studio.muted",
  },
});
const Badge = chakra("span", {
  base: {
    flex: "none",
    px: "1.5",
    rounded: "sm",
    border: "1px solid",
    borderColor: "studio.border",
    color: "studio.muted",
    fontSize: "9.5px",
  },
});

type BrowserRow =
  | { kind: "header"; key: string; group: AssetEntryKind; label: string; count: number }
  | { kind: "entry"; key: string; entry: AssetEntry };

/** Sounds and fonts have no document: their rows are listed but open nothing. */
const opens = (entry: AssetEntry): boolean => entry.kind !== "sound" && entry.kind !== "font";

/** Open an entry's document tab (C-DOC); an object is picked for placing instead. */
function openEntry(entry: AssetEntry): void {
  switch (entry.kind) {
    case "tileset":
      return openTilesetDocument(entry.id);
    case "enemy":
      return openEnemyDocument(entry.id, entry.label);
    case "animation":
      return openClipsDocument(entry.id);
    case "sprite":
    case "image":
      return openSlicerDocument(entry.id);
    case "object": {
      // selectPalette toggles: only pick it when it is not already the one placed.
      const state = editor.store.get();
      if (state.activeTool !== "place" || state.placingDefinitionId !== entry.id)
        editor.selectPalette(entry.id);
      return;
    }
  }
}

/** Side view: every asset of the project (and every enemy), searchable; double-click or Enter opens one. */
export function AssetBrowserPanel() {
  const { project } = useProjectSession();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Partial<Record<AssetEntryKind, boolean>>>({});
  const [selected, setSelected] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => assetGroups(project?.manifest, projectSession.gameData().data, query),
    // The merged game data changes with the project's data/game.json.
    [project?.manifest, project?.gameData, query],
  );
  const rows = useMemo<BrowserRow[]>(
    () =>
      groups.flatMap((g): BrowserRow[] => [
        {
          kind: "header",
          key: `h:${g.kind}`,
          group: g.kind,
          label: g.label,
          count: g.entries.length,
        },
        ...(collapsed[g.kind]
          ? []
          : g.entries.map((entry) => ({
              kind: "entry" as const,
              key: `${entry.kind}:${entry.id}`,
              entry,
            }))),
      ]),
    [groups, collapsed],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === "header" ? 30 : 40),
    overscan: 12,
  });

  const onKeyDown = (e: KeyboardEvent, entry: AssetEntry): void => {
    if (e.key !== "Enter") return;
    // Not a click: Enter opens, like a double-click.
    e.preventDefault();
    setSelected(`${entry.kind}:${entry.id}`);
    if (opens(entry)) openEntry(entry);
  };

  return (
    <Panel data-testid="asset-browser">
      <SearchBox>
        <Search size={16} />
        <input
          placeholder="Search assets…"
          aria-label="Search assets"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={15} />
          </button>
        )}
      </SearchBox>
      {!project && <PanelNote>Open a project to see its assets.</PanelNote>}
      <PanelScroll ref={scrollRef}>
        {rows.length === 0 && <PanelNote>No assets match your search.</PanelNote>}
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
              const isCollapsed = collapsed[row.group] === true;
              return (
                <CategoryHeader
                  as="button"
                  key={v.key}
                  w="full"
                  gap="1.5"
                  cursor="pointer"
                  style={style}
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed({ ...collapsed, [row.group]: !isCollapsed })}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {row.label}
                  <Count>{row.count}</Count>
                </CategoryHeader>
              );
            }
            const { entry } = row;
            return (
              <div key={v.key} style={style}>
                <ListRow
                  active={selected === row.key}
                  title={entry.id}
                  data-asset-kind={entry.kind}
                  onClick={() => setSelected(row.key)}
                  onDoubleClick={() => opens(entry) && openEntry(entry)}
                  onKeyDown={(e) => onKeyDown(e, entry)}
                >
                  <chakra.span minW="0" flex="1" truncate>
                    {entry.label}
                  </chakra.span>
                  {entry.builtIn && <Badge>built-in</Badge>}
                </ListRow>
              </div>
            );
          })}
        </chakra.div>
      </PanelScroll>
    </Panel>
  );
}
