import { chakra } from "@chakra-ui/react";

/** Full-height panel column on the surface background. */
export const Panel = chakra("div", {
  base: { display: "flex", flexDirection: "column", h: "full", bg: "studio.surface" },
});

/** The panel's vertically scrolling child. */
export const PanelScroll = chakra("div", {
  base: { overflowY: "auto", minH: "0", flex: "1" },
});

/** Footer row of {@link ActionButton}s. */
export const PanelActions = chakra("div", { base: { display: "flex", gap: "2", p: "3" } });

/** Muted one-line message in an empty panel or list. */
export const PanelNote = chakra("div", {
  base: { px: "3", py: "3.5", color: "studio.muted", textStyle: "xs" },
});

/** Search field shell (icon, input, clear button) at the top of a list panel. */
export const SearchBox = chakra("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    h: "9",
    mt: "3",
    mx: "3",
    mb: "2",
    px: "2.5",
    border: "1px solid",
    borderColor: "studio.borderStrong",
    rounded: "lg",
    bg: "studio.raised",
    color: "studio.fgTertiary",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: "120ms",
    _focusWithin: { borderColor: "studio.accent", boxShadow: "0 0 0 3px rgba(59,130,246,0.12)" },
    "& input": {
      minW: "0",
      flex: "1",
      border: "0",
      outline: "0",
      bg: "transparent",
      color: "studio.fg",
      textStyle: "xs",
      _placeholder: { color: "studio.fgTertiary" },
    },
    "& button": { display: "inline-flex", border: "0", bg: "transparent", cursor: "pointer" },
  },
});
