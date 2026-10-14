import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { chakra } from "@chakra-ui/react";
import { Grid3x3, Magnet, MousePointer2, Paintbrush } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  allDefinitions,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import {
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
} from "../ui/primitives/menu.js";
import { Keycap, OverlayCard } from "../ui/editor/overlay.js";
import { PlaytestDebugger } from "./PlaytestDebugger.js";

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

  const objects = useProjectSession().project?.manifest.objects;
  const placeGroups = useMemo<PlaceGroup[]>(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        defs: allDefinitions().filter((d) => d.category === category),
      })).filter((g) => g.defs.length > 0),
    // `objects` changes whenever the project's definitions (read by allDefinitions) do.
    [objects],
  );

  return (
    <chakra.div
      position="relative"
      h="full"
      minH="0"
      bgImage="radial-gradient(circle at 50% 35%,#111a29 0%,#06090f 55%,#04060a 100%)"
    >
      <chakra.div ref={hostRef} position="absolute" inset="0" overflow="hidden">
        {mode === "edit" && (
          <>
            <chakra.div
              position="absolute"
              zIndex="3"
              pointerEvents="none"
              left="3.5"
              top="3.5"
              display="flex"
              alignItems="center"
              gap="2"
            >
              <OverlayCard
                display="inline-flex"
                alignItems="center"
                gap="2"
                h="8"
                px="2.5"
                bg="rgba(12,17,26,0.9)"
                rounded="lg"
                boxShadow="0 5px 18px rgba(0,0,0,0.28)"
                fontSize="11px"
                fontWeight="bold"
                color="#edf3fc"
              >
                {snap.state.activeTool === "tile" || snap.state.activeTool === "tilePaint" ? (
                  <Paintbrush size={14} color="#4b8eff" />
                ) : (
                  <MousePointer2 size={14} color="#4b8eff" />
                )}
                {snap.state.activeTool === "tile"
                  ? "Tile paint"
                  : snap.state.activeTool === "tilePaint"
                    ? "Tile layer paint"
                    : "Select / move"}
              </OverlayCard>
              <OverlayCard
                display="inline-flex"
                alignItems="center"
                gap="2"
                h="8"
                px="2.5"
                bg="rgba(12,17,26,0.8)"
                borderColor="rgba(64,77,100,0.6)"
                rounded="lg"
                boxShadow="none"
                fontSize="10.5px"
                fontFamily="mono"
                color="#b4c1d4"
              >
                <span>{Math.round(snap.state.zoom * 100)}%</span>
                <chakra.span w="1px" h="3" bg="#3a4960" />
                <Grid3x3 size={12} color={snap.state.gridVisible ? "#4b8eff" : "#7c8da7"} />
                <Magnet size={12} color={snap.state.snapEnabled ? "#4b8eff" : "#7c8da7"} />
              </OverlayCard>
            </chakra.div>
            <OverlayCard
              position="absolute"
              zIndex="3"
              pointerEvents="none"
              left="50%"
              transform="translateX(-50%)"
              bottom="3.5"
              px="3"
              py="2"
              whiteSpace="nowrap"
              bg="rgba(12,17,26,0.9)"
              rounded="10px"
              boxShadow="0 5px 18px rgba(0,0,0,0.28)"
              fontSize="10.5px"
              color="#94a4ba"
            >
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
            </OverlayCard>
          </>
        )}
        {mode === "play" && <PlaytestDebugger />}
      </chakra.div>

      <MenuRoot
        lazyMount
        unmountOnExit
        open={!!contextMenu}
        // zag ignores a controlled `anchorPoint`; a virtual anchor rect places the menu at the click.
        positioning={{
          placement: "bottom-start",
          getAnchorRect: () =>
            contextMenu && { x: contextMenu.clientX, y: contextMenu.clientY, width: 0, height: 0 },
        }}
        onOpenChange={({ open }) => {
          if (!open) editor.closeEmptyContextMenu();
        }}
      >
        <MenuContent maxH="min(420px, calc(100vh - 16px))">
          {contextMenu && (
            <>
              <MenuLabel fontFamily="mono" textTransform="none" letterSpacing="normal" pb="1.5">
                Cell {contextMenu.col}, {contextMenu.row}
              </MenuLabel>
              <MenuLabel>Terrain</MenuLabel>
              {contextMenu.tileSolid ? (
                <MenuItem value="tile-remove" onSelect={() => editor.setTileAtContext(false)}>
                  <Swatch style={{ border: "1px solid #ff5a5a" }} />
                  Remove solid tile
                </MenuItem>
              ) : (
                <MenuItem value="tile-add" onSelect={() => editor.setTileAtContext(true)}>
                  <Swatch style={{ background: "#33507a", boxShadow: SWATCH_RING }} />
                  Add solid tile
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuLabel>Place</MenuLabel>
              <div style={{ overflowY: "auto", minHeight: 0, maxHeight: 260 }}>
                {placeGroups.map((group) => (
                  <div key={group.category}>
                    <MenuLabel pt="2">{group.label}</MenuLabel>
                    {group.defs.map((def) => (
                      <MenuItem
                        key={def.id}
                        value={`place:${def.id}`}
                        onSelect={() => editor.placeAtContext(def.id)}
                      >
                        <Swatch style={{ background: def.editor.color, boxShadow: SWATCH_RING }} />
                        {def.icon} {def.name}
                      </MenuItem>
                    ))}
                  </div>
                ))}
              </div>
              <MenuSeparator />
              <MenuItem value="clear-selection" onSelect={() => editor.store.clearSelection()}>
                Clear selection
              </MenuItem>
              <MenuItem value="grid" onSelect={() => editor.toggleGrid()}>
                {snap.state.gridVisible ? "Hide grid" : "Show grid"}
              </MenuItem>
              <MenuItem value="snap" onSelect={() => editor.toggleSnap()}>
                {snap.state.snapEnabled ? "Disable snap" : "Enable snap"}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </MenuRoot>
    </chakra.div>
  );
}

const SWATCH_RING = "0 0 0 1px rgba(255,255,255,0.15)";

function Swatch({ style }: { style: CSSProperties }) {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: 3,
        flex: "none",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

function HintDot() {
  return (
    <chakra.span
      display="inline-block"
      w="0.5"
      h="0.5"
      mx="2"
      rounded="full"
      bg="#7c8da7"
      verticalAlign="middle"
    />
  );
}
