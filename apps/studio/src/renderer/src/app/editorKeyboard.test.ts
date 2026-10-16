import { describe, expect, it } from "vitest";
import {
  dispatchEditorKey,
  undoScopeOf,
  type EditorCommand,
  type KeyboardContext,
} from "./editorKeyboard.js";

// ---------- helpers ----------

function key(
  code: string,
  opts: Partial<{ mod: boolean; shift: boolean; ctrl: boolean; meta: boolean }> = {},
): Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey"> {
  return {
    code,
    ctrlKey: opts.mod ?? opts.ctrl ?? false,
    metaKey: opts.meta ?? false,
    shiftKey: opts.shift ?? false,
  };
}

const editCtx: KeyboardContext = {
  mode: "edit",
  activeTool: "select",
  isTypingField: false,
  isFullscreen: false,
  hasContextMenu: false,
  invulnerable: false,
  hasTextSelection: false,
  undoScope: "level",
};

const playCtx: KeyboardContext = {
  mode: "play",
  activeTool: "select",
  isTypingField: false,
  isFullscreen: false,
  hasContextMenu: false,
  invulnerable: false,
  hasTextSelection: false,
  undoScope: "level",
};

const GRID = 16;

function dispatch(
  e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey">,
  ctx: KeyboardContext = editCtx,
): EditorCommand | null {
  return dispatchEditorKey(e, ctx, GRID);
}

// ---------- edit mode — undo/redo/save ----------

describe("edit mode — undo/redo/save", () => {
  it("Ctrl+Z → undo", () => {
    expect(dispatch(key("KeyZ", { mod: true }))).toEqual({ kind: "undo", scope: "level" });
  });
  it("Ctrl+Shift+Z → redo", () => {
    expect(dispatch(key("KeyZ", { mod: true, shift: true }))).toEqual({
      kind: "redo",
      scope: "level",
    });
  });
  it("Ctrl+Y → redo", () => {
    expect(dispatch(key("KeyY", { mod: true }))).toEqual({ kind: "redo", scope: "level" });
  });
  it("Ctrl+S → save", () => {
    expect(dispatch(key("KeyS", { mod: true }))).toEqual({ kind: "save" });
  });
});

// ---------- undo routing ----------

describe("undo routing", () => {
  const definitionsCtx: KeyboardContext = { ...editCtx, undoScope: "definitions" };
  const inSurface = {
    closest: (selector: string) => (selector === '[data-undo-scope="definitions"]' ? {} : null),
  };
  const outside = { closest: () => null };

  it("undo and both redo chords go to the definitions from a definition surface", () => {
    expect(dispatch(key("KeyZ", { mod: true }), definitionsCtx)).toEqual({
      kind: "undo",
      scope: "definitions",
    });
    expect(dispatch(key("KeyZ", { mod: true, shift: true }), definitionsCtx)).toEqual({
      kind: "redo",
      scope: "definitions",
    });
    expect(dispatch(key("KeyY", { mod: true }), definitionsCtx)).toEqual({
      kind: "redo",
      scope: "definitions",
    });
  });
  it("a target inside a marked surface is in the definitions scope; anything else is the level's", () => {
    expect(undoScopeOf(inSurface as unknown as EventTarget)).toBe("definitions");
    expect(undoScopeOf(outside as unknown as EventTarget)).toBe("level");
    expect(undoScopeOf({} as EventTarget)).toBe("level");
    expect(undoScopeOf(null)).toBe("level");
  });
});

// ---------- typing-field protection ----------

describe("typing-field protection", () => {
  const typingCtx: KeyboardContext = { ...editCtx, isTypingField: true };

  it("Delete is swallowed in typing field", () => {
    expect(dispatch(key("Delete"), typingCtx)).toBeNull();
  });
  it("Escape is swallowed in typing field", () => {
    expect(dispatch(key("Escape"), typingCtx)).toBeNull();
  });
  it("ArrowLeft is swallowed in typing field", () => {
    expect(dispatch(key("ArrowLeft"), typingCtx)).toBeNull();
  });
  it("Ctrl+Z still works in typing field", () => {
    expect(dispatch(key("KeyZ", { mod: true }), typingCtx)).toEqual({
      kind: "undo",
      scope: "level",
    });
  });
  it("Ctrl+S still works in typing field", () => {
    expect(dispatch(key("KeyS", { mod: true }), typingCtx)).toEqual({ kind: "save" });
  });
  it("Ctrl+C/X/V stay native in typing field", () => {
    for (const code of ["KeyC", "KeyX", "KeyV"])
      expect(dispatch(key(code, { mod: true }), typingCtx)).toBeNull();
  });
});

