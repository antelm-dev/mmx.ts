import { chakra } from "@chakra-ui/react";

/** Uppercase panel section heading; `divider` adds the top rule between sections. */
export const SectionTitle = chakra("div", {
  base: {
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    fontSize: "10.5px",
    fontWeight: "semibold",
    color: "studio.fgSecondary",
    px: "3.5",
    pt: "11px",
    pb: "7px",
  },
  variants: {
    divider: { true: { borderTop: "1px solid", borderColor: "studio.border", mt: "2" } },
  },
});

/** Extra-bold category heading inside a virtualized list (palette, scene). */
export const CategoryHeader = chakra("div", {
  base: {
    display: "flex",
    alignItems: "flex-end",
    fontSize: "9.5px",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "studio.fgSecondary",
    pt: "14px",
    px: "3.5",
    pb: "5px",
    fontWeight: "extrabold",
  },
});
