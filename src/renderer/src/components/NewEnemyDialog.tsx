import { useState } from "react";
import { chakra, Dialog, Portal } from "@chakra-ui/react";
import { GAME_DATA } from "@mmx/engine/data";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import { uniqueEnemySlug } from "../core/gameData.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";

const BUILTIN_ENEMIES = Object.keys(GAME_DATA.enemies);
const label = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** Defaults a new enemy copies from its base: health and touch damage. */
function baseStats(base: string): { health: number; touchDamage: number } {
  const enemy = GAME_DATA.enemies[base]!;
  return { health: GAME_DATA.actors[enemy.actor]?.maxHealth ?? 1, touchDamage: enemy.touchDamage };
}

/** Palette → New enemy…: a project enemy copied from a built-in one, drawn from an animation asset. */
export function NewEnemyDialog({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const project = useProjectSession().project;
  const sheets = (project?.manifest.assets ?? []).filter((asset) => asset.kind === "animation").map((a) => a.id);
  const [name, setName] = useState("");
  const [base, setBase] = useState(BUILTIN_ENEMIES[0]!);
  const [sheet, setSheet] = useState("");
  const [stats, setStats] = useState(() => baseStats(BUILTIN_ENEMIES[0]!));

  const id = `enemy.${uniqueEnemySlug(projectSession.gameData().data, name)}`;
  const chosenSheet = sheets.includes(sheet) ? sheet : (sheets[0] ?? "");
  const valid = name.trim() !== "" && chosenSheet !== "" && stats.health >= 1 && stats.touchDamage >= 0;

  const create = () => {
    editor.createEnemy({ name, base, sheet: chosenSheet, ...stats });
    setName("");
    onClose();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
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
              <Dialog.Title fontSize="14px">New enemy</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="3">
              <Field label="Name">
                <FieldInput value={name} autoFocus onChange={(e) => setName(e.target.value)} />
              </Field>
              <chakra.div color="studio.fgTertiary" fontSize="11px">
                Id: {id}
              </chakra.div>
              <Field label="Based on">
                <FieldSelect
                  value={base}
                  onChange={(e) => {
                    setBase(e.target.value);
                    setStats(baseStats(e.target.value));
                  }}
                >
                  {BUILTIN_ENEMIES.map((enemy) => (
                    <option key={enemy} value={enemy}>
                      {label(enemy)}
                    </option>
                  ))}
                </FieldSelect>
              </Field>
              <Field label="Animation" invalid={sheets.length === 0}>
                <FieldSelect value={chosenSheet} onChange={(e) => setSheet(e.target.value)}>
                  {sheets.map((asset) => (
                    <option key={asset} value={asset}>
                      {asset}
                    </option>
                  ))}
                </FieldSelect>
              </Field>
              <chakra.div display="flex" gap="3">
                <Field label="Health">
                  <FieldInput
                    type="number"
                    min={1}
                    value={stats.health}
                    onChange={(e) => setStats({ ...stats, health: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Touch damage">
                  <FieldInput
                    type="number"
                    min={0}
                    value={stats.touchDamage}
                    onChange={(e) => setStats({ ...stats, touchDamage: Number(e.target.value) })}
                  />
                </Field>
              </chakra.div>
              {sheets.length === 0 && (
                <chakra.div color="studio.dangerFg">Add an animation asset to the project first.</chakra.div>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              <ActionButton onClick={onClose}>Cancel</ActionButton>
              <ActionButton disabled={!valid} onClick={create}>
                Create
              </ActionButton>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
