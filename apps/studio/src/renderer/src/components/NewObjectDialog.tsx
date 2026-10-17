import { useRef, useState } from "react";
import { chakra, Dialog, Portal } from "@chakra-ui/react";
import { ChevronRight, Plus } from "lucide-react";
import { CATEGORY_LABELS, allDefinitions, type GameObjectDefinition } from "@mmx/content-schema";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import { focusPanel } from "../app/dock.js";
import { DEFINITIONS_SCOPE } from "../app/editorKeyboard.js";
import {
  addObject,
  behaviourDescription,
  chosenBase,
  freeObjectId,
  newObjectBases,
} from "../core/objectDefinitions.js";
import { useUiStore } from "../store/uiStore.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { Field, FieldInput } from "../ui/editor/field.js";
import { ListRow } from "../ui/editor/list-row.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { BlankEnemyForm, NewEnemyForm } from "./NewEnemyDialog.js";
import { PropertyControl } from "./PropertyControl.js";
import { SpritePreview } from "./SpritePreview.js";

const Note = chakra("div", { base: { color: "studio.fgTertiary", fontSize: "11px" } });

/**
 * New object… (C-NEWOBJ): pick a category, then its behaviour (the built-in object
 * it is based on, skipped when there is only one), then its name and values. An
 * enemy starts blank, composed from abilities, or from an enemy as a template, and
 * goes on to an enemy form (data/game.json); anything else becomes a project object.
 * Either is picked for placing.
 */
