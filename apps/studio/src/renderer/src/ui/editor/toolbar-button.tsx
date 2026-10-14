import { chakra } from "@chakra-ui/react";
import type { ComponentProps } from "react";

const ToolbarButtonBase = chakra("button", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1.5",
    h: "7",
    px: "2",
    border: "1px solid transparent",
    rounded: "md",
    bg: "transparent",
    color: "studio.fgSecondary",
    fontSize: "11.5px",
    fontWeight: "semibold",
    cursor: "pointer",
    transition: "colors",
    transitionDuration: "100ms",
    _hover: {
      bg: "studio.hover",
      color: "studio.fg",
      _disabled: { bg: "transparent", color: "studio.fgSecondary" },
    },
    _disabled: { opacity: 0.4, cursor: "default" },
  },
  variants: {
    active: {
      true: {
        bg: "studio.accent/15",
        color: "studio.accentFg",
        _hover: { bg: "studio.accent/15", color: "studio.accentFg" },
      },
    },
    icon: { true: { w: "7", px: "0", justifyContent: "center" } },
    // Play/Stop: a filled call-to-action that turns destructive while playing.
    tone: {
      primary: {
        justifyContent: "center",
        minW: "80px",
        px: "2.5",
        rounded: "lg",
        bg: "studio.accent",
        color: "white",
        fontSize: "12px",
        fontWeight: "bold",
        boxShadow: "0 3px 10px rgba(59,130,246,0.22)",
        _hover: { bg: "studio.accentHover", color: "white" },
      },
      danger: {
        justifyContent: "center",
        minW: "80px",
        px: "2.5",
        rounded: "lg",
        bg: "studio.danger",
        color: "white",
        fontSize: "12px",
        fontWeight: "bold",
        boxShadow: "0 3px 10px rgba(239,68,68,0.25)",
        _hover: { bg: "#f05555", color: "white" },
      },
    },
  },
});

type ToolbarButtonProps = Omit<ComponentProps<typeof ToolbarButtonBase>, "active"> & { active?: boolean };

/** Compact 28px Toolbar button; `active` toggles expose `aria-pressed`. */
export function ToolbarButton({ active, ...props }: ToolbarButtonProps) {
  return <ToolbarButtonBase type="button" active={active} aria-pressed={active} {...props} />;
}
