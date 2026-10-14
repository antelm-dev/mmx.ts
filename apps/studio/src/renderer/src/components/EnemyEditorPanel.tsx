import type { ReactNode } from "react";
import { chakra } from "@chakra-ui/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { getDefinition, type PropertyMeta } from "@mmx/content-schema";
import type { ActorDefinition, EnemyDefinition, Hitbox, MovementModel } from "@mmx/engine/data";
import { editor, projectSession, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { DEFINITIONS_SCOPE } from "../app/editorKeyboard.js";
import {
  abilityFields,
  AI_EVENTS,
  deleteEnemy,
  ENEMY_ABILITIES,
  enemyForPrefab,
  isProjectEnemy,
  putEnemy,
  renameEnemy,
  toggled,
  withAbilities,
  withConfig,
  withReaction,
} from "../core/enemyEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { labelStyle } from "../ui/editor/field.js";
import { Panel, PanelActions, PanelNote, PanelScroll } from "../ui/editor/panel.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { definitionDeleteBlocker } from "./ObjectDefinitionSection.js";
import { PropertyControl } from "./PropertyControl.js";

const Row = chakra("div", { base: { py: "3px", px: "3.5" } });
const Grid2 = chakra("div", {
  base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: "2" },
});
const Note = chakra("div", {
  base: { color: "studio.muted", fontSize: "10px", px: "3.5", mb: "1" },
});
const ErrorText = chakra("div", {
  base: { color: "studio.dangerFg", fontSize: "10.5px", mt: "3px", mb: "1" },
});
const Chip = chakra("button", {
  base: {
    px: "2",
    h: "6",
    border: "1px solid",
    borderColor: "studio.border",
    rounded: "5px",
    bg: "studio.raised",
    color: "studio.fgTertiary",
    fontSize: "11px",
    cursor: "pointer",
    _pressed: { borderColor: "studio.accent", bg: "studio.accent/20", color: "studio.fg" },
    _disabled: { opacity: 0.5, cursor: "default" },
  },
});
const IconButton = chakra("button", {
  base: {
    display: "grid",
    placeItems: "center",
    w: "6",
    h: "6",
    rounded: "md",
    color: "studio.fgTertiary",
    cursor: "pointer",
    _hover: { color: "studio.fg", bg: "studio.hover" },
    _disabled: {
      opacity: 0.35,
      cursor: "default",
      _hover: { color: "studio.fgTertiary", bg: "transparent" },
    },
  },
});

const num = (key: string, label: string): PropertyMeta => ({ key, label, type: "number" });
const BOX_FIELDS = [
  num("hw", "Half width"),
  num("hh", "Half height"),
  num("ox", "Offset X"),
  num("oy", "Offset Y"),
];
const SHIELDS = ["none", "unbreakable", "breakable"];
const shieldOf = (enemy: EnemyDefinition): string =>
  !enemy.shield ? "none" : enemy.shield.breakable ? "breakable" : "unbreakable";

/** Toggle buttons picking any of `options` (an ability multi-select). */
function Chips({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: readonly string[];
  onToggle: (option: string, on: boolean) => void;
}) {
  return (
    <chakra.div role="group" aria-label={label}>
      <chakra.div {...labelStyle}>{label}</chakra.div>
      <chakra.div display="flex" flexWrap="wrap" gap="1">
        {options.length === 0 && (
          <chakra.span color="studio.muted" fontSize="10px">
            No abilities
          </chakra.span>
        )}
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <Chip
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(option, !on)}
            >
              {option}
            </Chip>
          );
        })}
      </chakra.div>
    </chakra.div>
  );
}

/**
 * Tool panel: compose the enemy picked in the Object Palette as data. A project
 * enemy (data/game.json) is edited in place; a built-in one is shown read-only
 * and can be duplicated into the project. Compile errors show by their field.
 */
