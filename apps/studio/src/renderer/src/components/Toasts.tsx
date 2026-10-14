import { chakra } from "@chakra-ui/react";
import { useUiStore } from "../store/uiStore.js";

/** Bottom-right transient notifications, driven by the Zustand UI store. */
export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <chakra.div
      position="fixed"
      right="18px"
      bottom="18px"
      zIndex="100"
      display="flex"
      flexDirection="column"
      gap="2"
    >
      {toasts.map((t) => (
        <chakra.div
          key={t.id}
          role="status"
          display="flex"
          alignItems="center"
          gap="3"
          minW="220px"
          maxW="380px"
          px="3.5"
          py="2.5"
          border="1px solid"
          borderColor="studio.borderStrong"
          rounded="9px"
          bg="studio.popover"
          color="studio.fg"
          fontSize="12.5px"
          boxShadow="0 12px 32px rgba(0,0,0,0.45)"
        >
          <span>{t.message}</span>
          <chakra.button
            type="button"
            ml="auto"
            bg="transparent"
            color="studio.accent"
            fontWeight="semibold"
            cursor="pointer"
            onClick={() => dismiss(t.id)}
          >
            Dismiss
          </chakra.button>
        </chakra.div>
      ))}
    </chakra.div>
  );
}
