import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { ChevronDown, ChevronRight, Copy, Crosshair, Trash2, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  effectiveValue,
  requireDefinition,
  type GameObjectDefinition,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import type { DockviewPanelApi } from "dockview-react";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { selectedObjectIds } from "../core/EditorStore.js";
import { useUiStore } from "../store/uiStore.js";
import { cx, ctxItemCls, itemCls, menu, panel, scroll } from "../ui.js";
import { SpritePreview } from "./SpritePreview.js";

const ctxDangerItem =
  "flex items-center gap-[9px] w-full text-[12.5px] text-left px-3 py-1.5 cursor-pointer outline-none " +
  "text-danger-fg hover:bg-danger hover:text-white data-[highlighted]:bg-danger data-[highlighted]:text-white";

const cat =
  "flex items-end text-[9.5px] uppercase tracking-[0.7px] text-fg-2 pt-[14px] px-3.5 pb-[5px] font-extrabold";
const emptyNote = "px-3 py-3.5 text-muted text-xs";

type SceneItem = { inst: LevelObjectInstance; def: GameObjectDefinition };
type SceneRow =
  | { kind: "header"; key: string; category: string; label: string; count: number }
  | { kind: "item"; key: string; item: SceneItem };

/** Detachable dock panel: the virtualized scene tree. Tab title tracks the object count. */
export function ScenePanel({ api }: { api?: DockviewPanelApi }): ReactElement {
  const snap = useEditorSnapshot();

  const sceneItems = useMemo<SceneItem[]>(
    () =>
      snap.state.document.objects.map((inst) => ({
        inst,
        def: requireDefinition(inst.definitionId),
      })),
    [snap.state.document.objects],
  );

  useEffect(() => api?.setTitle(`Scene (${sceneItems.length})`), [api, sceneItems.length]);

  return (
    <div className={panel}>
      <SceneList items={sceneItems} snap={snap} />
    </div>
  );
}

/**
 * Right-click menu for a scene row. Acts on the whole selection, so right-
 * clicking an unselected object first selects it (matching file-explorer
 * behavior); right-clicking within a multi-selection keeps it intact.
 */
function SceneRowMenu({
  inst,
  selectedCount,
  children,
}: {
  inst: LevelObjectInstance;
  selectedCount: number;
  children: ReactElement;
}) {
  const many = selectedCount > 1;
  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        const ids = selectedObjectIds(editor.store.get().selection);
        if (open && !ids.includes(inst.id)) {
          editor.store.selectObjects([inst.id]);
        }
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menu} onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenu.Item className={ctxItemCls()} onSelect={() => editor.focusObject(inst.id)}>
            <Crosshair size={14} /> Focus in viewport
          </ContextMenu.Item>
          <ContextMenu.Item className={ctxItemCls()} onSelect={() => editor.duplicateSelection()}>
            <Copy size={14} /> {many ? `Duplicate ${selectedCount} objects` : "Duplicate"}
          </ContextMenu.Item>
          {many && (
            <ContextMenu.Item
              className={ctxItemCls()}
              onSelect={() => editor.store.clearSelection()}
            >
              <X size={14} /> Clear selection
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="h-px bg-popover-border my-1" />
          <ContextMenu.Item className={ctxDangerItem} onSelect={() => editor.deleteSelection()}>
            <Trash2 size={14} /> {many ? `Delete ${selectedCount} objects` : "Delete"}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SceneList({
  items,
  snap,
}: {
  items: SceneItem[];
  snap: ReturnType<typeof useEditorSnapshot>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const grouped = useUiStore((s) => s.sceneGrouped);
  const setGrouped = useUiStore((s) => s.setSceneGrouped);
  const collapsed = useUiStore((s) => s.collapsedSceneGroups);
  const toggleGroup = useUiStore((s) => s.toggleSceneGroup);

  const rows = useMemo<SceneRow[]>(() => {
    if (!grouped) {
      return items.map((item) => ({ kind: "item", key: item.inst.id, item }));
    }
    const out: SceneRow[] = [];
    for (const category of CATEGORY_ORDER) {
      const inCat = items.filter((it) => it.def.category === category);
      if (inCat.length === 0) continue;
      out.push({
        kind: "header",
        key: `h:${category}`,
        category,
        label: CATEGORY_LABELS[category] ?? category,
        count: inCat.length,
      });
      if (collapsed[category]) continue;
      for (const item of inCat) out.push({ kind: "item", key: item.inst.id, item });
    }
    return out;
  }, [items, grouped, collapsed]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === "header" ? 30 : 42),
    overscan: 12,
  });

  const selectedIds = selectedObjectIds(snap.state.selection);
  const selected = new Set(selectedIds);
  const selectedCount = selectedIds.length;
  const sceneFlip = (item: SceneItem) =>
    item.def.category === "enemy" && effectiveValue(item.inst, "FacesRight") === true;

  if (items.length === 0) {
    return (
      <div className={scroll} ref={scrollRef}>
        <div className={emptyNote}>No objects in the scene. Place one from the Object Palette.</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end px-3 pt-2 pb-1 flex-none">
        <button
          className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] font-bold uppercase tracking-[0.5px] text-fg-3 hover:text-fg-2 hover:bg-hover"
          aria-pressed={grouped}
          title={grouped ? "Show a flat list" : "Group objects by category"}
          onClick={() => setGrouped(!grouped)}
        >
          {grouped ? "Grouped" : "Flat"}
        </button>
      </div>
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
              const isCollapsed = collapsed[row.category] === true;
              return (
                <button
                  key={v.key}
                  className={cx(cat, "w-full gap-1.5 cursor-pointer hover:text-fg-2")}
                  style={style}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(row.category)}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {row.label}
                  <span className="font-mono text-[9px] font-medium tracking-normal normal-case text-muted">
                    {row.count}
                  </span>
                </button>
              );
            }
            const { inst, def } = row.item;
            const active = selected.has(inst.id);
            return (
              <div key={v.key} style={style}>
                <SceneRowMenu inst={inst} selectedCount={selectedCount}>
                  <button
                    className={itemCls(active)}
                    title={inst.id}
                    onClick={(e) =>
                      e.ctrlKey || e.metaKey
                        ? editor.toggleObjectSelection(inst.id)
                        : editor.focusObject(inst.id)
                    }
                  >
                    <SpritePreview
                      definitionId={def.id}
                      size={28}
                      flip={sceneFlip(row.item)}
                      fallbackColor={def.editor.color}
                    />
                    <span className="flex flex-col gap-px min-w-0">
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                        {def.name}
                      </span>
                      <span
                        className={cx(
                          "font-mono text-[10px]",
                          active ? "text-[#93c5fd]" : "text-muted",
                        )}
                      >
                        {inst.x}, {inst.y}
                      </span>
                    </span>
                  </button>
                </SceneRowMenu>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