// ---------- Escape precedence ----------

describe("Escape precedence", () => {
  it("fullscreen Escape → exitFullscreen", () => {
    expect(dispatch(key("Escape"), { ...editCtx, isFullscreen: true })).toEqual({
      kind: "exitFullscreen",
    });
  });
  it("context-menu Escape → closeContextMenu", () => {
    expect(dispatch(key("Escape"), { ...editCtx, hasContextMenu: true })).toEqual({
      kind: "closeContextMenu",
    });
  });
  it("tool active Escape → escapeTool", () => {
    expect(dispatch(key("Escape"), { ...editCtx, activeTool: "place" })).toEqual({
      kind: "escapeTool",
    });
  });
  it("plain Escape in select mode → escapeTool (clears selection)", () => {
    expect(dispatch(key("Escape"), editCtx)).toEqual({ kind: "escapeTool" });
  });
});

// ---------- zoom / tool / nudge shortcuts ----------

describe("zoom shortcuts", () => {
  it("Ctrl+= → zoomIn", () => {
    expect(dispatch(key("Equal", { mod: true }))).toEqual({ kind: "zoomIn" });
  });
  it("Ctrl+- → zoomOut", () => {
    expect(dispatch(key("Minus", { mod: true }))).toEqual({ kind: "zoomOut" });
  });
  it("Ctrl+0 → zoomReset", () => {
    expect(dispatch(key("Digit0", { mod: true }))).toEqual({ kind: "zoomReset" });
  });
});

describe("tool shortcuts", () => {
  it("V → toolSelect", () => {
    expect(dispatch(key("KeyV"))).toEqual({ kind: "toolSelect" });
  });
  it("Ctrl/Cmd+C, X, V → copy, cut, paste (not the Select tool)", () => {
    expect(dispatch(key("KeyC", { mod: true }))).toEqual({ kind: "copy" });
    expect(dispatch(key("KeyX", { meta: true }))).toEqual({ kind: "cut" });
    expect(dispatch(key("KeyV", { mod: true }))).toEqual({ kind: "paste" });
  });
  it("Ctrl+C/X copy selected page text natively; Ctrl+V still pastes", () => {
    const textCtx: KeyboardContext = { ...editCtx, hasTextSelection: true };
    expect(dispatch(key("KeyC", { mod: true }), textCtx)).toBeNull();
    expect(dispatch(key("KeyX", { mod: true }), textCtx)).toBeNull();
    expect(dispatch(key("KeyV", { mod: true }), textCtx)).toEqual({ kind: "paste" });
  });
  it("T → toolTile", () => {
    expect(dispatch(key("KeyT"))).toEqual({ kind: "toolTile" });
  });
  it("H → toggleTrail, but not while typing", () => {
    expect(dispatch(key("KeyH"))).toEqual({ kind: "toggleTrail" });
    expect(dispatch(key("KeyH"), { ...editCtx, isTypingField: true })).toBeNull();
  });
  it("G → toggleGrid", () => {
    expect(dispatch(key("KeyG"))).toEqual({ kind: "toggleGrid" });
  });
  it("Shift+G → toggleSnap", () => {
    expect(dispatch(key("KeyG", { shift: true }))).toEqual({ kind: "toggleSnap" });
  });
  it("F → fit", () => {
    expect(dispatch(key("KeyF"))).toEqual({ kind: "fit" });
  });
});

