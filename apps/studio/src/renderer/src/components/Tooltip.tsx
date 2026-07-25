import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

/** Thin Radix tooltip wrapper with the app's dark styling. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className="z-[80] px-[9px] py-[5px] rounded-md bg-tooltip border border-border-strong text-fg text-[11px] shadow-[0_8px_20px_rgba(0,0,0,0.4)]"
          sideOffset={6}
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
