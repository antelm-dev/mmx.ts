import { Field as ChakraField, Input, NativeSelect, type HTMLChakraProps } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";

/** 10.5px caption above a form control; shared by fields and selects. */
export const labelStyle = {
  display: "block",
  fontSize: "10.5px",
  color: "studio.fgTertiary",
  mb: "3px",
} satisfies HTMLChakraProps<"label">;

/** Compact 32px control surface; `data-invalid`/`aria-invalid` swap to the danger outline. */
export const controlStyle = {
  w: "full",
  h: "8",
  px: "9px",
  border: "1px solid",
  borderColor: "studio.borderStrong",
  rounded: "7px",
  bg: "studio.raised",
  color: "studio.fg",
  fontSize: "xs",
  outline: "none",
  _focus: { borderColor: "studio.accent", boxShadow: "0 0 0 3px rgba(59,130,246,0.12)" },
  _invalid: { borderColor: "studio.dangerFg", _focus: { borderColor: "studio.dangerFg" } },
} satisfies HTMLChakraProps<"input">;

/** Labelled form field; `invalid` marks the control inside it. */
export function Field({
  label,
  invalid,
  children,
}: {
  label: ReactNode;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <ChakraField.Root unstyled invalid={invalid} display="flex" flexDirection="column" minW="0">
      <ChakraField.Label {...labelStyle}>{label}</ChakraField.Label>
      {children}
    </ChakraField.Root>
  );
}

/** Uncontrolled input that commits through its `onBlur`; Enter commits by blurring. */
export function FieldInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      unstyled
      {...controlStyle}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      {...props}
    />
  );
}

/** Native `<select>` with the control look (the platform arrow is kept). */
export function FieldSelect(props: ComponentProps<typeof NativeSelect.Field>) {
  return (
    <NativeSelect.Root unstyled>
      <NativeSelect.Field unstyled {...controlStyle} {...props} />
    </NativeSelect.Root>
  );
}
