import { create } from "zustand";
import type { EmptyCellContextMenu } from "../core/EditorViewport.js";

/**
 * Purely-ephemeral view state — the kind the brief reserves for Zustand:
 * selection is owned by the {@link EditorStore}, but transient chrome (which
 * sidebar tab is open, the palette search text, the floating place-menu, and
 * toast notifications) lives here and never touches the saved document.
 */
export interface Toast {
  id: number;
  message: string;
}

export type SidebarTab = "palette" | "scene";

interface UiState {
  toasts: Toast[];
  contextMenu: EmptyCellContextMenu | null;
  sidebarTab: SidebarTab;
  paletteQuery: string;

  addToast: (message: string) => void;
  dismissToast: (id: number) => void;
  setContextMenu: (menu: EmptyCellContextMenu | null) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setPaletteQuery: (query: string) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  contextMenu: null,
  sidebarTab: "palette",
  paletteQuery: "",

  addToast: (message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setPaletteQuery: (paletteQuery) => set({ paletteQuery }),
}));
