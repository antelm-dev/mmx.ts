import { Box, chakra } from "@chakra-ui/react";
import {
  Blocks,
  ChevronDown,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  Magnet,
  Maximize,
  MousePointer2,
  Play,
  Redo2,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { editor, useEditorSnapshot } from "../app/useEditor.js";

import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../ui/primitives/menu.js";
import { Tooltip } from "./Tooltip.js";

const Divider = chakra("div", { base: { w: "1px", h: "4", mx: "0.5", bg: "studio.border" } });
const Group = chakra("div", { base: { display: "flex", alignItems: "center", gap: "0.5" } });

/** Fixed command bar above the Dockview workspace. */
export function Toolbar() {
  const snap = useEditorSnapshot();
  const playing = snap.state.mode === "play";
  const tool = snap.state.activeTool;
  const zoomPercent = Math.round(snap.state.zoom * 100);

  return (
    <chakra.div
      position="relative"
      zIndex="5"
      h="9"
      px="2.5"
      display="flex"
      alignItems="center"
      gap="1.5"
      bgImage="linear-gradient(to bottom in oklab, {colors.studio.chromeSecondary}, {colors.studio.surface})"
      borderBottom="1px solid"
      borderColor="studio.border"
      boxShadow="0 2px 10px rgba(0,0,0,0.1)"
    >
      <chakra.div display="flex" alignItems="center" gap="2" flex="1" minW="0">
        <Group>
          <Tooltip label="Undo (Ctrl+Z)">
            <ToolbarButton
              icon
              disabled={!snap.canUndo || playing}
              onClick={() => editor.undo()}
              aria-label="Undo"
            >
              <Undo2 size={14} />
            </ToolbarButton>
          </Tooltip>
          <Tooltip label="Redo (Ctrl+Shift+Z)">
            <ToolbarButton
              icon
              disabled={!snap.canRedo || playing}
              onClick={() => editor.redo()}
              aria-label="Redo"
            >
              <Redo2 size={14} />
            </ToolbarButton>
          </Tooltip>
        </Group>

        <Divider />

        <Group>
          <Tooltip label="Select / move — click, drag region, or Shift to add (V)">
            <ToolbarButton
              active={tool === "select"}
              icon
              disabled={playing}
              onClick={() => editor.store.setTool("select")}
              aria-label="Select tool"
            >
              <MousePointer2 size={14} />
            </ToolbarButton>
          </Tooltip>
          <Tooltip label="Paint solid tiles — drag to paint, right-drag / Alt to erase (T)">
            <ToolbarButton
              active={tool === "tile"}
              icon
              disabled={playing}
              onClick={() => editor.toggleTileTool()}
              aria-label="Tile tool"
            >
              <Blocks size={14} />
            </ToolbarButton>
          </Tooltip>
        </Group>

        <Divider />

        <Group>
          <Tooltip label="Toggle grid (G)">
            <ToolbarButton
              active={snap.state.gridVisible}
              onClick={() => editor.toggleGrid()}
            >
              <Grid3x3 size={13} /> Grid
            </ToolbarButton>
          </Tooltip>
          <Tooltip label="Toggle snapping (Shift+G)">
            <ToolbarButton
              active={snap.state.snapEnabled}
              onClick={() => editor.toggleSnap()}
            >
              <Magnet size={13} /> Snap
            </ToolbarButton>
          </Tooltip>
        </Group>

        <Divider />

        <Group css={{ "@media (width < 1500px)": { display: "none" } }}>
          <Tooltip label="Zoom out (Ctrl+-)">
            <ToolbarButton
              icon
              onClick={() => editor.zoomOut()}
              aria-label="Zoom out"
            >
              <ZoomOut size={14} />
            </ToolbarButton>
          </Tooltip>
          <chakra.span
            minW="38px"
            color="studio.fgSecondary"
            fontFamily="mono"
            fontSize="10.5px"
            textAlign="center"
          >
            {zoomPercent}%
          </chakra.span>
          <Tooltip label="Zoom in (Ctrl+=)">
            <ToolbarButton
              icon
              onClick={() => editor.zoomIn()}
              aria-label="Zoom in"
            >
              <ZoomIn size={14} />
            </ToolbarButton>
          </Tooltip>
          <Tooltip label="Fit level to view (F)">
            <ToolbarButton onClick={() => editor.fit()}>
              <Maximize size={13} /> Fit
            </ToolbarButton>
          </Tooltip>
        </Group>
      </chakra.div>

      <chakra.div
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        zIndex="1"
        px="0.5"
        border="1px solid"
        borderColor="studio.borderStrong/70"
        rounded="lg"
        bg="studio.bg"
      >
        <MenuRoot positioning={{ placement: "bottom", gutter: 6 }}>
          <MenuTrigger asChild>
            <ToolbarButton
              maxW="280px"
              color="studio.fg"
              fontSize="12px"
              fontWeight="650"
              aria-label="Level menu"
            >
              <chakra.span
                color="studio.accent"
                fontSize="8px"
                fontWeight="extrabold"
                letterSpacing="0.8px"
              >
                LEVEL
              </chakra.span>
              <span>{snap.levelTitle}</span>
              <Box asChild color="studio.fgTertiary">
                <ChevronDown size={12} />
              </Box>
            </ToolbarButton>
          </MenuTrigger>
          <MenuContent>
            <MenuItem value="new" onSelect={() => editor.newLevel()}>
              <FilePlus2 size={13} /> New Level
            </MenuItem>
            <MenuItem value="open" onSelect={() => void editor.openLevel()}>
              <FolderOpen size={13} /> Open Level…
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </chakra.div>

      <chakra.div display="flex" alignItems="center" flex="none" ml="auto">
        <Tooltip label="Play / Stop (Ctrl+Enter)">
          <ToolbarButton tone={playing ? "danger" : "primary"} onClick={() => editor.togglePlay()}>
            {playing ? <Square size={11} /> : <Play size={11} />}
            {playing ? "Stop" : "Play"}
          </ToolbarButton>
        </Tooltip>
      </chakra.div>
    </chakra.div>
  );
}
