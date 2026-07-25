import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  FolderOpen,
  Grid3x3,
  Magnet,
  Maximize,
  Play,
  Redo2,
  Save,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { btnCls, cx, ctxItemCls, menu } from "../ui.js";
import { Tooltip } from "./Tooltip.js";

const divider = "w-px h-6 mx-0.5 bg-border";
const group = "flex items-center gap-0.5";

/** Fixed command bar above the Dockview workspace. */
export function Toolbar() {
  const snap = useEditorSnapshot();
  const playing = snap.state.mode === "play";
  const zoomPercent = Math.round(snap.state.zoom * 100);

  return (
    <div className="relative z-[5] h-14 px-3.5 flex items-center gap-2 bg-gradient-to-b from-[#151b27] to-surface border-b border-border shadow-[0_4px_18px_rgba(0,0,0,0.22)]">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="mr-1.5 text-[15px] font-bold tracking-[0.25px] flex-none" aria-label="MMX Studio">
          MMX <span className="text-accent-hover">Studio</span>
        </div>

        <div className={group}>
          <Tooltip label="Open a level JSON file">
            <button className={btnCls()} onClick={() => void editor.importJson()}>
              <FolderOpen size={15} /> Import
            </button>
          </Tooltip>
          <Tooltip label="Save level JSON (Ctrl+S)">
            <button className={btnCls()} onClick={() => editor.save()}>
              <Save size={15} /> Save
              {snap.dirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#60a5fa] shadow-[0_0_8px_rgba(96,165,250,0.65)]"
                  aria-label="Unsaved changes"
                />
              )}
            </button>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={group}>
          <Tooltip label="Undo (Ctrl+Z)">
            <button
              className={btnCls({ icon: true })}
              disabled={!snap.canUndo || playing}
              onClick={() => editor.undo()}
              aria-label="Undo"
            >
              <Undo2 size={16} />
            </button>
          </Tooltip>
          <Tooltip label="Redo (Ctrl+Shift+Z)">
            <button
              className={btnCls({ icon: true })}
              disabled={!snap.canRedo || playing}
              onClick={() => editor.redo()}
              aria-label="Redo"
            >
              <Redo2 size={16} />
            </button>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={group}>
          <Tooltip label="Toggle grid (G)">
            <button className={btnCls({ active: snap.state.gridVisible })} onClick={() => editor.toggleGrid()}>
              <Grid3x3 size={15} /> Grid
            </button>
          </Tooltip>
          <Tooltip label="Toggle snapping (Shift+G)">
            <button className={btnCls({ active: snap.state.snapEnabled })} onClick={() => editor.toggleSnap()}>
              <Magnet size={15} /> Snap
            </button>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={cx(group, "max-[1320px]:hidden")}>
          <Tooltip label="Zoom out">
            <button className={btnCls({ icon: true })} onClick={() => editor.zoomBy(1 / 1.2)} aria-label="Zoom out">
              <ZoomOut size={16} />
            </button>
          </Tooltip>
          <span className="min-w-[42px] text-fg-2 font-mono text-[11px] text-center">{zoomPercent}%</span>
          <Tooltip label="Zoom in">
            <button className={btnCls({ icon: true })} onClick={() => editor.zoomBy(1.2)} aria-label="Zoom in">
              <ZoomIn size={16} />
            </button>
          </Tooltip>
          <Tooltip label="Fit level to view (F)">
            <button className={btnCls()} onClick={() => editor.fit()}>
              <Maximize size={15} /> Fit
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 z-[1] px-1 border border-border rounded-[9px] bg-[#121823]">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className={cx(btnCls(), "gap-2 max-w-[280px] h-[34px] text-fg text-[13px] font-[650]")}
              aria-label="Select level"
            >
              <span className="text-fg-3 text-[9px] font-bold tracking-[0.8px]">LEVEL</span>
              <span>{snap.levelTitle}</span>
              <ChevronDown className="text-fg-3" size={13} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menu} sideOffset={6} align="center">
              {editor.levels.map((level) => (
                <DropdownMenu.Item
                  key={level.key}
                  className={ctxItemCls(snap.activeLevelKey === level.key)}
                  onSelect={() => editor.openBuiltin(level.key)}
                >
                  {level.name}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="flex items-center flex-none ml-auto">
        <Tooltip label="Play / Stop (Ctrl+Enter)">
          <button
            className={cx(
              "inline-flex items-center justify-center gap-1.5 min-w-[92px] h-9 px-2.5 rounded-[9px]",
              "border border-transparent text-white text-[12.5px] font-bold cursor-pointer transition-colors duration-100",
              playing
                ? "bg-danger shadow-[0_5px_16px_rgba(239,68,68,0.25)] hover:bg-[#f05555]"
                : "bg-accent shadow-[0_5px_16px_rgba(59,130,246,0.22)] hover:bg-accent-hover",
            )}
            onClick={() => editor.togglePlay()}
          >
            {playing ? <Square size={12} /> : <Play size={12} />}
            {playing ? "Stop" : "Play"}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
