import { useState } from "react";
import { chakra, Dialog } from "@chakra-ui/react";
import { Film, ImagePlus } from "lucide-react";
import { openClipsDocument } from "../app/dock.js";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import { uniqueEnemySlug } from "../core/gameData.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { importSpriteSheet } from "./SheetSlicerPanel.js";

/** Defaults a new enemy copies from its base: health and touch damage. */
function baseStats(base: string): { health: number; touchDamage: number } {
  const data = projectSession.gameData().data;
  const enemy = data.enemies[base]!;
  return { health: data.actors[enemy.actor]?.maxHealth ?? 1, touchDamage: enemy.touchDamage };
}

/**
 * New object… → Enemy, last step: a project enemy copied from enemy `base` (an
 * enemy kind), drawn from an animation asset. The body and footer of the dialog.
 */
export function NewEnemyForm({
  base,
  onBack,
  onClose,
}: Readonly<{ base: string; onBack: () => void; onClose: () => void }>) {
  const project = useProjectSession().project;
  const sheets = (project?.manifest.assets ?? [])
    .filter((asset) => asset.kind === "animation")
    .map((a) => a.id);
  const [name, setName] = useState("");
  const [sheet, setSheet] = useState("");
  const [stats, setStats] = useState(() => baseStats(base));

  const id = `enemy.${uniqueEnemySlug(projectSession.gameData().data, name)}`;
  const chosenSheet = sheets.includes(sheet) ? sheet : (sheets[0] ?? "");
  const valid =
    name.trim() !== "" && chosenSheet !== "" && stats.health >= 1 && stats.touchDamage >= 0;

  const create = () => {
    editor.createEnemy({ name, base, sheet: chosenSheet, ...stats });
    onClose();
  };

  return (
    <>
      <Dialog.Body display="flex" flexDirection="column" gap="3">
        <Field label="Name">
          <FieldInput value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <chakra.div color="studio.fgTertiary" fontSize="11px">
          Id: {id}
        </chakra.div>
        {sheets.length === 0 ? (
          // A new (or untitled) project has no animation yet: the ways to make one, in order.
          <chakra.div
            role="group"
            aria-label="No animation"
            display="flex"
            flexDirection="column"
            gap="1.5"
          >
            <chakra.div color="studio.fgTertiary" fontSize="11px">
              An enemy is drawn from an animation, and the project has none yet. Import a sprite
              sheet and slice it, then make an animation from it.
            </chakra.div>
            <chakra.div display="flex" flexWrap="wrap" gap="1">
              <ToolbarButton
                onClick={() => {
                  onClose();
                  void importSpriteSheet();
                }}
              >
                <ImagePlus size={14} /> Import sprite sheet…
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  onClose();
                  openClipsDocument();
                }}
              >
                <Film size={14} /> New animation…
              </ToolbarButton>
            </chakra.div>
          </chakra.div>
        ) : (
          <Field label="Animation">
            <FieldSelect value={chosenSheet} onChange={(e) => setSheet(e.target.value)}>
              {sheets.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </FieldSelect>
          </Field>
        )}
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
      </Dialog.Body>
      <Dialog.Footer>
        <ActionButton onClick={onBack}>Back</ActionButton>
        <ActionButton onClick={onClose}>Cancel</ActionButton>
        <ActionButton disabled={!valid} onClick={create}>
          Create
        </ActionButton>
      </Dialog.Footer>
    </>
  );
}
