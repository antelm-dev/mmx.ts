import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { chakra } from "@chakra-ui/react";
import { Search, X } from "lucide-react";
import { DECORATION_ASSETS, type DecorationAsset } from "@mmx/renderer-pixi";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { ListRow, ListRowAdd } from "../ui/editor/list-row.js";
import { Panel, PanelNote, PanelScroll, SearchBox } from "../ui/editor/panel.js";
import { CategoryHeader } from "../ui/editor/section-title.js";
import { SpritePreview } from "./SpritePreview.js";

type PaletteRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "asset"; key: string; asset: DecorationAsset };

const CATEGORY_ORDER: string[] = [];
for (const a of DECORATION_ASSETS) {
  if (!CATEGORY_ORDER.includes(a.category)) CATEGORY_ORDER.push(a.category);
}

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function AssetsPanel() {
  const snap = useEditorSnapshot();
  const [query, setQuery] = useState("");

  return (
    <Panel>
      <SearchBox>
        <Search size={16} />
        <input
          placeholder="Search decorations…"
          aria-label="Search decorations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={15} />
          </button>
        )}
      </SearchBox>
      <DecorationList query={query} snap={snap} />
    </Panel>
  );
}

function DecorationList({
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
      const assets = DECORATION_ASSETS.filter(
        (a) =>
          a.category === category &&
          (!q || a.name.toLowerCase().includes(q) || a.category.includes(q)),
      );
      if (assets.length === 0) continue;
      out.push({ kind: "header", key: `h:${category}`, label: categoryLabel(category) });
      for (const asset of assets) out.push({ kind: "asset", key: asset.id, asset });
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
    active.activeTool === "placeDecoration" && active.placingAssetId === id;

  if (rows.length === 0) {
    return (
      <PanelScroll ref={scrollRef}>
        <PanelNote>No decorations match your search.</PanelNote>
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
          const { asset } = row;
          return (
            <div key={v.key} style={style}>
              <ListRow
                active={isActive(asset.id)}
                title={`Place ${asset.name}`}
                onClick={() => editor.selectDecorationPalette(asset.id)}
              >
                <SpritePreview assetId={asset.id} size={28} />
                <chakra.span minW="0" flex="1" truncate>
                  {asset.name}
                </chakra.span>
                <ListRowAdd />
              </ListRow>
            </div>
          );
        })}
      </chakra.div>
    </PanelScroll>
  );
}