export function NewObjectDialog() {
  const request = useUiStore((s) => s.newObject);
  const close = useUiStore((s) => s.closeNewObject);
  // Opened from the store, not a Dialog.Trigger: focus goes back to what had it on opening,
  // so Ctrl+Z there right after a creation undoes it.
  const opener = useRef<{ open: boolean; el: Element | null }>({ open: false, el: null });
  if (request && !opener.current.open) opener.current.el = document.activeElement;
  opener.current.open = request !== null;
  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(e) => !e.open && close()}
      // Keys stay in the dialog: they must not reach the editor's window shortcuts.
      onEscapeKeyDown={(e) => e.stopPropagation()}
      placement="center"
      finalFocusEl={() => opener.current.el as HTMLElement | null}
      // Each opening starts over at its first step.
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            {...DEFINITIONS_SCOPE}
            maxW="380px"
            bg="studio.popover"
            border="1px solid"
            borderColor="studio.popoverBorder"
            color="studio.fg"
            fontSize="12.5px"
            onKeyDown={(e) => e.stopPropagation()}
          >
            <NewObjectSteps initialCategory={request?.category} onClose={close} />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function NewObjectSteps({
  initialCategory,
  onClose,
}: Readonly<{ initialCategory?: string; onClose: () => void }>) {
  // The catalog follows the project's objects and game data (project enemies are bases too).
  useProjectSession();
  const offered = newObjectBases(allDefinitions());
  const [category, setCategory] = useState(
    offered.some((c) => c.category === initialCategory) ? initialCategory : undefined,
  );
  const [baseId, setBaseId] = useState<string>();
  const [blank, setBlank] = useState(false);
  const bases = offered.find((c) => c.category === category)?.bases ?? [];
  const base = chosenBase(bases, baseId);
  // With a single behaviour, Back from the values goes straight to the categories.
  const back = () => (bases.length === 1 ? setCategory(undefined) : setBaseId(undefined));
  const categoryLabel = category && (CATEGORY_LABELS[category] ?? category);
  const enemies = category === "enemy";
  const rows = bases.map((d, i) => (
    <ListRow key={d.id} autoFocus={i === 0 && !enemies} onClick={() => setBaseId(d.id)}>
      <SpritePreview definitionId={d.id} size={28} fallbackColor={d.editor.color} />
      <chakra.span flex="1" display="flex" flexDirection="column">
        {d.name}
        {/* A span: a button holds phrasing content only. */}
        <chakra.span color="studio.fgTertiary" fontSize="11px">
          {behaviourDescription(d)}
        </chakra.span>
      </chakra.span>
      <ChevronRight size={14} />
    </ListRow>
  ));

  return (
    <>
      <Dialog.Header display="flex" flexDirection="column" alignItems="flex-start" gap="1">
        <Dialog.Title fontSize="14px">New object</Dialog.Title>
        <Dialog.Description color="studio.fgTertiary" fontSize="11px">
          {!category
            ? "Choose a category."
            : enemies && blank
              ? `${categoryLabel} · Blank enemy`
              : !base
                ? `${categoryLabel} · Behaviour`
                : base.category === "enemy"
                  ? `${categoryLabel} · based on ${base.name}`
                  : `${categoryLabel} · ${base.name}`}
        </Dialog.Description>
      </Dialog.Header>
      {!category ? (
        <>
          <Dialog.Body px="2" role="group" aria-label="Categories">
            {offered.map((c, i) => (
              <ListRow key={c.category} autoFocus={i === 0} onClick={() => setCategory(c.category)}>
                <chakra.span flex="1">{CATEGORY_LABELS[c.category] ?? c.category}</chakra.span>
                <ChevronRight size={14} />
              </ListRow>
            ))}
          </Dialog.Body>
          <Dialog.Footer>
            <ActionButton onClick={onClose}>Cancel</ActionButton>
          </Dialog.Footer>
        </>
      ) : enemies && blank ? (
        <BlankEnemyForm onBack={() => setBlank(false)} onClose={onClose} />
      ) : !base ? (
        <>
          <Dialog.Body px="2" role="group" aria-label="Behaviour">
            {enemies ? (
              <>
                <ListRow autoFocus onClick={() => setBlank(true)}>
                  <chakra.span display="grid" placeItems="center" w="28px" h="28px" flexShrink={0}>
                    <Plus size={16} />
                  </chakra.span>
                  <chakra.span flex="1" display="flex" flexDirection="column">
                    Blank enemy
                    <chakra.span color="studio.fgTertiary" fontSize="11px">
                      Starts with no behaviour: compose it from abilities.
                    </chakra.span>
                  </chakra.span>
                  <ChevronRight size={14} />
                </ListRow>
                <chakra.div role="group" aria-label="Templates">
                  <SectionTitle px="2">Templates</SectionTitle>
                  {rows}
                </chakra.div>
              </>
            ) : (
              rows
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <ActionButton onClick={() => setCategory(undefined)}>Back</ActionButton>
            <ActionButton onClick={onClose}>Cancel</ActionButton>
          </Dialog.Footer>
        </>
      ) : base.category === "enemy" ? (
        // A built-in enemy definition's Kind is its enemy id.
        <NewEnemyForm base={String(base.fields.Kind)} onBack={back} onClose={onClose} />
      ) : (
        <NewProjectObjectForm base={base} onBack={back} onClose={onClose} />
      )}
    </>
  );
}

/** Last step for any category but Enemy: a project object (manifest.objects) based on `base`. */
function NewProjectObjectForm({
  base,
  onBack,
  onClose,
}: Readonly<{ base: GameObjectDefinition; onBack: () => void; onClose: () => void }>) {
  const objects = useProjectSession().project?.manifest.objects ?? [];
  const keys = base.properties.map((p) => p.key);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(base.properties.map((p) => [p.key, p.default])),
  );
  const [exposed, setExposed] = useState(keys);

  const create = () => {
    const next = addObject(objects, base, name, values, exposed);
    // Undoable in the definitions history; placing it also makes it a recent part.
    projectSession.setObjects(next.objects);
    editor.store.setTool("place", next.id);
    // Placing needs the level in view: the Start tab or a document may be covering it.
    focusPanel("viewport");
    onClose();
  };

  return (
    <>
      <Dialog.Body display="flex" flexDirection="column" gap="3">
        <Field label="Name">
          <FieldInput value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Note>Id: {freeObjectId(base.id, objects)}</Note>
        {base.properties.length === 0 && (
          <Note>{base.name} has no values to set: the new object is a renamed copy.</Note>
        )}
        {base.properties.map((prop) => (
          <chakra.div key={prop.key} display="flex" flexDirection="column" gap="1">
            <PropertyControl
              prop={prop}
              value={values[prop.key]}
              onCommit={(next) => setValues({ ...values, [prop.key]: next })}
              scope={base.id}
            />
            <Checkbox
              label="Editable per instance"
              checked={exposed.includes(prop.key)}
              onCheckedChange={(on) =>
                setExposed(keys.filter((k) => (k === prop.key ? on : exposed.includes(k))))
              }
            />
          </chakra.div>
        ))}
      </Dialog.Body>
      <Dialog.Footer>
        <ActionButton onClick={onBack}>Back</ActionButton>
        <ActionButton onClick={onClose}>Cancel</ActionButton>
        <ActionButton disabled={name.trim() === ""} onClick={create}>
          Create
        </ActionButton>
      </Dialog.Footer>
    </>
  );
}
