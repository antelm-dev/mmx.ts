import type { EditorStore } from "../state/EditorStore.js";

/** The set of app-level actions the panels invoke. Implemented by the Shell. */
export interface EditorContext {
  store: EditorStore;
  save(): void;
  importJson(): void;
  openBuiltin(key: string): void;
  undo(): void;
  redo(): void;
  togglePlay(): void;
  zoomBy(factor: number): void;
  zoomReset(): void;
  fit(): void;
  duplicateSelection(): void;
  deleteSelection(): void;
  selectPalette(definitionId: string): void;
  focusObject(id: string): void;
  toast(message: string): void;
}
