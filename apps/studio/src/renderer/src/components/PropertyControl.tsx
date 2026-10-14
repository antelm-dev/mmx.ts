import type { PropertyMeta } from "@mmx/content-schema";
import { useProjectSession } from "../app/useEditor.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { Field, FieldInput } from "../ui/editor/field.js";
import { Select } from "../ui/editor/select.js";

/** Select value standing for an `asset` property set to none (asset ids are never empty). */
const NO_ASSET = "";

/**
 * The control for one property, chosen by its type. `onCommit` runs only for a
 * changed value; `scope` names what is edited (an instance or definition id) so
 * text fields reset when it changes.
 */
export function PropertyControl({
  prop,
  value,
  onCommit,
  scope,
  invalid = false,
}: {
  prop: PropertyMeta;
  value: unknown;
  onCommit: (next: unknown) => void;
  scope: string;
  invalid?: boolean;
}) {
  const assets = useProjectSession().project?.manifest.assets;
  const commit = (next: unknown): void => {
    if (next !== value) onCommit(next);
  };

  switch (prop.type) {
    case "boolean":
      return <Checkbox label={prop.label} checked={value === true} onCheckedChange={commit} />;
    case "enum":
      return (
        <Select
          label={prop.label}
          options={(prop.options ?? []).map((opt) => ({ label: opt, value: opt }))}
          value={String(value ?? "")}
          onValueChange={commit}
          invalid={invalid}
        />
      );
    case "asset":
      return (
        <Select
          label={prop.label}
          options={[
            { label: "(none)", value: NO_ASSET },
            ...(assets ?? [])
              .filter((asset) => asset.kind === prop.assetKind)
              .map((asset) => ({ label: asset.id, value: asset.id })),
          ]}
          value={typeof value === "string" ? value : NO_ASSET}
          onValueChange={commit}
          invalid={invalid}
        />
      );
    default: {
      const text = String(value ?? "");
      return (
        <Field label={prop.label} invalid={invalid}>
          <FieldInput
            type={prop.type === "string" ? "text" : "number"}
            step={prop.type === "integer" ? 1 : undefined}
            defaultValue={text}
            key={`${prop.key}-${scope}-${text}`}
            onBlur={(e) => {
              if (prop.type === "string") return commit(e.target.value);
              const next = Number(e.target.value);
              if (Number.isFinite(next)) commit(next);
            }}
          />
        </Field>
      );
    }
  }
}
