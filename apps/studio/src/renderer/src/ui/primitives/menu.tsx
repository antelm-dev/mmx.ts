import { Box, Menu, Portal } from "@chakra-ui/react";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/** Escape closes the menu only; it must not reach the editor's window shortcuts (exit Play, clear selection). */
export function MenuRoot(props: ComponentProps<typeof Menu.Root>) {
  return <Menu.Root onEscapeKeyDown={(e) => e.stopPropagation()} {...props} />;
}

export const MenuTrigger = Menu.Trigger;

/** Popover surface portalled to `body` so Dockview never clips it. */
export function MenuContent(props: ComponentProps<typeof Menu.Content>) {
  return (
    <Portal>
      <Menu.Positioner>
        <Menu.Content
          minW="220px"
          maxW="300px"
          py="1.5"
          px="0"
          bg="studio.popover"
          border="1px solid"
          borderColor="studio.popoverBorder"
          rounded="lg"
          boxShadow="0 12px 32px rgba(0,0,0,0.45)"
          overflow="hidden"
          {...props}
        />
      </Menu.Positioner>
    </Portal>
  );
}

export function MenuItem(props: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      gap="9px"
      px="3"
      py="1.5"
      rounded="0"
      fontSize="12.5px"
      color="studio.menuFg"
      cursor="pointer"
      _highlighted={{ bg: "studio.popoverHover", color: "studio.menuFgHover" }}
      {...props}
    />
  );
}

/** Opens the enclosing `MenuRoot` at the pointer on DOM right-click (`asChild` on the row). */
export const MenuContextTrigger = Menu.ContextTrigger;

/** Non-interactive caption row inside a menu (section heading, context info). */
export function MenuLabel(props: ComponentProps<typeof Box>) {
  return (
    <Box
      px="3"
      pt="1"
      pb="0.5"
      fontSize="10px"
      textTransform="uppercase"
      letterSpacing="0.5px"
      color="studio.muted"
      {...props}
    />
  );
}

/** Titled block of items (`role="group"` labelled by its heading). */
export function MenuGroup({ label, children }: Readonly<{ label: ReactNode; children: ReactNode }>) {
  return (
    <Menu.ItemGroup>
      <Menu.ItemGroupLabel
        px="3"
        pt="1.5"
        pb="1"
        fontSize="10px"
        fontWeight="semibold"
        textTransform="uppercase"
        letterSpacing="0.6px"
        color="studio.fgTertiary"
      >
        {label}
      </Menu.ItemGroupLabel>
      {children}
    </Menu.ItemGroup>
  );
}

/** `border="0"`: the reset gives the underlying `<hr>` a 1px top rule; the background draws the line. */
export function MenuSeparator(props: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator h="1px" my="1.5" mx="2" border="0" bg="studio.popoverBorder" {...props} />;
}

/** Right-aligned keyboard hint inside an item. */
export function MenuShortcut({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Menu.ItemCommand
      ps="5"
      opacity="1"
      fontSize="10.5px"
      letterSpacing="wide"
      fontVariantNumeric="tabular-nums"
      color="studio.fgTertiary"
    >
      {children}
    </Menu.ItemCommand>
  );
}

/** Toggle item with a leading check slot that keeps labels aligned when unchecked. */
export function MenuCheckboxItem({ children, ...props }: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem
      gap="9px"
      px="3"
      py="1.5"
      rounded="0"
      fontSize="12.5px"
      color="studio.menuFg"
      cursor="pointer"
      _highlighted={{ bg: "studio.popoverHover", color: "studio.menuFgHover" }}
      {...props}
    >
      <Box as="span" display="inline-flex" w="3.5" justifyContent="center" flex="none">
        <Menu.ItemIndicator position="static" transform="none">
          <Check size={13} />
        </Menu.ItemIndicator>
      </Box>
      {children}
    </Menu.CheckboxItem>
  );
}

/** Single-choice set of `MenuRadioItem`s (`value` / `onValueChange`). */
export const MenuRadioItemGroup = Menu.RadioItemGroup;

/** Radio item with the same leading check slot as `MenuCheckboxItem`. */
export function MenuRadioItem({ children, ...props }: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      gap="9px"
      px="3"
      py="1.5"
      rounded="0"
      fontSize="12.5px"
      color="studio.menuFg"
      cursor="pointer"
      _highlighted={{ bg: "studio.popoverHover", color: "studio.menuFgHover" }}
      {...props}
    >
      <Box as="span" display="inline-flex" w="3.5" justifyContent="center" flex="none">
        <Menu.ItemIndicator position="static" transform="none">
          <Check size={13} />
        </Menu.ItemIndicator>
      </Box>
      {children}
    </Menu.RadioItem>
  );
}
