import { create } from "zustand";
import {
  persistColorTheme,
  readStoredTheme,
  type ColorTheme,
} from "../app/theme.js";
import type { EmptyCellContextMenu } from "../core/EditorViewport.js";

/**
 * Purely-ephemeral view state — the kind the brief reserves for Zustand:
 * selection is owned by the {@link EditorStore}, but transient chrome (which
 * the palette search text, the floating place-menu, and toast notifications)
 * lives here and never touches the saved document.
 */
export interface Toast {
  id: number;
  message: string;
}

interface UiState {
  toasts: Toast[];
  contextMenu: EmptyCellContextMenu | null;
  paletteQuery: string;
  /** Grouping toggle + per-category collapse state for the Scene tab. */
  sceneGrouped: boolean;
  collapsedSceneGroups: Record<string, boolean>;
  colorTheme: ColorTheme;
  fullscreen: boolean;

  addToast: (message: string) => void;
  dismissToast: (id: number) => void;
  setContextMenu: (menu: EmptyCellContextMenu | null) => void;
  setPaletteQuery: (query: string) => void;
  setSceneGrouped: (grouped: boolean) => void;
  toggleSceneGroup: (category: string) => void;
  setColorTheme: (theme: ColorTheme) => void;
  toggleColorTheme: () => void;
  setFullscreen: (fullscreen: boolean) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  contextMenu: null,
  paletteQuery: "",
  sceneGrouped: true,
  collapsedSceneGroups: {},
  colorTheme: readStoredTheme(),
  fullscreen: false,

  addToast: (message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setPaletteQuery: (paletteQuery) => set({ paletteQuery }),
  setSceneGrouped: (sceneGrouped) => set({ sceneGrouped }),
  toggleSceneGroup: (category) =>
    set((s) => ({
      collapsedSceneGroups: {
        ...s.collapsedSceneGroups,
        [category]: !s.collapsedSceneGroups[category],
      },
    })),
  setColorTheme: (colorTheme) => {
    persistColorTheme(colorTheme);
    set({ colorTheme });
  },
  toggleColorTheme: () => {
    const colorTheme = get().colorTheme === "dark" ? "light" : "dark";
    persistColorTheme(colorTheme);
    set({ colorTheme });
  },
  setFullscreen: (fullscreen) => set({ fullscreen }),
}));
