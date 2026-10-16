import { useCallback, useSyncExternalStore } from "react";
import { chakra } from "@chakra-ui/react";
import { editor } from "../app/useEditor.js";

/*
 * Contract C-OVERLAY: named slots over the level canvas. {@link Viewport} mounts them in Edit
 * mode only, so everything in them is hidden in Play. A feature keeps its content in its own
 * component and adds one line to its slot. Slots let the pointer through to the canvas; an
 * interactive child sets `pointerEvents="auto"` itself. They clip with `overflow: clip`, not
 * `hidden`: a hidden box still scrolls when an off-view child is focused, leaving every child
 * offset from the canvas. The clip also cuts any popover or dropdown a slot child opens in
 * place, so slot content must portal its menus.
 */

/** Full-frame layer under the tool card and hint bar; children sit at {@link useWorldToScreen} px. */
export const OverlayCanvas = chakra("div", {
  base: {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    overflow: "clip",
    pointerEvents: "none",
  },
});

/** Centred column at the top, below the tool card. */
export const OverlayTop = chakra("div", {
  base: {
    position: "absolute",
    zIndex: "3",
    top: "14",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2",
    overflow: "clip",
    // Room for the cards' drop shadows.
    overflowClipMargin: "24px",
    pointerEvents: "none",
  },
});

/** Bottom strip beside the centred hint bar; children line up at its right end. */
export const OverlayBottom = chakra("div", {
  base: {
    position: "absolute",
    zIndex: "3",
    left: "3.5",
    right: "3.5",
    bottom: "3.5",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    gap: "2",
    overflow: "clip",
    // Room for the cards' drop shadows.
    overflowClipMargin: "24px",
    pointerEvents: "none",
  },
});

/**
 * Contract C-WORLD: maps a world point to px from the viewport's top-left corner, from the
 * store's `zoom` and `viewportPosition`; the component re-renders when those change (pan and
 * zoom), not on other edits. The reverse move is `editor.centerOn(x, y)`.
 */
export function useWorldToScreen(): (x: number, y: number) => { x: number; y: number } {
  const zoom = useSyncExternalStore(editor.subscribe, () => editor.getSnapshot().state.zoom);
  const view = useSyncExternalStore(
    editor.subscribe,
    () => editor.getSnapshot().state.viewportPosition,
  );
  return useCallback((x, y) => ({ x: (x - view.x) * zoom, y: (y - view.y) * zoom }), [zoom, view]);
}
