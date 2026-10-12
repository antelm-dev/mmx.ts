import { chakra } from "@chakra-ui/react";
import {
  effectiveValue,
  getDefinition,
  type GameObjectDefinition,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import type { ProjectObjectDefinition } from "@mmx/project-schema";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { Field, FieldInput } from "../ui/editor/field.js";
import { PanelActions } from "../ui/editor/panel.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { PropertyControl } from "./PropertyControl.js";

const Row = chakra("div", { base: { py: "3px", px: "3.5" } });
const Note = chakra("div", {
  base: { color: "studio.muted", fontSize: "10px", mt: "3px", mb: "1" },
});

/** Placed instances of a definition across the open level (live) and the project's other levels. */
export function definitionUseCount(definitionId: string): number {
  const project = projectSession.getSnapshot().project;
  const others = (project?.levels ?? [])
    .filter((level) => level.id !== project?.manifest.entryLevelId)
    .map((level) => level.document);
  return [editor.store.get().document, ...others].reduce(
    (n, doc) => n + doc.objects.filter((o) => o.definitionId === definitionId).length,
    0,
  );
}

/** A free `obj.<base>.<n>` id; built-in ids never start with `obj.`. */
function freeId(base: string, objects: readonly ProjectObjectDefinition[]): string {
  for (let n = 1; ; n++) {
    const id = `obj.${base}.${n}`;
    if (!objects.some((o) => o.id === id)) return id;
  }
}

/**
 * Inspector section for the selected instance's object definition: create a
 * project object from it, or (for a project object) edit its name, values and
 * which properties stay editable per instance. Edits go to the manifest.
 */
export function ObjectDefinitionSection({
  inst,
  def,
}: {
  inst: LevelObjectInstance;
  def: GameObjectDefinition;
}) {
  const project = useProjectSession().project;
  if (!project) return null;
  const objects = project.manifest.objects ?? [];
  // Only registered project objects carry a baseId; a manifest entry reusing a built-in id never edits it.
  const entry = def.baseId ? objects.find((o) => o.id === def.id) : undefined;
  const baseId = def.baseId ?? def.id;
  const base = getDefinition(baseId);
  if (!base || baseId === "spawn") return null;

  const create = (): void => {
    const values = Object.fromEntries(
      base.properties.map((p) => [p.key, effectiveValue(inst, p.key)]),
    );
    projectSession.setObjects([
      ...objects,
      { id: freeId(baseId, objects), name: `${def.name} copy`, base: baseId, values },
    ]);
  };

  if (!entry) {
    return (
      <>
        <SectionTitle divider>Object</SectionTitle>
        <Row>
          <Note>Save this object's values as a new object in the palette.</Note>
        </Row>
        <PanelActions>
          <ActionButton onClick={create}>New object from this</ActionButton>
        </PanelActions>
      </>
    );
  }

  const update = (patch: Partial<ProjectObjectDefinition>): void =>
    projectSession.setObjects(objects.map((o) => (o.id === entry.id ? { ...o, ...patch } : o)));
  const keys = base.properties.map((p) => p.key);
  const exposed = entry.exposed ?? keys;

  return (
    <>
      <SectionTitle divider>Object · {entry.name}</SectionTitle>
      <Row>
        <Field label="Name">
          <FieldInput
            defaultValue={entry.name}
            key={`name-${entry.id}-${entry.name}`}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== entry.name) update({ name });
            }}
          />
        </Field>
        <Note>
          Based on {base.name}. Changes apply to every placed {entry.name}.
        </Note>
      </Row>
      {base.properties.map((prop) => (
        <Row key={prop.key}>
          <PropertyControl
            prop={prop}
            value={entry.values?.[prop.key] ?? prop.default}
            onCommit={(next) => update({ values: { ...entry.values, [prop.key]: next } })}
            scope={entry.id}
          />
          <Checkbox
            label="Editable per instance"
            checked={exposed.includes(prop.key)}
            onCheckedChange={(on) =>
              update({ exposed: keys.filter((k) => (k === prop.key ? on : exposed.includes(k))) })
            }
          />
        </Row>
      ))}
      <PanelActions>
        <ActionButton onClick={create}>New object from this</ActionButton>
      </PanelActions>
    </>
  );
}