export function EnemyEditorPanel() {
  const project = useProjectSession().project;
  const prefabId = useUiStore((s) => s.enemyEditorId);
  // Re-render on level edits: placed instances block Delete.
  useEditorSnapshot();
  if (!project)
    return <PanelNote {...DEFINITIONS_SCOPE}>Open a project to edit its enemies.</PanelNote>;
  const found = prefabId ? enemyForPrefab(project.gameData, prefabId) : null;
  const def = prefabId ? getDefinition(prefabId) : undefined;
  if (!found || !prefabId) {
    return (
      <PanelNote {...DEFINITIONS_SCOPE}>
        {!prefabId
          ? "Pick an enemy to edit with its Edit button in the Object Palette."
          : project.gameData?.prefabs?.[prefabId] || def
            ? `'${prefabId}' cannot be shown: fix data/game.json (see Problems) or pick another enemy.`
            : `'${prefabId}' was deleted.`}
      </PanelNote>
    );
  }

  const { enemy, actor, editable } = found;
  const gameData = projectSession.gameData();
  const broken = gameData.issues.length > 0;
  const base = `enemies.${enemy.id}`;
  const errorsAt = (fieldPath: string): string[] =>
    gameData.diagnostics.filter((d) => d.fieldPath === fieldPath).map((d) => d.message);
  const errors = (fieldPath: string): ReactNode =>
    errorsAt(fieldPath).map((message) => <ErrorText key={message}>{message}</ErrorText>);
  const save = (next: EnemyDefinition, nextActor?: ActorDefinition): void => {
    if (project.gameData) editor.setGameData(putEnemy(project.gameData, next, nextActor));
  };
  const name = def?.name ?? enemy.id;
  // Rename and Delete are for enemies the project adds, not built-ins or overrides of them.
  const own = isProjectEnemy(project.gameData, prefabId);
  const blocker = own ? definitionDeleteBlocker(prefabId) : null;
  const remove = (): void => {
    if (!project.gameData || !window.confirm(`Delete the enemy '${name}' from the project?`))
      return;
    editor.setGameData(deleteEnemy(project.gameData, prefabId));
  };

  /** One property of the enemy (or its actor) at `fieldPath`, with that field's compile errors. */
  const control = (
    prop: PropertyMeta,
    value: unknown,
    fieldPath: string,
    commit: (next: never) => void,
  ) => (
    <>
      <PropertyControl
        prop={prop}
        value={value}
        onCommit={(next) => commit(next as never)}
        scope={fieldPath}
        invalid={errorsAt(fieldPath).length > 0}
      />
      {errors(fieldPath)}
    </>
  );
  const field = (
    prop: PropertyMeta,
    value: unknown,
    fieldPath: string,
    commit: (next: never) => void,
  ) => <Row key={fieldPath}>{control(prop, value, fieldPath, commit)}</Row>;
  const box = (label: string, value: Hitbox, fieldPath: string, commit: (next: Hitbox) => void) => (
    <chakra.div role="group" aria-label={label}>
      <SectionTitle divider>{label}</SectionTitle>
      <Grid2 px="3.5">
        {BOX_FIELDS.map((prop) => (
          <chakra.div key={prop.key} minW="0" py="3px">
            {control(
              prop,
              value[prop.key as keyof Hitbox] ?? 0,
              `${fieldPath}.${prop.key}`,
              (next: number) => commit({ ...value, [prop.key]: next }),
            )}
          </chakra.div>
        ))}
      </Grid2>
    </chakra.div>
  );

  const sheets = (project.manifest.assets ?? [])
    .filter((a) => a.kind === "animation")
    .map((a) => a.id);
  const projectiles = Object.keys(gameData.data.projectiles);
  const owned = enemy.abilities;
  const setAbilities = (abilities: string[]): void => save(withAbilities(enemy, abilities));
  const move = (i: number, by: number): void => {
    const next = [...owned];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setAbilities(next);
  };

  return (
    <Panel {...DEFINITIONS_SCOPE}>
      {/* The containing block of the checkboxes' hidden inputs, so focusing one never scrolls the dock. */}
      <PanelScroll position="relative">
        <SectionTitle>Enemy · {enemy.id}</SectionTitle>
        {!editable && (
          <Note>Built-in enemy, read-only. Duplicate it to edit a copy in this project.</Note>
        )}
        <PanelActions pt="1">
          <ActionButton
            disabled={broken}
            title={broken ? "Fix the data/game.json errors in Problems first" : undefined}
            onClick={() => editor.duplicateEnemy(enemy.id, name)}
          >
            Duplicate
          </ActionButton>
          {own && (
            <ActionButton disabled={!!blocker} title={blocker ?? undefined} onClick={remove}>
              Delete
            </ActionButton>
          )}
        </PanelActions>
        <chakra.fieldset disabled={!editable} border="0" m="0" p="0" minW="0">
          {/* The display name only: ids, placed instances and objects based on it are unchanged. */}
          <Row>
            <chakra.fieldset disabled={!own} border="0" m="0" p="0" minW="0">
              {control(
                { key: "name", label: "Name", type: "string" },
                name,
                `prefabs.${prefabId}.name`,
                (next: string) => {
                  const trimmed = next.trim();
                  if (trimmed && trimmed !== name && project.gameData)
                    editor.setGameData(renameEnemy(project.gameData, prefabId, trimmed));
                },
              )}
            </chakra.fieldset>
          </Row>
          {actor &&
            field(
              num("maxHealth", "Health"),
              actor.maxHealth,
              `actors.${actor.id}.maxHealth`,
              (maxHealth: number) => save(enemy, { ...actor, maxHealth }),
            )}
          {field(
            num("touchDamage", "Touch damage"),
            enemy.touchDamage,
            `${base}.touchDamage`,
            (touchDamage: number) => save({ ...enemy, touchDamage }),
          )}
          {field(
            {
              key: "sheet",
              label: "Animation",
              type: "enum",
              options: sheets.includes(enemy.sheet) ? sheets : [enemy.sheet, ...sheets],
            },
            enemy.sheet,
            `${base}.sheet`,
            (sheet: string) => save({ ...enemy, sheet }),
          )}
          {field(
            { key: "initialAnimation", label: "Initial clip", type: "string" },
            enemy.initialAnimation,
            `${base}.initialAnimation`,
            (initialAnimation: string) => save({ ...enemy, initialAnimation }),
          )}
          {field(
            { key: "movement", label: "Movement", type: "enum", options: ["ground", "flying"] },
            enemy.movement,
            `${base}.movement`,
            (movement: MovementModel) => save({ ...enemy, movement }),
          )}
          {field(
            { key: "shield", label: "Shield", type: "enum", options: SHIELDS },
            shieldOf(enemy),
            `${base}.shield`,
            (shield: string) => {
              const { shield: _old, ...rest } = enemy;
              save(
                shield === "none"
                  ? rest
                  : { ...rest, shield: { breakable: shield === "breakable" } },
              );
            },
          )}
          {actor &&
            box("Body", actor.body, `actors.${actor.id}.body`, (body) =>
              save(enemy, { ...actor, body }),
            )}
          {box("Hurtbox", enemy.hurtbox, `${base}.hurtbox`, (hurtbox) =>
            save({ ...enemy, hurtbox }),
          )}
          {box("Perception", enemy.perception, `${base}.perception`, (perception) =>
            save({ ...enemy, perception }),
          )}

          <SectionTitle divider>Abilities</SectionTitle>
          <Note>In order: the first is where the AI starts.</Note>
          {owned.map((ability, i) => (
            <Row key={ability} display="flex" alignItems="center" gap="1">
              <chakra.div flex="1" minW="0">
                <Checkbox
                  label={ability}
                  checked
                  onCheckedChange={() => setAbilities(owned.filter((a) => a !== ability))}
                />
                {errors(`${base}.abilities[${i}]`)}
              </chakra.div>
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
            </Row>
          ))}
          {ENEMY_ABILITIES.filter((ability) => !owned.includes(ability)).map((ability) => (
            <Row key={ability}>
              <Checkbox
                label={ability}
                checked={false}
                onCheckedChange={() => setAbilities([...owned, ability])}
              />
            </Row>
          ))}

          {owned.map((ability) => {
            const config = enemy.abilityConfig?.[ability] ?? {};
            const configPath = `${base}.abilityConfig.${ability}`;
            const conflicts = config.conflicts;
            return (
              <chakra.div key={ability} role="group" aria-label={ability}>
                <SectionTitle divider>{ability}</SectionTitle>
                <chakra.div px="3.5">{errors(configPath)}</chakra.div>
                {abilityFields(ability, projectiles).map((prop) =>
                  field(
                    prop,
                    config[prop.key],
                    `${configPath}.${prop.key}`,
                    (next: number | string | boolean) =>
                      save(withConfig(enemy, ability, prop.key, next)),
                  ),
                )}
                {Array.isArray(conflicts) && (
                  <Row>
                    <Chips
                      label="Conflicts with"
                      options={owned.filter((a) => a !== ability)}
                      selected={conflicts}
                      onToggle={(other, on) =>
                        save(withConfig(enemy, ability, "conflicts", toggled(conflicts, other, on)))
                      }
                    />
                    {errors(`${configPath}.conflicts`)}
                  </Row>
                )}
              </chakra.div>
            );
          })}

          <SectionTitle divider>Reactions</SectionTitle>
          <Note>Which abilities answer each AI event.</Note>
          {AI_EVENTS.map((event) => (
            <Row key={event}>
              <Chips
                label={event}
                options={owned}
                selected={enemy.reactions[event] ?? []}
                onToggle={(ability, on) => save(withReaction(enemy, event, ability, on))}
              />
              {errors(`${base}.reactions.${event}`)}
            </Row>
          ))}
        </chakra.fieldset>
      </PanelScroll>
    </Panel>
  );
}
