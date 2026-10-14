import type { ReactNode } from "react";
import { Portal, Tooltip as ChakraTooltip } from "@chakra-ui/react";

/** Studio tooltip: the child stays the trigger; content is portalled above Dockview. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ChakraTooltip.Root openDelay={350} closeDelay={0} positioning={{ gutter: 6 }}>
      <ChakraTooltip.Trigger asChild>{children}</ChakraTooltip.Trigger>
      <Portal>
        <ChakraTooltip.Positioner>
          <ChakraTooltip.Content
            px="9px"
            py="5px"
            rounded="md"
            bg="studio.tooltip"
            border="1px solid"
            borderColor="studio.borderStrong"
            color="studio.fg"
            fontSize="11px"
            boxShadow="0 8px 20px rgba(0,0,0,0.4)"
          >
            {label}
          </ChakraTooltip.Content>
        </ChakraTooltip.Positioner>
      </Portal>
    </ChakraTooltip.Root>
  );
}
