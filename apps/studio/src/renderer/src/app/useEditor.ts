import { useSyncExternalStore } from "react";
import { editor, type EditorSnapshot } from "./EditorController.js";

/**
 * Subscribe a component to the editor's immutable snapshot. The controller
 * rebuilds the snapshot on every store change, so plain reference equality is
 * enough for `useSyncExternalStore` to schedule re-renders.
 */
export function useEditorSnapshot(): EditorSnapshot {
  return useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
}

export { editor };
