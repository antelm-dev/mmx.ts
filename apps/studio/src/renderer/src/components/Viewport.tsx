import { useEffect, useMemo, useRef } from "react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { cx, ctxItemCls, menu } from "../ui.js";

const ctxCat = "text-[10px] uppercase tracking-[0.5px] text-muted pt-2 px-3 pb-0.5";

interface PlaceGroup {
  category: string;
  label: string;
  defs: GameObjectDefinition[];
}

/**
 * Hosts the Pixi editing surface (and, in Play mode, the game renderer's canvas).
 * The heavy lifting stays in the framework-agnostic {@link EditorViewport} /
 * {@link PlaySession}; this component only supplies the host element and the
 * empty-cell placement menu.
 */
export function Viewport() {
  const snap = useEditorSnapshot();
  const mode = snap.state.mode;
  const hostRef = useRef<HTMLDivElement>(null);
  const contextMenu = useUiStore((s) => s.contextMenu);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    void editor.attachViewport(host).then(() => {
      if (disposed) editor.detachViewport();
    });
    return () => {
      disposed = true;
      editor.detachViewport();
    };
  }, []);

  const placeGroups = useMemo<PlaceGroup[]>(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        defs: OBJECT_DEFINITIONS.filter((d) => d.category === category),
      })).filter((g) => g.defs.length > 0),
    [],
  );

  const menuPos = useMemo(() => {
    if (!contextMenu) return null;
    const menuW = 220;
    const menuH = 420;
    return {
      ...contextMenu,
      clientX: Math.max(8, Math.min(contextMenu.clientX, window.innerWidth - menuW - 8)),
      clientY: Math.max(
        8,
        Math.min(contextMenu.clientY, window.innerHeight - Math.min(menuH, window.innerHeight - 16) - 8),
      ),
    };
  }, [contextMenu]);

  return (
    <div className="relative h-full min-h-0 bg-[#05070d]">
      <div ref={hostRef} className="absolute inset-0 overflow-hidden">
        {mode === "edit" && (
          <div className="absolute z-[3] text-[11px] font-mono pointer-events-none left-3.5 bottom-3.5 text-[#8390a5] bg-[rgba(12,17,26,0.88)] border border-[rgba(64,77,100,0.72)] rounded-lg px-2.5 py-[7px] shadow-[0_5px_18px_rgba(0,0,0,0.28)] backdrop-blur-[10px]">
            Scroll: zoom · Middle / Space-drag: pan · Right-click empty: place · Del: remove
          </div>
        )}
        {mode === "play" && (
          <div className="absolute z-[3] text-[11px] font-mono pointer-events-none top-3 left-1/2 -translate-x-1/2 bg-[rgba(76,141,255,0.15)] border border-[#4c8dff] text-menu-fg-hover rounded-[20px] px-3.5 py-[5px]">
            ● Play mode — WASD / Arrows move · Space jump · X dash · C fire · Esc to stop
          </div>
        )}
      </div>

      {menuPos && (
        <>
          <div
            className="fixed inset-0 z-40"
            onPointerDown={(e) => {
              if (e.button !== 2) editor.closeEmptyContextMenu();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              editor.openEmptyContextMenuAt(e.clientX, e.clientY);
            }}
          />
          <div
            className={cx(menu, "fixed max-h-[min(420px,calc(100vh-16px))]")}
            style={{ left: menuPos.clientX, top: menuPos.clientY }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-[10px] text-muted pt-1 px-3 pb-1.5">
              Cell {menuPos.col}, {menuPos.row}
            </div>
            <div className="text-[10px] uppercase tracking-[0.5px] text-muted pt-1 px-3 pb-0.5">Place</div>
            <div className="overflow-y-auto min-h-0 max-h-[260px]">
              {placeGroups.map((group) => (
                <div key={group.category}>
                  <div className={ctxCat}>{group.label}</div>
                  {group.defs.map((def) => (
                    <button key={def.id} className={ctxItemCls()} onClick={() => editor.placeAtContext(def.id)}>
                      <span
                        className="w-3 h-3 rounded-[3px] flex-none shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
                        style={{ background: def.editor.color }}
                      />
                      <span>
                        {def.icon} {def.name}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="h-px bg-popover-border my-1" />
            <button
              className={ctxItemCls()}
              onClick={() => {
                editor.store.clearSelection();
                editor.closeEmptyContextMenu();
              }}
            >
              Clear selection
            </button>
            <button
              className={ctxItemCls()}
              onClick={() => {
                editor.toggleGrid();
                editor.closeEmptyContextMenu();
              }}
            >
              {snap.state.gridVisible ? "Hide grid" : "Show grid"}
            </button>
            <button
              className={ctxItemCls()}
              onClick={() => {
                editor.toggleSnap();
                editor.closeEmptyContextMenu();
              }}
            >
              {snap.state.snapEnabled ? "Disable snap" : "Enable snap"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
