import { chakra } from "@chakra-ui/react";

// The viewport and game canvas stay dark in both themes, so the HUD keeps a fixed dark palette.

/** Floating HUD surface over the viewport / game canvas. */
export const OverlayCard = chakra("div", {
  base: {
    bg: "rgba(12,17,26,0.94)",
    border: "1px solid rgba(64,77,100,0.72)",
    rounded: "xl",
    boxShadow: "0 6px 20px rgba(0,0,0,0.34)",
    backdropFilter: "blur(10px)",
  },
});

/** HUD button; `active` marks a toggled-on state. */
export const OverlayButton = chakra(
  "button",
  {
    base: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "1.5",
      h: "7",
      rounded: "lg",
      border: "1px solid transparent",
      bg: "transparent",
      color: "#b4c1d4",
      fontWeight: "semibold",
      cursor: "pointer",
      transition: "colors",
      _hover: { bg: "#1b2636", color: "#edf3fc", _disabled: { bg: "transparent", color: "#b4c1d4" } },
      _disabled: { opacity: 0.4, cursor: "default" },
    },
    variants: {
      active: {
        true: {
          bg: "rgba(75,142,255,0.15)",
          color: "#d8e7ff",
          _hover: { bg: "rgba(75,142,255,0.15)", color: "#d8e7ff" },
        },
      },
    },
  },
  { defaultProps: { type: "button" } },
);

/** Uppercase HUD caption. */
export const OverlayLabel = chakra("span", {
  base: { fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#7c8da7" },
});

/** Monospaced HUD value. */
export const OverlayValue = chakra("span", {
  base: { fontFamily: "mono", fontSize: "11px", color: "#edf3fc", fontVariantNumeric: "tabular-nums" },
});

/** Keyboard key chip in the viewport hint bar. */
export const Keycap = chakra("span", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minW: "19px",
    h: "19px",
    mx: "1",
    px: "1.5",
    rounded: "5px",
    border: "1px solid #3a4960",
    bg: "#161e2b",
    fontSize: "9px",
    fontFamily: "mono",
    fontWeight: "bold",
    color: "#edf3fc",
  },
});