describe("nudge shortcuts", () => {
  it("ArrowLeft → nudge -1,0", () => {
    expect(dispatch(key("ArrowLeft"))).toEqual({ kind: "nudge", dx: -1, dy: 0 });
  });
  it("Shift+ArrowLeft → nudge -gridSize,0", () => {
    expect(dispatch(key("ArrowLeft", { shift: true }))).toEqual({
      kind: "nudge",
      dx: -GRID,
      dy: 0,
    });
  });
  it("ArrowUp → nudge 0,-1", () => {
    expect(dispatch(key("ArrowUp"))).toEqual({ kind: "nudge", dx: 0, dy: -1 });
  });
});

// ---------- Play exit / togglePlay ----------

describe("play entry/exit", () => {
  it("Ctrl+Enter in edit mode → togglePlay", () => {
    expect(dispatch(key("Enter", { mod: true }))).toEqual({ kind: "togglePlay" });
  });
  it("Ctrl+Shift+Enter in edit mode → playFromHere", () => {
    expect(dispatch(key("Enter", { mod: true, shift: true }))).toEqual({ kind: "playFromHere" });
  });
  it("Escape in play mode → playtestExit", () => {
    expect(dispatch(key("Escape"), playCtx)).toEqual({ kind: "playtestExit" });
  });
  it("Ctrl+Enter in play mode → playtestExit", () => {
    expect(dispatch(key("Enter", { mod: true }), playCtx)).toEqual({ kind: "playtestExit" });
  });
});

// ---------- play-mode debugger commands ----------

describe("play mode — debugger commands", () => {
  it("F8 → playtestTogglePause", () => {
    expect(dispatch(key("F8"), playCtx)).toEqual({ kind: "playtestTogglePause" });
  });
  it("Ctrl+F8 → playtestSetCheckpoint", () => {
    expect(dispatch(key("F8", { mod: true }), playCtx)).toEqual({ kind: "playtestSetCheckpoint" });
  });
  it("Shift+F8 → playtestRestartCheckpoint", () => {
    expect(dispatch(key("F8", { shift: true }), playCtx)).toEqual({
      kind: "playtestRestartCheckpoint",
    });
  });
  it("F10 → playtestStep", () => {
    expect(dispatch(key("F10"), playCtx)).toEqual({ kind: "playtestStep" });
  });
  it("F9 → playtestToggleInspector", () => {
    expect(dispatch(key("F9"), playCtx)).toEqual({ kind: "playtestToggleInspector" });
  });
  it("[ → nudgeTimeScale -1", () => {
    expect(dispatch(key("BracketLeft"), playCtx)).toEqual({
      kind: "playtestNudgeTimeScale",
      delta: -1,
    });
  });
  it("] → nudgeTimeScale +1", () => {
    expect(dispatch(key("BracketRight"), playCtx)).toEqual({
      kind: "playtestNudgeTimeScale",
      delta: 1,
    });
  });
  it("Ctrl+I toggles invulnerable (off→on)", () => {
    expect(dispatch(key("KeyI", { mod: true }), { ...playCtx, invulnerable: false })).toEqual({
      kind: "playtestSetInvulnerable",
      enabled: true,
    });
  });
  it("Ctrl+I toggles invulnerable (on→off)", () => {
    expect(dispatch(key("KeyI", { mod: true }), { ...playCtx, invulnerable: true })).toEqual({
      kind: "playtestSetInvulnerable",
      enabled: false,
    });
  });
  it("Ctrl+Y → copyDiagnostics (play mode)", () => {
    expect(dispatch(key("KeyY", { mod: true }), playCtx)).toEqual({
      kind: "playtestCopyDiagnostics",
    });
  });
  it("Ctrl+U → saveReplay", () => {
    expect(dispatch(key("KeyU", { mod: true }), playCtx)).toEqual({ kind: "playtestSaveReplay" });
  });
  it("Ctrl+O → loadReplay", () => {
    expect(dispatch(key("KeyO", { mod: true }), playCtx)).toEqual({ kind: "playtestLoadReplay" });
  });
});

// ---------- unhandled play keys pass through ----------

describe("unhandled play keys", () => {
  it("regular letter key in play mode → null (passes to game)", () => {
    expect(dispatch(key("KeyA"), playCtx)).toBeNull();
  });
  it("Space in play mode → null", () => {
    expect(dispatch(key("Space"), playCtx)).toBeNull();
  });
});
