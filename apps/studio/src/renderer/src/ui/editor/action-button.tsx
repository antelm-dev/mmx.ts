import { chakra } from "@chakra-ui/react";
import type { ComponentProps } from "react";

const ActionButtonBase = chakra("button", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "1",
    h: "8",
    px: "2.5",
    border: "1px solid",
    borderColor: "studio.borderStrong",
    rounded: "lg",
    bg: "transparent",
    color: "studio.fgSecondary",
    fontSize: "12.5px",
    fontWeight: "semibold",
    cursor: "pointer",
    transition: "colors",
    transitionDuration: "100ms",
    _hover: { bg: "studio.hover", color: "studio.fg" },
    _disabled: { opacity: 0.4, cursor: "default", _hover: { bg: "transparent" } },
  },
  variants: {
    danger: { true: { color: "studio.dangerFg" } },
  },
});

/** Bordered, full-width footer action; `danger` for destructive commands. */
export function ActionButton(props: ComponentProps<typeof ActionButtonBase>) {
  return <ActionButtonBase type="button" {...props} />;
}
