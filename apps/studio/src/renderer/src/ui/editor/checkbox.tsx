import { Checkbox as ChakraCheckbox } from "@chakra-ui/react";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

interface CheckboxProps extends Omit<ChakraCheckbox.RootProps, "checked" | "onCheckedChange"> {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** 18px Studio checkbox with its label as the accessible name. */
export function Checkbox({ label, checked, onCheckedChange, ...props }: CheckboxProps) {
  return (
    <ChakraCheckbox.Root
      unstyled
      display="flex"
      alignItems="center"
      gap="9px"
      fontSize="xs"
      color="studio.fg"
      cursor="pointer"
      checked={checked}
      onCheckedChange={(d) => onCheckedChange(d.checked === true)}
      {...props}
    >
      <ChakraCheckbox.HiddenInput />
      <ChakraCheckbox.Control
        w="18px"
        h="18px"
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        border="1px solid"
        borderColor="studio.borderStrong"
        rounded="5px"
        bg="studio.raised"
        _checked={{ bg: "studio.accent", borderColor: "studio.accent", color: "white" }}
        _focusVisible={{ outline: "2px solid", outlineColor: "studio.accent", outlineOffset: "1px" }}
      >
        <ChakraCheckbox.Indicator checked={<Check size={14} />} />
      </ChakraCheckbox.Control>
      <ChakraCheckbox.Label>{label}</ChakraCheckbox.Label>
    </ChakraCheckbox.Root>
  );
}
