import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { chakra } from "@chakra-ui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Copy, Crosshair, Trash2, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  effectiveValue,
  definitionFor,
  type DecorationInstance,
  type GameObjectDefinition,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import { getDecorationAsset } from "@mmx/renderer-pixi";
import type { DockviewPanelApi } from "dockview-react";
import { editor, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { selectedDecorationIds, selectedObjectIds } from "../core/EditorStore.js";
import { useUiStore } from "../store/uiStore.js";
import { ListRow } from "../ui/editor/list-row.js";
import { Panel, PanelNote, PanelScroll } from "../ui/editor/panel.js";
import { CategoryHeader, SectionTitle } from "../ui/editor/section-title.js";
import {
  MenuContent,
  MenuContextTrigger,
  MenuItem,
  MenuRoot,
  MenuSeparator,
} from "../ui/primitives/menu.js";
import { SpritePreview } from "./SpritePreview.js";

/** Muted monospace count after a category / section label. */
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
const RowText = chakra("span", {
  base: { display: "flex", flexDirection: "column", gap: "1px", minW: "0" },
});
const RowCoords = chakra("span", {
  base: { fontFamily: "mono", fontSize: "10px", color: "studio.muted" },
  variants: { active: { true: { color: "studio.accent" } } },
});

type SceneItem = { inst: LevelObjectInstance; def: GameObjectDefinition };
type SceneRow =
  | { kind: "header"; key: string; category: string; label: string; count: number }
  | { kind: "item"; key: string; item: SceneItem };

/** Detachable dock panel: the virtualized scene tree. Tab title tracks the object count. */
export function ScenePanel({ api }: { api?: DockviewPanelApi }): ReactElement {
  const snap = useEditorSnapshot();
  const decorations = snap.state.document.decorations;
  const objects = useProjectSession().project?.manifest.objects;

  const sceneItems = useMemo<SceneItem[]>(
    () =>
      snap.state.document.objects.map((inst) => ({
        inst,
        def: definitionFor(inst.definitionId),
      })),
    // `objects` changes whenever the project's definitions (read by the lookups) do.
    [snap.state.document.objects, objects],
  );

  const total = sceneItems.length + decorations.length;
  useEffect(() => api?.setTitle(`Scene (${total})`), [api, total]);

  return (
    <Panel>
      <SceneList items={sceneItems} snap={snap} />
      {decorations.length > 0 && <DecorationSceneList decorations={decorations} snap={snap} />}
    </Panel>
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
  const rowRef = useRef<HTMLElement>(null);
  return (
    <MenuRoot
      lazyMount
      unmountOnExit
      onOpenChange={({ open }) => {
        if (open) {
          const ids = selectedObjectIds(editor.store.get().selection);
          if (!ids.includes(inst.id)) editor.store.selectObjects([inst.id]);
          return;
        }
        // Context menus skip focus return; hand it back to the row unless the user already moved it.
        const active = document.activeElement;
        if (!active || active === document.body || active.closest("[role=menu]")) {
          rowRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      <MenuContextTrigger asChild ref={rowRef}>
        {children}
      </MenuContextTrigger>
      <MenuContent>
        <MenuItem value="focus" onSelect={() => editor.focusObject(inst.id)}>
          <Crosshair size={14} /> Focus in viewport
        </MenuItem>
        <MenuItem value="duplicate" onSelect={() => editor.duplicateSelection()}>
          <Copy size={14} /> {many ? `Duplicate ${selectedCount} objects` : "Duplicate"}
        </MenuItem>
        {many && (
          <MenuItem value="clear" onSelect={() => editor.store.clearSelection()}>
            <X size={14} /> Clear selection
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem
          value="delete"
          color="studio.dangerFg"
          _highlighted={{ bg: "studio.danger", color: "white" }}
          onSelect={() => editor.deleteSelection()}
        >
          <Trash2 size={14} /> {many ? `Delete ${selectedCount} objects` : "Delete"}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
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
      <PanelScroll ref={scrollRef}>
        <PanelNote>No objects in the scene. Place one from the Object Palette.</PanelNote>
      </PanelScroll>
    );
  }

  return (
    <>
      <chakra.div display="flex" alignItems="center" justifyContent="flex-end" px="3" pt="2" pb="1" flex="none">
        <chakra.button
          display="inline-flex"
          alignItems="center"
          gap="1.5"
          h="6"
          px="2"
          rounded="md"
          fontSize="10px"
          fontWeight="bold"
          textTransform="uppercase"
          letterSpacing="0.5px"
          color="studio.fgTertiary"
          _hover={{ color: "studio.fgSecondary", bg: "studio.hover" }}
          aria-pressed={grouped}
          title={grouped ? "Show a flat list" : "Group objects by category"}
          onClick={() => setGrouped(!grouped)}
        >
          {grouped ? "Grouped" : "Flat"}
        </chakra.button>
      </chakra.div>
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
              const isCollapsed = collapsed[row.category] === true;
              return (
                <CategoryHeader
                  as="button"
                  key={v.key}
                  w="full"
                  gap="1.5"
                  cursor="pointer"
                  style={style}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(row.category)}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {row.label}
                  <Count>{row.count}</Count>
                </CategoryHeader>
              );
            }
            const { inst, def } = row.item;
            const active = selected.has(inst.id);
            return (
              <div key={v.key} style={style}>
                <SceneRowMenu inst={inst} selectedCount={selectedCount}>
                  <ListRow
                    active={active}
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
                    <RowText>
                      <chakra.span truncate>{def.name}</chakra.span>
                      <RowCoords active={active}>
                        {inst.x}, {inst.y}
                      </RowCoords>
                    </RowText>
                  </ListRow>
                </SceneRowMenu>
              </div>
            );
          })}
        </chakra.div>
      </PanelScroll>
    </>
  );
}

function DecorationSceneList({
  decorations,
  snap,
}: {
  decorations: readonly DecorationInstance[];
  snap: ReturnType<typeof useEditorSnapshot>;
}) {
  const selectedIds = selectedDecorationIds(snap.state.selection);
  const selected = new Set(selectedIds);

  return (
    <chakra.div flex="none" borderTop="1px solid" borderColor="studio.border">
      <SectionTitle pt="2" pb="1">
        Decorations
        <Count ml="1.5">{decorations.length}</Count>
      </SectionTitle>
      {decorations.map((dec) => {
        const asset = getDecorationAsset(dec.assetId);
        const name = asset?.name ?? dec.assetId;
        const active = selected.has(dec.id);
        return (
          <ListRow
            key={dec.id}
            active={active}
            title={dec.id}
            onClick={(e) =>
              e.ctrlKey || e.metaKey
                ? editor.toggleDecorationSelection(dec.id)
                : editor.focusDecoration(dec.id)
            }
          >
            <SpritePreview assetId={dec.assetId} size={28} />
            <RowText>
              <chakra.span truncate>{name}</chakra.span>
              <RowCoords active={active}>
                {dec.x}, {dec.y} · {dec.layer}
              </RowCoords>
            </RowText>
          </ListRow>
        );
      })}
    </chakra.div>
  );
}
