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
import { Tooltip } from "./Tooltip.js";

/** Fixed command bar above the Dockview workspace. */
export function Toolbar() {
  const snap = useEditorSnapshot();
  const playing = snap.state.mode === "play";
  const zoomPercent = Math.round(snap.state.zoom * 100);

  return (
    <div className="bar">
      <div className="left">
        <div className="brand" aria-label="MMX Studio">
          MMX <span className="accent">Studio</span>
        </div>

        <div className="group">
          <Tooltip label="Open a level JSON file">
            <button className="btn" onClick={() => void editor.importJson()}>
              <FolderOpen size={15} /> Import
            </button>
          </Tooltip>
          <Tooltip label="Save level JSON (Ctrl+S)">
            <button className="btn" onClick={() => editor.save()}>
              <Save size={15} /> Save
              {snap.dirty && <span className="save-dot" aria-label="Unsaved changes" />}
            </button>
          </Tooltip>
        </div>

        <div className="divider" />

        <div className="group">
          <Tooltip label="Undo (Ctrl+Z)">
            <button
              className="btn icon"
              disabled={!snap.canUndo || playing}
              onClick={() => editor.undo()}
              aria-label="Undo"
            >
              <Undo2 size={16} />
            </button>
          </Tooltip>
          <Tooltip label="Redo (Ctrl+Shift+Z)">
            <button
              className="btn icon"
              disabled={!snap.canRedo || playing}
              onClick={() => editor.redo()}
              aria-label="Redo"
            >
              <Redo2 size={16} />
            </button>
          </Tooltip>
        </div>

        <div className="divider" />

        <div className="group">
          <Tooltip label="Toggle grid (G)">
            <button
              className={`btn${snap.state.gridVisible ? " active" : ""}`}
              onClick={() => editor.toggleGrid()}
            >
              <Grid3x3 size={15} /> Grid
            </button>
          </Tooltip>
          <Tooltip label="Toggle snapping (Shift+G)">
            <button
              className={`btn${snap.state.snapEnabled ? " active" : ""}`}
              onClick={() => editor.toggleSnap()}
            >
              <Magnet size={15} /> Snap
            </button>
          </Tooltip>
        </div>

        <div className="divider" />

        <div className="group zoom-group">
          <Tooltip label="Zoom out">
            <button className="btn icon" onClick={() => editor.zoomBy(1 / 1.2)} aria-label="Zoom out">
              <ZoomOut size={16} />
            </button>
          </Tooltip>
          <span className="readout">{zoomPercent}%</span>
          <Tooltip label="Zoom in">
            <button className="btn icon" onClick={() => editor.zoomBy(1.2)} aria-label="Zoom in">
              <ZoomIn size={16} />
            </button>
          </Tooltip>
          <Tooltip label="Fit level to view (F)">
            <button className="btn" onClick={() => editor.fit()}>
              <Maximize size={15} /> Fit
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="center">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="btn level-title" aria-label="Select level">
              <span className="level-kicker">LEVEL</span>
              <span>{snap.levelTitle}</span>
              <ChevronDown className="caret" size={13} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" sideOffset={6} align="center">
              {editor.levels.map((level) => (
                <DropdownMenu.Item
                  key={level.key}
                  className={`ctx-item${snap.activeLevelKey === level.key ? " selected" : ""}`}
                  onSelect={() => editor.openBuiltin(level.key)}
                >
                  {level.name}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="right">
        <Tooltip label="Play / Stop (Ctrl+Enter)">
          <button
            className={`btn play-btn${playing ? " stop" : ""}`}
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
