import { deleteSelection, duplicateSelection, nudgeSelection } from "../state/actions.js";
import type { EditorContext } from "./context.js";

/** Global keyboard shortcuts. See the README for the full list. */
export function attachShortcuts(ctx: EditorContext): void {
  const store = ctx.store;
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const state = store.get();

    // Play mode swallows everything except stop.
    if (state.mode === "play") {
      if (e.code === "Escape" || (mod && e.code === "Enter")) {
        e.preventDefault();
        ctx.togglePlay();
      }
      return;
    }

    // Never hijack typing in a form control (native undo/copy must work there).
    const target = e.target as HTMLElement | null;
    const typing = target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);

    if (mod && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) ctx.redo();
      else ctx.undo();
      return;
    }
    if (mod && e.code === "KeyY") {
      e.preventDefault();
      ctx.redo();
      return;
    }
    if (mod && e.code === "KeyS") {
      e.preventDefault();
      ctx.save();
      return;
    }
    if (mod && e.code === "KeyD") {
      e.preventDefault();
      duplicateSelection(store);
      return;
    }
    if (mod && e.code === "Enter") {
      e.preventDefault();
      ctx.togglePlay();
      return;
    }

    if (typing) return;

    switch (e.code) {
      case "Delete":
      case "Backspace":
        e.preventDefault();
        deleteSelection(store);
        break;
      case "Escape":
        if (state.activeTool === "place") store.setTool("select");
        else store.clearSelection();
        break;
      case "KeyG":
        if (e.shiftKey) store.toggleSnap();
        else store.toggleGrid();
        break;
      case "KeyF":
        ctx.fit();
        break;
      case "KeyV":
        store.setTool("select");
        break;
      case "ArrowLeft":
        e.preventDefault();
        nudgeSelection(store, e.shiftKey ? -state.document.gridSize : -1, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        nudgeSelection(store, e.shiftKey ? state.document.gridSize : 1, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        nudgeSelection(store, 0, e.shiftKey ? -state.document.gridSize : -1);
        break;
      case "ArrowDown":
        e.preventDefault();
        nudgeSelection(store, 0, e.shiftKey ? state.document.gridSize : 1);
        break;
      default:
        break;
    }
  });
}
