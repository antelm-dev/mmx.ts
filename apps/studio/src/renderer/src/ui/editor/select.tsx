import { Portal, Select as ChakraSelect, createListCollection } from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import type { KeyboardEvent } from "react";
import { controlStyle, labelStyle } from "./field.js";

interface SelectProps {
  /** Visible caption; without one, pass `aria-label`. */
  label?: string;
  "aria-label"?: string;
  options: { label: string; value: string }[];
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
}

/**
 * Like a typing field, plain keys (arrows, Enter, Escape, Delete, typeahead) stay with the
 * select instead of reaching the window editor shortcuts; Ctrl/Cmd chords (undo) still pass.
 */
function keepKeysLocal(e: KeyboardEvent): void {
  if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
}

/** Single-value Studio select, portalled so Dockview never clips the list. */
export function Select({
  label,
  "aria-label": ariaLabel,
  options,
  value,
  onValueChange,
  invalid,
}: SelectProps) {
  return (
    <ChakraSelect.Root
      unstyled
      collection={createListCollection({ items: options })}
      value={[value]}
      onValueChange={(d) => {
        if (d.value[0] !== undefined) onValueChange(d.value[0]);
      }}
      invalid={invalid}
      positioning={{ sameWidth: true, gutter: 4 }}
    >
      {label && <ChakraSelect.Label {...labelStyle}>{label}</ChakraSelect.Label>}
      <ChakraSelect.Control>
        <ChakraSelect.Trigger
          aria-label={ariaLabel}
          {...controlStyle}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap="2"
          cursor="pointer"
          onKeyDown={keepKeysLocal}
        >
          <ChakraSelect.ValueText />
          <ChakraSelect.Indicator display="flex">
            <ChevronDown size={14} />
          </ChakraSelect.Indicator>
        </ChakraSelect.Trigger>
      </ChakraSelect.Control>
      <Portal>
        <ChakraSelect.Positioner>
          <ChakraSelect.Content
            zIndex="60"
            py="1"
            bg="studio.popover"
            border="1px solid"
            borderColor="studio.popoverBorder"
            rounded="lg"
            boxShadow="0 12px 32px rgba(0,0,0,0.45)"
            overflow="hidden"
            outline="none"
            onKeyDown={keepKeysLocal}
          >
            {options.map((opt) => (
              <ChakraSelect.Item
                key={opt.value}
                item={opt}
                display="flex"
                alignItems="center"
                h="30px"
                px="3"
                fontSize="xs"
                color="studio.menuFg"
                cursor="pointer"
                _highlighted={{ bg: "studio.popoverHover", color: "studio.menuFgHover" }}
              >
                <ChakraSelect.ItemText>{opt.label}</ChakraSelect.ItemText>
              </ChakraSelect.Item>
            ))}
          </ChakraSelect.Content>
        </ChakraSelect.Positioner>
      </Portal>
    </ChakraSelect.Root>
  );
}
