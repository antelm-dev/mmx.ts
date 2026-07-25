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
import {
  actionBtn,
  actionBtnDanger,
  actions,
  cx,
  fieldLabel,
  inputCls,
  panel,
  scroll,
  sectionTitle,
  sectionTitleSub,
} from "../ui.js";
import { SpritePreview } from "./SpritePreview.js";

const errText = "text-danger-fg text-[10.5px] mt-[3px] mb-1";
const emptyTitle = "mb-1.5 text-fg font-[650]";
const emptyCopy = "max-w-[220px] text-fg-3 text-[11.5px] leading-[1.55]";
const emptyIcon =
  "grid place-items-center w-[46px] h-[46px] mb-[15px] border border-border-strong rounded-[13px] " +
  "text-[#7aaaff] bg-[linear-gradient(145deg,rgba(59,130,246,0.15),rgba(59,130,246,0.04))] text-[22px]";
const emptyState = "flex flex-col items-center pt-16 px-7 pb-6 text-center";

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
    <div className={panel}>
      <div className={scroll}>
        {single ? (
          <>
            <div className="flex items-center gap-3 pt-4 px-3.5 pb-3 font-semibold">
              <SpritePreview
                definitionId={single.def.id}
                size={56}
                flip={previewFlip(single)}
                fallbackColor={single.def.editor.color}
              />
              <div className="flex flex-col gap-[3px] min-w-0">
                <span className="leading-[1.2]">
                  {single.def.icon} {single.def.name}
                </span>
                <span className="font-mono text-[10px] font-medium text-fg-3 break-all">{single.inst.id}</span>
              </div>
            </div>

            {objectIssues.map((issue) => (
              <div key={issue.code} className={cx(errText, "px-3 py-1")}>
                {issue.message}
              </div>
            ))}

            <div className={cx(sectionTitle, sectionTitleSub)}>Transform</div>
            <div className="grid grid-cols-2 gap-2 py-[3px] px-3.5">
              <label className="flex flex-col min-w-0">
                <span className={fieldLabel}>X</span>
                <input
                  className={inputCls()}
                  type="number"
                  defaultValue={single.inst.x}
                  key={`x-${single.inst.id}-${single.inst.x}`}
                  onBlur={(e) => onTransform(single, "x", e.target.value)}
                />
              </label>
              <label className="flex flex-col min-w-0">
                <span className={fieldLabel}>Y</span>
                <input
                  className={inputCls()}
                  type="number"
                  defaultValue={single.inst.y}
                  key={`y-${single.inst.id}-${single.inst.y}`}
                  onBlur={(e) => onTransform(single, "y", e.target.value)}
                />
              </label>
            </div>
            {single.def.editor.resizable && (
              <div className="grid grid-cols-2 gap-2 py-[3px] px-3.5">
                <label className="flex flex-col min-w-0">
                  <span className={fieldLabel}>Width</span>
                  <input
                    className={inputCls(hasIssue("width"))}
                    type="number"
                    defaultValue={single.width}
                    key={`w-${single.inst.id}-${single.width}`}
                    onBlur={(e) => onTransform(single, "width", e.target.value)}
                  />
                </label>
                <label className="flex flex-col min-w-0">
                  <span className={fieldLabel}>Height</span>
                  <input
                    className={inputCls(hasIssue("height"))}
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
                <div className={cx(sectionTitle, sectionTitleSub)}>Properties</div>
                {single.def.properties.map((prop) => (
                  <div className="py-[3px] px-3.5" key={prop.key}>
                    {prop.type === "boolean" ? (
                      <label className="flex items-center gap-[9px] text-xs text-fg cursor-pointer">
                        <Checkbox.Root
                          className="w-[18px] h-[18px] inline-flex items-center justify-center border border-border-strong rounded-[5px] bg-raised data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-white"
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
                        <span className={fieldLabel}>{prop.label}</span>
                        <Select.Root
                          value={str(single.inst, prop.key)}
                          onValueChange={(v) => onEnum(single.inst, prop, v)}
                        >
                          <Select.Trigger
                            className={cx(
                              "flex items-center justify-between gap-2 w-full h-8 px-[9px] border rounded-[7px] bg-raised text-fg text-xs cursor-pointer outline-none",
                              hasIssue(prop.key) ? "border-danger-fg" : "border-border-strong",
                            )}
                          >
                            <Select.Value />
                            <Select.Icon>
                              <ChevronDown size={14} />
                            </Select.Icon>
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content
                              className="z-[60] bg-popover border border-popover-border rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.45)] py-1 overflow-hidden"
                              position="popper"
                              sideOffset={4}
                            >
                              <Select.Viewport>
                                {prop.options?.map((opt) => (
                                  <Select.Item
                                    key={opt}
                                    value={opt}
                                    className="flex items-center h-[30px] px-3 text-menu-fg text-xs cursor-pointer outline-none data-[highlighted]:bg-popover-hover data-[highlighted]:text-menu-fg-hover"
                                  >
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
                        <span className={fieldLabel}>{prop.label}</span>
                        <input
                          className={inputCls(hasIssue(prop.key))}
                          type={prop.type === "number" ? "number" : "text"}
                          defaultValue={str(single.inst, prop.key)}
                          key={`${prop.key}-${single.inst.id}-${str(single.inst, prop.key)}`}
                          onBlur={(e) => onProp(single.inst, prop, e.target.value)}
                        />
                      </>
                    )}
                    {issueFor(prop.key) ? (
                      <div className={errText}>{issueFor(prop.key)!.message}</div>
                    ) : prop.help ? (
                      <div className="text-muted text-[10px] mt-[3px] mb-1">{prop.help}</div>
                    ) : null}
                  </div>
                ))}
              </>
            )}

            <div className={actions}>
              <button className={actionBtn} onClick={() => editor.duplicateSelection()}>
                Duplicate
              </button>
              <button className={actionBtnDanger} onClick={() => editor.deleteSelection()}>
                Delete
              </button>
            </div>
          </>
        ) : state.selectedIds.length > 1 ? (
          <>
            <div className={emptyState}>
              <div className={emptyIcon}>◫</div>
              <div className={emptyTitle}>{state.selectedIds.length} objects selected</div>
              <div className={emptyCopy}>Duplicate or delete the current selection.</div>
            </div>
            <div className={actions}>
              <button className={actionBtn} onClick={() => editor.duplicateSelection()}>
                Duplicate
              </button>
              <button className={actionBtnDanger} onClick={() => editor.deleteSelection()}>
                Delete
              </button>
            </div>
          </>
        ) : (
          <div className={emptyState}>
            <div className={emptyIcon}>◇</div>
            <div className={emptyTitle}>Nothing selected</div>
            <div className={emptyCopy}>
              Choose an object on the canvas or from the Scene tab to edit its properties.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
