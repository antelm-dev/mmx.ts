import { useState } from "react";
import { chakra, Dialog, Portal } from "@chakra-ui/react";
import { editor, useProjectSession } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Field, FieldInput } from "../ui/editor/field.js";

/** First Save of an untitled project: its name, then a folder (picked natively) to move it to. */
export function SaveProjectDialog() {
  const open = useUiStore((s) => s.saveProjectOpen);
  const setOpen = useUiStore((s) => s.setSaveProjectOpen);
  const current = useProjectSession().project?.manifest.name ?? "";
  const [name, setName] = useState<string | null>(null);
  const value = name ?? current;

  const close = () => {
    setName(null);
    setOpen(false);
  };
  const save = () => {
    if (!value.trim()) return;
    close();
    void editor.saveUntitledProject(value);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && close()}
      // Keys stay in the dialog: they must not reach the editor's window shortcuts.
      onEscapeKeyDown={(e) => e.stopPropagation()}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            maxW="360px"
            bg="studio.popover"
            border="1px solid"
            borderColor="studio.popoverBorder"
            color="studio.fg"
            fontSize="12.5px"
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Dialog.Header>
              <Dialog.Title fontSize="14px">Save project</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="3">
              <Field label="Project name" invalid={!value.trim()}>
                <FieldInput
                  value={value}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                />
              </Field>
              <chakra.div color="studio.fgTertiary" fontSize="11px">
                Next, choose an empty folder: the whole project moves there.
              </chakra.div>
            </Dialog.Body>
            <Dialog.Footer>
              <ActionButton onClick={close}>Cancel</ActionButton>
              <ActionButton disabled={!value.trim()} onClick={save}>
                Choose folder…
              </ActionButton>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
