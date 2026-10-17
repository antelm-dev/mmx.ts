import { useState } from "react";
import { chakra, Dialog } from "@chakra-ui/react";
import { ArrowDown, ArrowUp, Film, ImagePlus } from "lucide-react";
import type { MovementModel } from "@mmx/engine/data";
import type { AnimationAsset } from "@mmx/project-schema";
import { openClipsDocument } from "../app/dock.js";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import {
  BLANK_ENEMY,
  ENEMY_ABILITIES,
  MOVEMENTS,
  toggled,
  withAbilities,
  withConfig,
} from "../core/enemyEditor.js";
import { uniqueEnemySlug } from "../core/gameData.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Field, FieldInput, FieldSelect, labelStyle } from "../ui/editor/field.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { Chips, IconButton } from "./EnemyEditorPanel.js";
import { importSpriteSheet } from "./SheetSlicerPanel.js";

type Stats = { health: number; touchDamage: number };

/** Defaults a new enemy copies from its base: health and touch damage. */
function baseStats(base: string): Stats {
  const data = projectSession.gameData().data;
  const enemy = data.enemies[base]!;
  return { health: data.actors[enemy.actor]?.maxHealth ?? 1, touchDamage: enemy.touchDamage };
}

/** The project's animation assets, which an enemy is drawn from. */
function useAnimations(): AnimationAsset[] {
  const assets = useProjectSession().project?.manifest.assets ?? [];
  return assets.filter((asset): asset is AnimationAsset => asset.kind === "animation");
}

/** The name, and the enemy id it gives. */
function NameField({
  name,
  onChange,
}: Readonly<{ name: string; onChange: (name: string) => void }>) {
  return (
    <>
      <Field label="Name">
        <FieldInput value={name} autoFocus onChange={(e) => onChange(e.target.value)} />
      </Field>
      <chakra.div color="studio.fgTertiary" fontSize="11px">
        Id: enemy.{uniqueEnemySlug(projectSession.gameData().data, name)}
      </chakra.div>
    </>
  );
}

/** The animation the enemy is drawn from, or the ways to make one when the project has none. */
function AnimationField({
  sheets,
  value,
  onChange,
  onClose,
}: Readonly<{
  sheets: readonly string[];
  value: string;
  onChange: (sheet: string) => void;
  onClose: () => void;
}>) {
  if (sheets.length === 0) {
    // A new (or untitled) project has no animation yet: the ways to make one, in order.
    return (
      <chakra.div
        role="group"
        aria-label="No animation"
        display="flex"
        flexDirection="column"
        gap="1.5"
      >
        <chakra.div color="studio.fgTertiary" fontSize="11px">
          An enemy is drawn from an animation, and the project has none yet. Import a sprite sheet
          and slice it, then make an animation from it.
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
    );
  }
  return (
    <Field label="Animation">
      <FieldSelect value={value} onChange={(e) => onChange(e.target.value)}>
        {sheets.map((asset) => (
          <option key={asset} value={asset}>
            {asset}
          </option>
        ))}
      </FieldSelect>
    </Field>
  );
}

function StatsFields({
  stats,
  onChange,
}: Readonly<{ stats: Stats; onChange: (s: Stats) => void }>) {
  return (
    <chakra.div display="flex" gap="3">
      <Field label="Health">
        <FieldInput
          type="number"
          min={1}
          value={stats.health}
          onChange={(e) => onChange({ ...stats, health: Number(e.target.value) })}
        />
      </Field>
      <Field label="Touch damage">
        <FieldInput
          type="number"
          min={0}
          value={stats.touchDamage}
          onChange={(e) => onChange({ ...stats, touchDamage: Number(e.target.value) })}
        />
      </Field>
    </chakra.div>
  );
}

const validStats = (stats: Stats) => stats.health >= 1 && stats.touchDamage >= 0;

/**
 * New object… → Enemy, last step: a project enemy copied from enemy `base` (an
 * enemy kind), drawn from an animation asset. The body and footer of the dialog.
 */
