import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, EyeOff, Lock, Plus, Search, Unlock, X } from "lucide-react";
import { DECORATION_LAYERS, type DecorationLayer } from "@mmx/content-schema";
import { DECORATION_ASSETS, type DecorationAsset } from "@mmx/renderer-pixi";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { cx, itemCls, panel, scroll, sectionTitle } from "../ui.js";
import { SpritePreview } from "./SpritePreview.js";

const cat =
  "flex items-end text-[9.5px] uppercase tracking-[0.7px] text-fg-2 pt-[14px] px-3.5 pb-[5px] font-extrabold";
const itemName = "min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis";

const layerBtn =
  "inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-3 hover:text-fg hover:bg-hover cursor-pointer";

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
    <div className={panel}>
      <div className="flex items-center gap-2 h-9 mt-3 mx-3 mb-2 px-2.5 border border-border-strong rounded-lg bg-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-[border-color,box-shadow] duration-[120ms] focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]">
        <Search size={16} className="text-fg-3" />
        <input
          className="min-w-0 flex-1 border-0 outline-0 bg-transparent text-fg text-xs placeholder:text-fg-3"
          placeholder="Search decorations…"
          aria-label="Search decorations"
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
      <DecorationList query={query} snap={snap} />
      <LayerToggles snap={snap} />
    </div>
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
      <div className={scroll} ref={scrollRef}>
        <div className="px-3 py-3.5 text-muted text-xs">No decorations match your search.</div>
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
          const { asset } = row;
          return (
            <div key={v.key} style={style}>
              <button
                className={itemCls(isActive(asset.id))}
                title={`Place ${asset.name}`}
                onClick={() => editor.selectDecorationPalette(asset.id)}
              >
                <SpritePreview assetId={asset.id} size={28} />
                <span className={itemName}>{asset.name}</span>
                <span className="grid place-items-center w-6 h-6 rounded-md opacity-0 bg-raised text-fg-2 ring-1 ring-border group-hover:opacity-100 group-hover:text-accent transition-opacity">
                  <Plus size={16} strokeWidth={2.5} />
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LayerToggles({ snap }: { snap: ReturnType<typeof useEditorSnapshot> }) {
  const vis = snap.state.decorationLayerVisible;
  const locks = snap.state.decorationLayerLocked;

  return (
    <div className="flex-none border-t border-border">
      <div className={cx(sectionTitle, "pt-2 pb-1")}>Layers</div>
      {DECORATION_LAYERS.map((layer: DecorationLayer) => (
        <div key={layer} className="flex items-center gap-1.5 px-3 py-0.5 text-xs text-fg-2">
          <button
            className={layerBtn}
            title={vis[layer] ? `Hide ${layer}` : `Show ${layer}`}
            onClick={() => editor.store.setDecorationLayerVisible(layer, !vis[layer])}
          >
            {vis[layer] ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            className={layerBtn}
            title={locks[layer] ? `Unlock ${layer}` : `Lock ${layer}`}
            onClick={() => editor.store.setDecorationLayerLocked(layer, !locks[layer])}
          >
            {locks[layer] ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <span className="flex-1 min-w-0 truncate">{layer}</span>
        </div>
      ))}
    </div>
  );
}
