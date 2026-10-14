import { chakra, Dialog, Portal } from "@chakra-ui/react";
import { X } from "lucide-react";
import { version } from "../../../../package.json";
import { FAN_NOTICE, REPO_URL, TAKEDOWN_URL } from "../notice.js";

/** Help → About, also opened once on first launch to show the fan-content notice. */
export function AboutDialog({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      // Escape closes the dialog only; it must not reach the editor's window shortcuts.
      onEscapeKeyDown={(e) => e.stopPropagation()}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            maxW="460px"
            bg="studio.popover"
            border="1px solid"
            borderColor="studio.popoverBorder"
            color="studio.fg"
            fontSize="12.5px"
          >
            <Dialog.Header>
              <Dialog.Title fontSize="14px">MMX Studio {version}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="3" data-testid="fan-notice">
              <p lang="en">{FAN_NOTICE.en}</p>
              <p lang="fr">{FAN_NOTICE.fr}</p>
              {/* Plain text, not links: the window must never navigate away from the editor. */}
              <chakra.dl
                color="studio.fgSecondary"
                userSelect="text"
                css={{ "& dd": { mb: "1.5" } }}
              >
                <dt>Repository</dt>
                <dd>{REPO_URL}</dd>
                <dt>Takedown request</dt>
                <dd>{TAKEDOWN_URL}</dd>
              </chakra.dl>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <chakra.button
                  px="3"
                  py="1.5"
                  rounded="md"
                  bg="studio.hover"
                  _hover={{ bg: "studio.popoverHover" }}
                >
                  OK
                </chakra.button>
              </Dialog.ActionTrigger>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <chakra.button
                aria-label="Close"
                position="absolute"
                top="3"
                right="3"
                color="studio.fgTertiary"
              >
                <X size={14} />
              </chakra.button>
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