export function NewEnemyForm({
  base,
  onBack,
  onClose,
}: Readonly<{ base: string; onBack: () => void; onClose: () => void }>) {
  const sheets = useAnimations().map((a) => a.id);
  const [name, setName] = useState("");
  const [sheet, setSheet] = useState("");
  const [stats, setStats] = useState(() => baseStats(base));

  const chosenSheet = sheets.includes(sheet) ? sheet : (sheets[0] ?? "");
  const valid = name.trim() !== "" && chosenSheet !== "" && validStats(stats);

  const create = () => {
    editor.createEnemy({ name, base, sheet: chosenSheet, ...stats });
    onClose();
  };

  return (
    <>
      <Dialog.Body display="flex" flexDirection="column" gap="3">
        <NameField name={name} onChange={setName} />
        <AnimationField sheets={sheets} value={chosenSheet} onChange={setSheet} onClose={onClose} />
        <StatsFields stats={stats} onChange={setStats} />
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

/**
 * New object… → Enemy → Blank enemy: a project enemy composed from abilities, in
 * order and with their conflicts as in the enemy editor, which refines the rest.
 */
export function BlankEnemyForm({
  onBack,
  onClose,
}: Readonly<{ onBack: () => void; onClose: () => void }>) {
  const animations = useAnimations();
  const sheets = animations.map((a) => a.id);
  const [name, setName] = useState("");
  const [sheet, setSheet] = useState("");
  // The built-in enemies' median health (1, 2, 4).
  const [stats, setStats] = useState<Stats>({ health: 2, touchDamage: BLANK_ENEMY.touchDamage });
  // Death is on: without it an enemy at zero health is never removed from the stage.
  const [enemy, setEnemy] = useState(() => withAbilities(BLANK_ENEMY, ["Death"]));

  const chosenSheet = sheets.includes(sheet) ? sheet : (sheets[0] ?? "");
  const clips = Object.keys(animations.find((a) => a.id === chosenSheet)?.animations ?? {});
  const valid = name.trim() !== "" && chosenSheet !== "" && validStats(stats);
  const owned = enemy.abilities;
  const setAbilities = (abilities: string[]) => setEnemy(withAbilities(enemy, abilities));
  const move = (i: number, by: number) => {
    const next = [...owned];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setAbilities(next);
  };

  const create = (edit: boolean) => {
    editor.createBlankEnemy(
      {
        name,
        health: stats.health,
        enemy: {
          ...enemy,
          sheet: chosenSheet,
          touchDamage: stats.touchDamage,
          // Idle is what the built-ins start in and the abilities return to.
          initialAnimation: clips.includes("idle") ? "idle" : (clips[0] ?? "idle"),
        },
      },
      edit,
    );
    onClose();
  };

  return (
    <>
      <Dialog.Body display="flex" flexDirection="column" gap="3" maxH="60vh" overflowY="auto">
        <NameField name={name} onChange={setName} />
        <AnimationField sheets={sheets} value={chosenSheet} onChange={setSheet} onClose={onClose} />
        <StatsFields stats={stats} onChange={setStats} />
        <Field label="Movement">
          <FieldSelect
            value={enemy.movement}
            onChange={(e) => setEnemy({ ...enemy, movement: e.target.value as MovementModel })}
          >
            {MOVEMENTS.map((movement) => (
              <option key={movement} value={movement}>
                {movement}
              </option>
            ))}
          </FieldSelect>
        </Field>
        <Chips
          label="Abilities"
          options={ENEMY_ABILITIES}
          selected={owned}
          onToggle={(ability, on) => setAbilities(toggled(owned, ability, on))}
        />
        {owned.length > 0 && (
          <chakra.div role="group" aria-label="Order" display="flex" flexDirection="column" gap="1">
            <chakra.div {...labelStyle}>In order: the first is where the AI starts.</chakra.div>
            {owned.map((ability, i) => {
              const conflicts = enemy.abilityConfig?.[ability]?.conflicts;
              return (
                <chakra.div key={ability} role="group" aria-label={ability}>
                  <chakra.div display="flex" alignItems="center" gap="1">
                    <chakra.span flex="1" minW="0">
                      {i + 1}. {ability}
                    </chakra.span>
                    <IconButton
                      type="button"
                      aria-label={`Move ${ability} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton
                      type="button"
                      aria-label={`Move ${ability} down`}
                      disabled={i === owned.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={14} />
                    </IconButton>
                  </chakra.div>
                  {Array.isArray(conflicts) && (
                    <chakra.div pl="3.5" pb="1">
                      <Chips
                        label="Conflicts with"
                        options={owned.filter((a) => a !== ability)}
                        selected={conflicts}
                        onToggle={(other, on) =>
                          setEnemy(
                            withConfig(enemy, ability, "conflicts", toggled(conflicts, other, on)),
                          )
                        }
                      />
                    </chakra.div>
                  )}
                </chakra.div>
              );
            })}
          </chakra.div>
        )}
      </Dialog.Body>
      <Dialog.Footer flexWrap="wrap">
        <ActionButton onClick={onBack}>Back</ActionButton>
        <ActionButton onClick={onClose}>Cancel</ActionButton>
        <ActionButton disabled={!valid} onClick={() => create(false)}>
          Create
        </ActionButton>
        {/* A row of its own: it does not fit beside the others at the dialog's width. */}
        <ActionButton flexBasis="100%" disabled={!valid} onClick={() => create(true)}>
          Open in Enemy editor
        </ActionButton>
      </Dialog.Footer>
    </>
  );
}
