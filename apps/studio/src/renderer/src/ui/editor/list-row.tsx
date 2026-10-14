import { chakra } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import type { ComponentProps } from "react";

const ListRowBase = chakra("button", {
  base: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "2.5",
    w: "calc(100% - 16px)",
    minH: "38px",
    mx: "2",
    my: "1px",
    px: "2",
    py: "5px",
    rounded: "lg",
    border: "1px solid transparent",
    bg: "transparent",
    color: "studio.fgSecondary",
    fontSize: "12.5px",
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: "color, background-color, border-color, transform",
    transitionDuration: "100ms",
    _hover: {
      bg: "studio.hover",
      color: "studio.fg",
      borderColor: "studio.border",
      transform: "translateX(1px)",
    },
    "& [data-reveal]": { opacity: 0, color: "studio.fgSecondary", transition: "opacity 100ms" },
    "&:is(:hover, :focus-visible) [data-reveal]": { opacity: 1, color: "studio.accent" },
    "&[aria-current=true]": {
      bg: "studio.accent/15",
      color: "studio.accentFg",
      borderColor: "studio.accent/40",
      _hover: {
        bg: "studio.accent/15",
        color: "studio.accentFg",
        borderColor: "studio.accent/40",
        transform: "none",
      },
    },
  },
});

/** 38px palette/scene row; `active` marks the selection (exposed as `aria-current`). */
export function ListRow({
  active,
  ...props
}: ComponentProps<typeof ListRowBase> & { active?: boolean }) {
  return <ListRowBase type="button" aria-current={active || undefined} {...props} />;
}

/** The add icon a {@link ListRow} reveals on hover and keyboard focus. */
export function ListRowAdd() {
  return (
    <chakra.span
      data-reveal=""
      display="grid"
      placeItems="center"
      w="6"
      h="6"
      rounded="md"
      bg="studio.raised"
      boxShadow="0 0 0 1px {colors.studio.border}"
    >
      <Plus size={16} strokeWidth={2.5} />
    </chakra.span>
  );
}
