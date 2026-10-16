/**
 * Pure keyboard dispatcher — no Pixi, Electron, or global singletons.
 *
 * {@link dispatchEditorKey} maps a KeyboardEvent to a typed {@link EditorCommand}
 * (or `null` when the event should not be handled). The caller is responsible
 * for calling `e.preventDefault()` when a non-null command is returned.
 */

// ---------- Context fed in from EditorController ----------

/** What Ctrl+Z/Ctrl+Y undo: the level document, or the project's object and game-data definitions. */
export type UndoScope = "level" | "definitions";

/** Spread on a definition surface (Enemy panel, Object section, palette): edits inside it undo as definitions. */
export const DEFINITIONS_SCOPE = { "data-undo-scope": "definitions" } as const;

/** The undo scope of an event target: "definitions" inside a marked surface, else "level". */
export function undoScopeOf(target: EventTarget | null): UndoScope {
  const closest = (target as { closest?: (selector: string) => unknown } | null)?.closest;
  return typeof closest === "function" && closest.call(target, '[data-undo-scope="definitions"]')
    ? "definitions"
    : "level";
}

export interface KeyboardContext {
  mode: "edit" | "play";
  activeTool: string;
  isTypingField: boolean;
  isFullscreen: boolean;
  hasContextMenu: boolean;
  invulnerable: boolean;
  /** Selectable page text is selected: Ctrl+C / Ctrl+X copy it natively instead of the level selection. */
  hasTextSelection: boolean;
  /** Where undo/redo go: the surface the user last clicked or focused. */
  undoScope: UndoScope;
}

// ---------- Command union ----------

export type EditorCommand =
  // edit-mode commands
  | { kind: "undo"; scope: UndoScope }
  | { kind: "redo"; scope: UndoScope }
  | { kind: "save" }
  | { kind: "newLevel" }
  | { kind: "openLevel" }
  | { kind: "zoomIn" }
  | { kind: "zoomOut" }
  | { kind: "zoomReset" }
  | { kind: "duplicate" }
  | { kind: "copy" }
  | { kind: "cut" }
  | { kind: "paste" }
  | { kind: "delete" }
  | { kind: "fit" }
  | { kind: "toggleGrid" }
  | { kind: "toggleSnap" }
  | { kind: "toolSelect" }
  | { kind: "toolTile" }
  | { kind: "escapeTool" }
  | { kind: "closeContextMenu" }
  | { kind: "exitFullscreen" }
  | { kind: "nudge"; dx: number; dy: number }
  | { kind: "togglePlay" }
  // play-mode commands
  | { kind: "playtestExit" }
  | { kind: "playtestTogglePause" }
  | { kind: "playtestSetCheckpoint" }
  | { kind: "playtestRestartCheckpoint" }
  | { kind: "playtestStep" }
  | { kind: "playtestToggleInspector" }
  | { kind: "playtestNudgeTimeScale"; delta: -1 | 1 }
  | { kind: "playtestSetInvulnerable"; enabled: boolean }
  | { kind: "playtestCopyDiagnostics" }
  | { kind: "playtestSaveReplay" }
  | { kind: "playtestLoadReplay" };

/**
 * Derives the {@link EditorCommand} for a given keyboard event and editor
 * context. Returns `null` when the event is not handled by the editor.
 *
 * This function is intentionally pure: no side effects, no imports of
 * global state. The caller must call `e.preventDefault()` on a non-null result.
 */
export function dispatchEditorKey(
  e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey">,
  ctx: KeyboardContext,
  gridSize: number,
): EditorCommand | null {
  const mod = e.ctrlKey || e.metaKey;

  if (ctx.mode === "play") {
    if (e.code === "Escape" || (mod && e.code === "Enter")) return { kind: "playtestExit" };
    if (e.code === "F8") {
      if (mod) return { kind: "playtestSetCheckpoint" };
      if (e.shiftKey) return { kind: "playtestRestartCheckpoint" };
      return { kind: "playtestTogglePause" };
    }
    if (e.code === "F10") return { kind: "playtestStep" };
    if (e.code === "F9") return { kind: "playtestToggleInspector" };
    if (e.code === "BracketLeft") return { kind: "playtestNudgeTimeScale", delta: -1 };
    if (e.code === "BracketRight") return { kind: "playtestNudgeTimeScale", delta: 1 };
    if (e.code === "KeyI" && mod)
      return { kind: "playtestSetInvulnerable", enabled: !ctx.invulnerable };
    if (e.code === "KeyY" && mod) return { kind: "playtestCopyDiagnostics" };
    if (e.code === "KeyU" && mod) return { kind: "playtestSaveReplay" };
    if (e.code === "KeyO" && mod) return { kind: "playtestLoadReplay" };
    // All other keys pass through to the game
    return null;
  }

  // edit mode

  if (e.code === "Escape" && ctx.isFullscreen) return { kind: "exitFullscreen" };
  if (e.code === "Escape" && ctx.hasContextMenu) return { kind: "closeContextMenu" };

  // mod-key shortcuts work even in typing fields
  const scope = ctx.undoScope;
  if (mod && e.code === "KeyZ") return { kind: e.shiftKey ? "redo" : "undo", scope };
  if (mod && e.code === "KeyY") return { kind: "redo", scope };
  if (mod && e.code === "KeyS") return { kind: "save" };
  if (mod && e.code === "KeyN") return { kind: "newLevel" };
  if (mod && e.code === "KeyO") return { kind: "openLevel" };
  if (mod && (e.code === "Equal" || e.code === "NumpadAdd")) return { kind: "zoomIn" };
  if (mod && (e.code === "Minus" || e.code === "NumpadSubtract")) return { kind: "zoomOut" };
  if (mod && e.code === "Digit0") return { kind: "zoomReset" };
  if (mod && e.code === "KeyD") return { kind: "duplicate" };
  if (mod && e.code === "Enter") return { kind: "togglePlay" };

  if (ctx.isTypingField) return null;

  // after the typing-field check so text fields keep their native copy/paste
  if (mod && e.code === "KeyC") return ctx.hasTextSelection ? null : { kind: "copy" };
  if (mod && e.code === "KeyX") return ctx.hasTextSelection ? null : { kind: "cut" };
  if (mod && e.code === "KeyV") return { kind: "paste" };

  switch (e.code) {
    case "Delete":
    case "Backspace":
      return { kind: "delete" };
    case "Escape":
      return { kind: "escapeTool" };
    case "KeyG":
      return e.shiftKey ? { kind: "toggleSnap" } : { kind: "toggleGrid" };
    case "KeyF":
      return { kind: "fit" };
    case "KeyV":
      return { kind: "toolSelect" };
    case "KeyT":
      return { kind: "toolTile" };
    case "ArrowLeft":
      return { kind: "nudge", dx: e.shiftKey ? -gridSize : -1, dy: 0 };
    case "ArrowRight":
      return { kind: "nudge", dx: e.shiftKey ? gridSize : 1, dy: 0 };
    case "ArrowUp":
      return { kind: "nudge", dx: 0, dy: e.shiftKey ? -gridSize : -1 };
    case "ArrowDown":
      return { kind: "nudge", dx: 0, dy: e.shiftKey ? gridSize : 1 };
    default:
      return null;
  }
}
