import { useCallback } from "react";
import { chakra } from "@chakra-ui/react";
import { useEditorSnapshot } from "../app/useEditor.js";

/*
 * Contract C-OVERLAY: named slots over the level canvas. {@link Viewport} mounts them in Edit
 * mode only, so everything in them is hidden in Play. A feature keeps its content in its own
 * component and adds one line to its slot. Slots let the pointer through to the canvas; an
 * interactive child sets `pointerEvents="auto"` itself.
 */

/** Full-frame layer under the tool card and hint bar; children sit at {@link useWorldToScreen} px. */
export const OverlayCanvas = chakra("div", {
  base: {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    overflow: "hidden",
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
    pointerEvents: "none",
  },
});

/**
 * Contract C-WORLD: maps a world point to px from the viewport's top-left corner, from the
 * store's `zoom` and `viewportPosition`; the component re-renders as the view pans or zooms.
 * The reverse move is `editor.centerOn(x, y)`.
 */
export function useWorldToScreen(): (x: number, y: number) => { x: number; y: number } {
  const { zoom, viewportPosition: view } = useEditorSnapshot().state;
  return useCallback((x, y) => ({ x: (x - view.x) * zoom, y: (y - view.y) * zoom }), [zoom, view]);
}
