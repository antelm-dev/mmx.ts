import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
import { btnCls, cx, ctxItemCls, menu } from "../ui.js";
import { Tooltip } from "./Tooltip.js";

const divider = "w-px h-4 mx-0.5 bg-border";
const group = "flex items-center gap-0.5";

/** Fixed command bar above the Dockview workspace. */
export function Toolbar() {
  const snap = useEditorSnapshot();
  const playing = snap.state.mode === "play";
  const tool = snap.state.activeTool;
  const zoomPercent = Math.round(snap.state.zoom * 100);

  return (
    <div className="relative z-[5] h-9 px-2.5 flex items-center gap-1.5 bg-gradient-to-b from-chrome-2 to-surface border-b border-border shadow-[0_2px_10px_rgba(0,0,0,0.1)]">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className={group}>
          <Tooltip label="Undo (Ctrl+Z)">
            <button
              className={btnCls({ icon: true })}
              disabled={!snap.canUndo || playing}
              onClick={() => editor.undo()}
              aria-label="Undo"
            >
              <Undo2 size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Redo (Ctrl+Shift+Z)">
            <button
              className={btnCls({ icon: true })}
              disabled={!snap.canRedo || playing}
              onClick={() => editor.redo()}
              aria-label="Redo"
            >
              <Redo2 size={14} />
            </button>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={group}>
          <Tooltip label="Select / move — click, drag region, or Shift to add (V)">
            <button
              className={btnCls({ active: tool === "select", icon: true })}
              disabled={playing}
              onClick={() => editor.store.setTool("select")}
              aria-label="Select tool"
            >
              <MousePointer2 size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Paint solid tiles — drag to paint, right-drag / Alt to erase (T)">
            <button
              className={btnCls({ active: tool === "tile", icon: true })}
              disabled={playing}
              onClick={() => editor.toggleTileTool()}
              aria-label="Tile tool"
            >
              <Blocks size={14} />
            </button>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={group}>
          <Tooltip label="Toggle grid (G)">
            <button
              className={btnCls({ active: snap.state.gridVisible })}
              onClick={() => editor.toggleGrid()}
            >
              <Grid3x3 size={13} /> Grid
            </button>
          </Tooltip>
          <Tooltip label="Toggle snapping (Shift+G)">
            <button
              className={btnCls({ active: snap.state.snapEnabled })}
              onClick={() => editor.toggleSnap()}
            >
              <Magnet size={13} /> Snap
            </button>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={cx(group, "max-[1500px]:hidden")}>
          <Tooltip label="Zoom out (Ctrl+-)">
            <button
              className={btnCls({ icon: true })}
              onClick={() => editor.zoomOut()}
              aria-label="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
          </Tooltip>
          <span className="min-w-[38px] text-fg-2 font-mono text-[10.5px] text-center">
            {zoomPercent}%
          </span>
          <Tooltip label="Zoom in (Ctrl+=)">
            <button
              className={btnCls({ icon: true })}
              onClick={() => editor.zoomIn()}
              aria-label="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Fit level to view (F)">
            <button className={btnCls()} onClick={() => editor.fit()}>
              <Maximize size={13} /> Fit
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 z-[1] px-0.5 border border-border-strong/70 rounded-lg bg-bg">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className={cx(
                btnCls(),
                "gap-1.5 max-w-[280px] h-7 text-fg text-[12px] font-[650]",
              )}
              aria-label="Level menu"
            >
              <span className="text-accent text-[8px] font-extrabold tracking-[0.8px]">LEVEL</span>
              <span>{snap.levelTitle}</span>
              <ChevronDown className="text-fg-3" size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menu} sideOffset={6} align="center">
              <DropdownMenu.Item className={ctxItemCls(false)} onSelect={() => editor.newLevel()}>
                <FilePlus2 size={13} /> New Level
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={ctxItemCls(false)}
                onSelect={() => void editor.openLevel()}
              >
                <FolderOpen size={13} /> Open Level…
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="flex items-center flex-none ml-auto">
        <Tooltip label="Play / Stop (Ctrl+Enter)">
          <button
            className={cx(
              "inline-flex items-center justify-center gap-1.5 min-w-[80px] h-7 px-2.5 rounded-lg",
              "border border-transparent text-white text-[12px] font-bold cursor-pointer transition-colors duration-100",
              playing
                ? "bg-danger shadow-[0_3px_10px_rgba(239,68,68,0.25)] hover:bg-[#f05555]"
                : "bg-accent shadow-[0_3px_10px_rgba(59,130,246,0.22)] hover:bg-accent-hover",
            )}
            onClick={() => editor.togglePlay()}
          >
            {playing ? <Square size={11} /> : <Play size={11} />}
            {playing ? "Stop" : "Play"}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
