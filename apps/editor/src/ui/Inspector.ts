import {
  effectiveValue,
  instanceSize,
  requireDefinition,
  setProperty,
  setTransform,
  type LevelObjectInstance,
  type PropertyMeta,
  type ValidationIssue,
} from "@mmx/content-schema";
import { clear, el } from "../util/dom.js";
import type { EditorContext } from "./context.js";

/** Right panel: schema-generated inspector with inline validation. */
export class Inspector {
  readonly root = el("div", { class: "panel right" });
  private body = el("div", { class: "scroll", style: "flex:1" });

  constructor(private readonly ctx: EditorContext) {
    this.root.append(el("div", { class: "section-title" }, ["Inspector"]), this.body);
    ctx.store.subscribe((_, reason) => {
      if (
        reason === "document" ||
        reason === "selection" ||
        reason === "open" ||
        reason === "mode"
      ) {
        this.render();
      }
    });
    this.render();
  }

  private render(): void {
    clear(this.body);
    const state = this.ctx.store.get();
    const { selectedIds, document: doc } = state;

    if (selectedIds.length === 0) {
      this.body.append(
        el("div", { class: "inspector-empty" }, ["Select an object to edit its properties."]),
      );
      return;
    }
    if (selectedIds.length > 1) {
      this.body.append(
        el("div", { class: "inspector-empty" }, [`${selectedIds.length} objects selected.`]),
        this.actions(),
      );
      return;
    }

    const inst = doc.objects.find((o) => o.id === selectedIds[0]);
    if (!inst) return;
    const def = requireDefinition(inst.definitionId);
    const issues = this.ctx.store.validate().issues.filter((i) => i.objectId === inst.id);

    // Header.
    this.body.append(
      el("div", { class: "insp-header" }, [
        el("div", { class: "type" }, [
          el("span", { class: "swatch", style: `background:${def.editor.color}` }, []),
          `${def.icon ?? ""} ${def.name}`.trim(),
        ]),
        el("div", { class: "id" }, [inst.id]),
      ]),
    );

    // Object-level issues (no field anchor).
    for (const issue of issues.filter((i) => !i.field)) {
      this.body.append(
        el("div", { class: "field err", style: "padding:6px 12px" }, [issue.message]),
      );
    }

    // Transform.
    this.body.append(el("div", { class: "section-title" }, ["Transform"]));
    this.body.append(this.numberRow(inst, "x", "X", "transform", issues));
    this.body.append(this.numberRow(inst, "y", "Y", "transform", issues));
    if (def.editor.resizable) {
      const { width, height } = instanceSize(inst);
      this.body.append(
        el("div", { class: "field" }, [
          el("div", { class: "row2" }, [
            this.numberInput(inst, "width", "Width", "transform", width, issues),
            this.numberInput(inst, "height", "Height", "transform", height, issues),
          ]),
        ]),
      );
    }

    // Entity-specific properties.
    if (def.properties.length > 0) {
      this.body.append(el("div", { class: "section-title" }, ["Properties"]));
      for (const prop of def.properties) this.body.append(this.propertyField(inst, prop, issues));
    }

    this.body.append(this.actions());
  }

  private actions(): HTMLElement {
    return el("div", { class: "field", style: "display:flex;gap:8px;margin-top:8px" }, [
      el(
        "button",
        { class: "btn", style: "flex:1", onClick: () => this.ctx.duplicateSelection() },
        ["Duplicate"],
      ),
      el(
        "button",
        { class: "btn danger", style: "flex:1", onClick: () => this.ctx.deleteSelection() },
        ["Delete"],
      ),
    ]);
  }

  private issueFor(issues: ValidationIssue[], field: string): ValidationIssue | undefined {
    return issues.find((i) => i.field === field);
  }

  private numberRow(
    inst: LevelObjectInstance,
    key: "x" | "y",
    label: string,
    scope: "transform",
    issues: ValidationIssue[],
  ): HTMLElement {
    return el("div", { class: "field" }, [
      this.numberInput(inst, key, label, scope, inst[key], issues),
    ]);
  }

  private numberInput(
    inst: LevelObjectInstance,
    key: string,
    label: string,
    scope: "transform" | "override",
    value: number,
    issues: ValidationIssue[],
  ): HTMLElement {
    const issue = this.issueFor(issues, key);
    const input = el("input", {
      class: `num ${issue ? "invalid" : ""}`.trim(),
      type: "number",
      value: String(value),
      step: "1",
    }) as HTMLInputElement;
    input.addEventListener("change", () => {
      const next = Number(input.value);
      if (!Number.isFinite(next)) return;
      const before =
        scope === "transform"
          ? ((inst as unknown as Record<string, number>)[key] ?? value)
          : effectiveValue(inst, key);
      if (next === before) return;
      if (scope === "transform")
        this.ctx.store.execute(setTransform(inst.id, { [key]: before as number }, { [key]: next }));
      else this.ctx.store.execute(setProperty(inst.id, key, "override", before, next));
    });
    return el("div", {}, [
      el("label", {}, [label]),
      input,
      issue ? el("div", { class: "err" }, [issue.message]) : el("span", {}, []),
    ]);
  }

  private propertyField(
    inst: LevelObjectInstance,
    prop: PropertyMeta,
    issues: ValidationIssue[],
  ): HTMLElement {
    const value = effectiveValue(inst, prop.key);
    const issue = this.issueFor(issues, prop.key);

    if (prop.type === "boolean") {
      const cb = el("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = value === true;
      cb.addEventListener("change", () => {
        this.ctx.store.execute(
          setProperty(inst.id, prop.key, "override", value === true, cb.checked),
        );
      });
      const wrap = el("label", { class: "check" }, [cb, prop.label]);
      return this.wrapField(prop, wrap, issue);
    }

    if (prop.type === "enum") {
      const sel = el("select", {
        class: `sel ${issue ? "invalid" : ""}`.trim(),
      }) as HTMLSelectElement;
      for (const opt of prop.options ?? []) {
        const o = el("option", { value: opt }, [opt]) as HTMLOptionElement;
        if (String(value) === opt) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener("change", () => {
        this.ctx.store.execute(setProperty(inst.id, prop.key, "override", value, sel.value));
      });
      return this.labeledField(prop, sel, issue);
    }

    // number / string
    const input = el("input", {
      class: `${prop.type === "number" ? "num" : "txt"} ${issue ? "invalid" : ""}`.trim(),
      type: prop.type === "number" ? "number" : "text",
      value: String(value ?? ""),
      step: "1",
    }) as HTMLInputElement;
    input.addEventListener("change", () => {
      const next = prop.type === "number" ? Number(input.value) : input.value;
      if (prop.type === "number" && !Number.isFinite(next as number)) return;
      this.ctx.store.execute(setProperty(inst.id, prop.key, "override", value, next));
    });
    return this.labeledField(prop, input, issue);
  }

  private labeledField(
    prop: PropertyMeta,
    control: HTMLElement,
    issue?: ValidationIssue,
  ): HTMLElement {
    return this.wrapField(prop, el("div", {}, [el("label", {}, [prop.label]), control]), issue);
  }

  private wrapField(prop: PropertyMeta, inner: HTMLElement, issue?: ValidationIssue): HTMLElement {
    const children: (HTMLElement | Node)[] = [inner];
    if (issue) children.push(el("div", { class: "err" }, [issue.message]));
    else if (prop.help) children.push(el("div", { class: "help" }, [prop.help]));
    return el("div", { class: "field" }, children);
  }
}
