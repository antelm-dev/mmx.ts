import { useEffect, useMemo, useRef } from "react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";

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
    <div className="viewport-root">
      <div ref={hostRef} className="viewport-host">
        {mode === "edit" && (
          <div className="viewport-hint">
            Scroll: zoom · Middle / Space-drag: pan · Right-click empty: place · Del: remove
          </div>
        )}
        {mode === "play" && (
          <div className="play-banner">
            ● Play mode — WASD / Arrows move · Space jump · X dash · C fire · Esc to stop
          </div>
        )}
      </div>

      {menuPos && (
        <>
          <div
            className="ctx-backdrop"
            onPointerDown={(e) => {
              if (e.button !== 2) editor.closeEmptyContextMenu();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              editor.openEmptyContextMenuAt(e.clientX, e.clientY);
            }}
          />
          <div
            className="ctx-menu"
            style={{ left: menuPos.clientX, top: menuPos.clientY }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="ctx-header">
              Cell {menuPos.col}, {menuPos.row}
            </div>
            <div className="ctx-section">Place</div>
            <div className="ctx-scroll">
              {placeGroups.map((group) => (
                <div key={group.category}>
                  <div className="ctx-cat">{group.label}</div>
                  {group.defs.map((def) => (
                    <button
                      key={def.id}
                      className="ctx-item"
                      onClick={() => editor.placeAtContext(def.id)}
                    >
                      <span className="swatch" style={{ background: def.editor.color }} />
                      <span>
                        {def.icon} {def.name}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="ctx-sep" />
            <button
              className="ctx-item"
              onClick={() => {
                editor.store.clearSelection();
                editor.closeEmptyContextMenu();
              }}
            >
              Clear selection
            </button>
            <button
              className="ctx-item"
              onClick={() => {
                editor.toggleGrid();
                editor.closeEmptyContextMenu();
              }}
            >
              {snap.state.gridVisible ? "Hide grid" : "Show grid"}
            </button>
            <button
              className="ctx-item"
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
