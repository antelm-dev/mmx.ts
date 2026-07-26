import { useEffect, useMemo, useRef } from "react";
import { Grid3x3, Magnet, MousePointer2, Paintbrush } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { cx, ctxItemCls, menu } from "../ui.js";
import { PlaytestDebugger } from "./PlaytestDebugger.js";

const ctxCat = "text-[10px] uppercase tracking-[0.5px] text-muted pt-2 px-3 pb-0.5";

interface PlaceGroup {
  category: string;
  label: string;
  defs: GameObjectDefinition[];
}

/**
 * Hosts the Pixi editing surface (and, in Play mode, the game renderer's canvas).
 * The heavy lifting stays in the framework-agnostic {@link EditorViewport} and
 * the playtest controller; this component only supplies the host element, the
 * empty-cell placement menu, and — in Play mode — the {@link PlaytestDebugger}.
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
        Math.min(
          contextMenu.clientY,
          window.innerHeight - Math.min(menuH, window.innerHeight - 16) - 8,
        ),
      ),
    };
  }, [contextMenu]);

  return (
    <div className="relative h-full min-h-0 bg-[radial-gradient(circle_at_50%_35%,#111a29_0%,#06090f_55%,#04060a_100%)]">
      <div ref={hostRef} className="absolute inset-0 overflow-hidden">
        {mode === "edit" && (
          <>
            <div className="absolute z-[3] pointer-events-none left-3.5 top-3.5 flex items-center gap-2">
              <div className="inline-flex items-center gap-2 h-8 px-2.5 text-[11px] font-bold text-fg bg-[rgba(12,17,26,0.9)] border border-[rgba(64,77,100,0.72)] rounded-lg shadow-[0_5px_18px_rgba(0,0,0,0.28)] backdrop-blur-[10px]">
                {snap.state.activeTool === "tile" ? (
                  <Paintbrush size={14} className="text-accent" />
                ) : (
                  <MousePointer2 size={14} className="text-accent" />
                )}
                {snap.state.activeTool === "tile" ? "Tile paint" : "Select / move"}
              </div>
              <div className="inline-flex items-center gap-2 h-8 px-2.5 text-[10.5px] font-mono text-fg-2 bg-[rgba(12,17,26,0.8)] border border-[rgba(64,77,100,0.6)] rounded-lg backdrop-blur-[10px]">
                <span>{Math.round(snap.state.zoom * 100)}%</span>
                <span className="w-px h-3 bg-border-strong" />
                <Grid3x3
                  size={12}
                  className={snap.state.gridVisible ? "text-accent" : "text-fg-3"}
                />
                <Magnet
                  size={12}
                  className={snap.state.snapEnabled ? "text-accent" : "text-fg-3"}
                />
              </div>
            </div>
            <div className="absolute z-[3] text-[10.5px] pointer-events-none left-1/2 -translate-x-1/2 bottom-3.5 text-[#94a4ba] bg-[rgba(12,17,26,0.9)] border border-[rgba(64,77,100,0.72)] rounded-[10px] px-3 py-2 shadow-[0_5px_18px_rgba(0,0,0,0.28)] backdrop-blur-[10px] whitespace-nowrap">
              {snap.state.activeTool === "tile" ? (
                <>
                  <Keycap>T</Keycap> paint tiles <HintDot /> <Keycap>Alt</Keycap> erase <HintDot />{" "}
                  <Keycap>V</Keycap> select
                </>
              ) : (
                <>
                  Drag to select objects/tiles <HintDot /> <Keycap>Shift</Keycap> add <HintDot />{" "}
                  <Keycap>Space</Keycap> pan <HintDot /> <Keycap>T</Keycap> paint
                </>
              )}
            </div>
          </>
        )}
        {mode === "play" && (
          <>
            <PlaytestDebugger />
            <div className="absolute z-[3] text-[10.5px] font-mono pointer-events-none bottom-3 left-1/2 -translate-x-1/2 bg-[rgba(76,141,255,0.15)] border border-[#4c8dff] text-menu-fg-hover rounded-[20px] px-3.5 py-[5px]">
              ● Play — WASD/Arrows move · Space jump · X dash · C fire · Esc to stop
            </div>
          </>
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
            <div className="text-[10px] uppercase tracking-[0.5px] text-muted pt-1 px-3 pb-0.5">
              Terrain
            </div>
            {menuPos.tileSolid ? (
              <button className={ctxItemCls()} onClick={() => editor.setTileAtContext(false)}>
                <span className="w-3 h-3 rounded-[3px] flex-none border border-[#ff5a5a]" />
                <span>Remove solid tile</span>
              </button>
            ) : (
              <button className={ctxItemCls()} onClick={() => editor.setTileAtContext(true)}>
                <span className="w-3 h-3 rounded-[3px] flex-none bg-[#33507a] shadow-[0_0_0_1px_rgba(255,255,255,0.15)]" />
                <span>Add solid tile</span>
              </button>
            )}
            <div className="h-px bg-popover-border my-1" />
            <div className="text-[10px] uppercase tracking-[0.5px] text-muted pt-1 px-3 pb-0.5">
              Place
            </div>
            <div className="overflow-y-auto min-h-0 max-h-[260px]">
              {placeGroups.map((group) => (
                <div key={group.category}>
                  <div className={ctxCat}>{group.label}</div>
                  {group.defs.map((def) => (
                    <button
                      key={def.id}
                      className={ctxItemCls()}
                      onClick={() => editor.placeAtContext(def.id)}
                    >
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

function Keycap({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[19px] h-[19px] mx-1 px-1.5 rounded-[5px] border border-border-strong bg-raised text-[9px] font-mono font-bold text-fg">
      {children}
    </span>
  );
}

function HintDot() {
  return <span className="inline-block w-0.5 h-0.5 mx-2 rounded-full bg-fg-3 align-middle" />;
}
