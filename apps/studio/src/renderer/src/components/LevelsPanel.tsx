import { useState } from "react";
import { chakra } from "@chakra-ui/react";
import { ArrowDown, ArrowUp, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { FieldInput } from "../ui/editor/field.js";
import { ListRow } from "../ui/editor/list-row.js";
import { Panel, PanelNote, PanelScroll } from "../ui/editor/panel.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { Tooltip } from "./Tooltip.js";

/** Keyboard users land on the delete question; a stable ref, so it runs once per opening. */
const focusOnMount = (el: HTMLElement | null): void => el?.focus();

/**
 * Left dock view: the open project's levels in manifest order. Clicking a row shows that
 * level; the toolbar acts on the shown one (contract C-LEVEL). List edits are saved with
 * the project.
 */
export function LevelsPanel() {
  const { project, currentLevelId } = useProjectSession();
  // Level ids, so a confirmation never outlives the level it was asked for.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (!project) {
    return (
      <Panel>
        <PanelNote>Open a project to manage its levels.</PanelNote>
      </Panel>
    );
  }

  const refs = project.manifest.levels;
  const entryId = project.manifest.entryLevelId;
  const index = refs.findIndex((ref) => ref.id === currentLevelId);
  const current = refs[index];
  const nameOf = (id: string) =>
    project.levels.find((level) => level.id === id)?.document.name || id;
  const deletable = !!current && current.id !== entryId && refs.length > 1;

  return (
    <Panel>
      <chakra.div
        display="flex"
        alignItems="center"
        gap="0.5"
        px="2"
        py="1.5"
        borderBottom="1px solid"
        borderColor="studio.border"
      >
        <Tooltip label="Add level">
          <ToolbarButton icon aria-label="Add level" onClick={() => editor.newLevel()}>
            <Plus size={14} />
          </ToolbarButton>
        </Tooltip>
        <Tooltip label="Rename level">
          <ToolbarButton
            icon
            aria-label="Rename level"
            disabled={!current}
            onClick={() => setRenaming(current?.id ?? null)}
          >
            <Pencil size={14} />
          </ToolbarButton>
        </Tooltip>
        <Tooltip label="Move up">
          <ToolbarButton
            icon
            aria-label="Move level up"
            disabled={index <= 0}
            onClick={() => current && projectSession.moveLevel(current.id, index - 1)}
          >
            <ArrowUp size={14} />
          </ToolbarButton>
        </Tooltip>
        <Tooltip label="Move down">
          <ToolbarButton
            icon
            aria-label="Move level down"
            disabled={index < 0 || index >= refs.length - 1}
            onClick={() => current && projectSession.moveLevel(current.id, index + 1)}
          >
            <ArrowDown size={14} />
          </ToolbarButton>
        </Tooltip>
        <Tooltip label="Set as entry">
          <ToolbarButton
            icon
            aria-label="Set as entry"
            disabled={!current || current.id === entryId}
            onClick={() => current && projectSession.setEntryLevel(current.id)}
          >
            <Star size={14} />
          </ToolbarButton>
        </Tooltip>
        <Tooltip label={deletable ? "Delete level" : "The entry level and the last level stay"}>
          <ToolbarButton
            icon
            aria-label="Delete level"
            disabled={!deletable}
            onClick={() => setDeleting(current.id)}
          >
            <Trash2 size={14} />
          </ToolbarButton>
        </Tooltip>
      </chakra.div>

      {deletable && deleting === current.id && (
        <chakra.div
          role="alertdialog"
          aria-label="Delete level"
          tabIndex={-1}
          ref={focusOnMount}
          px="3"
          pt="2.5"
          borderBottom="1px solid"
          borderColor="studio.border"
          textStyle="xs"
          color="studio.fgSecondary"
        >
          Delete '{nameOf(current.id)}' from the project? Its file stays on disk.
          <chakra.div display="flex" gap="2" py="2.5">
            <ActionButton
              danger
              onClick={() => {
                setDeleting(null);
                editor.deleteProjectLevel(current.id);
              }}
            >
              Delete
            </ActionButton>
            <ActionButton onClick={() => setDeleting(null)}>Cancel</ActionButton>
          </chakra.div>
        </chakra.div>
      )}

      <PanelScroll py="1">
        {refs.map((ref) => {
          const active = ref.id === currentLevelId;
          if (active && renaming === ref.id) {
            return (
              <chakra.div key={ref.id} px="2" py="1">
                <FieldInput
                  aria-label="Level name"
                  autoFocus
                  defaultValue={nameOf(ref.id)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.currentTarget.value = nameOf(ref.id);
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) => {
                    setRenaming(null);
                    editor.renameProjectLevel(ref.id, e.target.value);
                  }}
                />
              </chakra.div>
            );
          }
          return (
            <ListRow
              key={ref.id}
              active={active}
              title={ref.id}
              onClick={() => {
                setRenaming(null);
                setDeleting(null);
                editor.openProjectLevel(ref.id);
              }}
            >
              <chakra.span flex="1" minW="0" truncate>
                {nameOf(ref.id)}
              </chakra.span>
              {ref.id === entryId && (
                <chakra.span
                  aria-label="Entry level"
                  title="Entry level"
                  display="inline-flex"
                  color="studio.warning"
                >
                  <Star size={13} fill="currentColor" />
                </chakra.span>
              )}
            </ListRow>
          );
        })}
      </PanelScroll>
    </Panel>
  );
}
