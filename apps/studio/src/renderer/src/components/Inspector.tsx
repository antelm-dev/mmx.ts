import { useMemo } from "react";
import * as Select from "@radix-ui/react-select";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Check, ChevronDown } from "lucide-react";
import {
  effectiveValue,
  instanceSize,
  requireDefinition,
  setProperty,
  setTransform,
  type GameObjectDefinition,
  type LevelObjectInstance,
  type PropertyMeta,
  type ValidationIssue,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { SpritePreview } from "./SpritePreview.js";

interface Single {
  inst: LevelObjectInstance;
  def: GameObjectDefinition;
  width: number;
  height: number;
}

/** Right dock: schema-generated inspector with inline validation. */
export function Inspector() {
  const snap = useEditorSnapshot();
  const state = snap.state;

  const single = useMemo<Single | null>(() => {
    if (state.selectedIds.length !== 1) return null;
    const inst = state.document.objects.find((o) => o.id === state.selectedIds[0]);
    if (!inst) return null;
    const def = requireDefinition(inst.definitionId);
    const size = instanceSize(inst);
    return { inst, def, width: size.width, height: size.height };
  }, [state.selectedIds, state.document.objects]);

  const issues = useMemo<ValidationIssue[]>(() => {
    if (!single) return [];
    return snap.validation.issues.filter((i) => i.objectId === single.inst.id);
  }, [single, snap.validation]);

  const objectIssues = issues.filter((i) => !i.field);
  const hasIssue = (field: string) => issues.some((i) => i.field === field);
  const issueFor = (field: string) => issues.find((i) => i.field === field);

  const str = (inst: LevelObjectInstance, key: string): string => {
    const v = effectiveValue(inst, key);
    return v === undefined || v === null ? "" : String(v);
  };

  const onTransform = (s: Single, key: "x" | "y" | "width" | "height", raw: string): void => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const before = key === "x" ? s.inst.x : key === "y" ? s.inst.y : s[key];
    if (next === before) return;
    editor.store.execute(setTransform(s.inst.id, { [key]: before }, { [key]: next }));
  };

  const onProp = (inst: LevelObjectInstance, prop: PropertyMeta, raw: string): void => {
    const next = prop.type === "number" ? Number(raw) : raw;
    if (prop.type === "number" && !Number.isFinite(next as number)) return;
    editor.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key), next),
    );
  };

  const onBool = (inst: LevelObjectInstance, prop: PropertyMeta, checked: boolean): void => {
    editor.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key) === true, checked),
    );
  };

  const onEnum = (inst: LevelObjectInstance, prop: PropertyMeta, value: string): void => {
    editor.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key), value),
    );
  };

  const previewFlip = (s: Single) =>
    s.def.category === "enemy" && effectiveValue(s.inst, "FacesRight") === true;

  return (
    <div className="panel">
      <div className="scroll">
        {single ? (
          <>
            <div className="header">
              <SpritePreview
                definitionId={single.def.id}
                size={56}
                flip={previewFlip(single)}
                fallbackColor={single.def.editor.color}
              />
              <div className="title">
                <span className="name">
                  {single.def.icon} {single.def.name}
                </span>
                <span className="id">{single.inst.id}</span>
              </div>
            </div>

            {objectIssues.map((issue) => (
              <div key={issue.code} className="err block">
                {issue.message}
              </div>
            ))}

            <div className="section-title sub">Transform</div>
            <div className="row2">
              <label className="field-block">
                <span className="field-label">X</span>
                <input
                  className="input"
                  type="number"
                  defaultValue={single.inst.x}
                  key={`x-${single.inst.id}-${single.inst.x}`}
                  onBlur={(e) => onTransform(single, "x", e.target.value)}
                />
              </label>
              <label className="field-block">
                <span className="field-label">Y</span>
                <input
                  className="input"
                  type="number"
                  defaultValue={single.inst.y}
                  key={`y-${single.inst.id}-${single.inst.y}`}
                  onBlur={(e) => onTransform(single, "y", e.target.value)}
                />
              </label>
            </div>
            {single.def.editor.resizable && (
              <div className="row2">
                <label className="field-block">
                  <span className="field-label">Width</span>
                  <input
                    className={`input${hasIssue("width") ? " bad" : ""}`}
                    type="number"
                    defaultValue={single.width}
                    key={`w-${single.inst.id}-${single.width}`}
                    onBlur={(e) => onTransform(single, "width", e.target.value)}
                  />
                </label>
                <label className="field-block">
                  <span className="field-label">Height</span>
                  <input
                    className={`input${hasIssue("height") ? " bad" : ""}`}
                    type="number"
                    defaultValue={single.height}
                    key={`h-${single.inst.id}-${single.height}`}
                    onBlur={(e) => onTransform(single, "height", e.target.value)}
                  />
                </label>
              </div>
            )}

            {single.def.properties.length > 0 && (
              <>
                <div className="section-title sub">Properties</div>
                {single.def.properties.map((prop) => (
                  <div className="field" key={prop.key}>
                    {prop.type === "boolean" ? (
                      <label className="checkbox-row">
                        <Checkbox.Root
                          className="checkbox-box"
                          checked={effectiveValue(single.inst, prop.key) === true}
                          onCheckedChange={(c) => onBool(single.inst, prop, c === true)}
                        >
                          <Checkbox.Indicator>
                            <Check size={14} />
                          </Checkbox.Indicator>
                        </Checkbox.Root>
                        {prop.label}
                      </label>
                    ) : prop.type === "enum" ? (
                      <>
                        <span className="field-label">{prop.label}</span>
                        <Select.Root
                          value={str(single.inst, prop.key)}
                          onValueChange={(v) => onEnum(single.inst, prop, v)}
                        >
                          <Select.Trigger className={`select-trigger${hasIssue(prop.key) ? " bad" : ""}`}>
                            <Select.Value />
                            <Select.Icon>
                              <ChevronDown size={14} />
                            </Select.Icon>
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="select-content" position="popper" sideOffset={4}>
                              <Select.Viewport>
                                {prop.options?.map((opt) => (
                                  <Select.Item key={opt} value={opt} className="select-item">
                                    <Select.ItemText>{opt}</Select.ItemText>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </>
                    ) : (
                      <>
                        <span className="field-label">{prop.label}</span>
                        <input
                          className={`input${hasIssue(prop.key) ? " bad" : ""}`}
                          type={prop.type === "number" ? "number" : "text"}
                          defaultValue={str(single.inst, prop.key)}
                          key={`${prop.key}-${single.inst.id}-${str(single.inst, prop.key)}`}
                          onBlur={(e) => onProp(single.inst, prop, e.target.value)}
                        />
                      </>
                    )}
                    {issueFor(prop.key) ? (
                      <div className="err">{issueFor(prop.key)!.message}</div>
                    ) : prop.help ? (
                      <div className="help">{prop.help}</div>
                    ) : null}
                  </div>
                ))}
              </>
            )}

            <div className="actions">
              <button className="btn" onClick={() => editor.duplicateSelection()}>
                Duplicate
              </button>
              <button className="btn danger" onClick={() => editor.deleteSelection()}>
                Delete
              </button>
            </div>
          </>
        ) : state.selectedIds.length > 1 ? (
          <>
            <div className="empty-state">
              <div className="empty-icon">◫</div>
              <div className="empty-title">{state.selectedIds.length} objects selected</div>
              <div className="empty-copy">Duplicate or delete the current selection.</div>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => editor.duplicateSelection()}>
                Duplicate
              </button>
              <button className="btn danger" onClick={() => editor.deleteSelection()}>
                Delete
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">◇</div>
            <div className="empty-title">Nothing selected</div>
            <div className="empty-copy">
              Choose an object on the canvas or from the Scene tab to edit its properties.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
