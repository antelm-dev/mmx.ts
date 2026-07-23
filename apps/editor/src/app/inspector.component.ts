import { Component, computed, inject } from "@angular/core";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonModule } from "@angular/material/button";
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
import { EditorService } from "./editor.service.js";

interface Single {
  inst: LevelObjectInstance;
  def: GameObjectDefinition;
  width: number;
  height: number;
}

/** Right panel: schema-generated inspector with inline validation. */
@Component({
  selector: "mmx-inspector",
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  template: `
    <div class="panel">
      <div class="section-title">Inspector</div>
      <div class="scroll">
        @if (single(); as s) {
          <div class="header">
            <span class="swatch" [style.background]="s.def.editor.color"></span>
            <span class="name">{{ s.def.icon }} {{ s.def.name }}</span>
          </div>
          <div class="id">{{ s.inst.id }}</div>

          @for (issue of objectIssues(); track issue.code) {
            <div class="err block">{{ issue.message }}</div>
          }

          <div class="section-title sub">Transform</div>
          <div class="row2">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>X</mat-label>
              <input
                matInput
                type="number"
                [value]="fmt(s.inst.x)"
                (change)="onTransform(s, 'x', $event)"
              />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Y</mat-label>
              <input
                matInput
                type="number"
                [value]="fmt(s.inst.y)"
                (change)="onTransform(s, 'y', $event)"
              />
            </mat-form-field>
          </div>
          @if (s.def.editor.resizable) {
            <div class="row2">
              <mat-form-field
                appearance="outline"
                subscriptSizing="dynamic"
                [class.bad]="hasIssue('width')"
              >
                <mat-label>Width</mat-label>
                <input
                  matInput
                  type="number"
                  [value]="fmt(s.width)"
                  (change)="onTransform(s, 'width', $event)"
                />
              </mat-form-field>
              <mat-form-field
                appearance="outline"
                subscriptSizing="dynamic"
                [class.bad]="hasIssue('height')"
              >
                <mat-label>Height</mat-label>
                <input
                  matInput
                  type="number"
                  [value]="fmt(s.height)"
                  (change)="onTransform(s, 'height', $event)"
                />
              </mat-form-field>
            </div>
          }

          @if (s.def.properties.length > 0) {
            <div class="section-title sub">Properties</div>
            @for (prop of s.def.properties; track prop.key) {
              <div class="field">
                @switch (prop.type) {
                  @case ("boolean") {
                    <mat-checkbox
                      [checked]="boolVal(s.inst, prop.key)"
                      (change)="onBool(s.inst, prop, $event.checked)"
                    >
                      {{ prop.label }}
                    </mat-checkbox>
                  }
                  @case ("enum") {
                    <mat-form-field
                      appearance="outline"
                      subscriptSizing="dynamic"
                      [class.bad]="hasIssue(prop.key)"
                    >
                      <mat-label>{{ prop.label }}</mat-label>
                      <mat-select
                        [value]="str(s.inst, prop.key)"
                        (selectionChange)="onEnum(s.inst, prop, $event.value)"
                      >
                        @for (opt of prop.options; track opt) {
                          <mat-option [value]="opt">{{ opt }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  }
                  @default {
                    <mat-form-field
                      appearance="outline"
                      subscriptSizing="dynamic"
                      [class.bad]="hasIssue(prop.key)"
                    >
                      <mat-label>{{ prop.label }}</mat-label>
                      <input
                        matInput
                        [type]="prop.type === 'number' ? 'number' : 'text'"
                        [value]="str(s.inst, prop.key)"
                        (change)="onProp(s.inst, prop, $event)"
                      />
                    </mat-form-field>
                  }
                }
                @if (issueFor(prop.key); as issue) {
                  <div class="err">{{ issue.message }}</div>
                } @else if (prop.help) {
                  <div class="help">{{ prop.help }}</div>
                }
              </div>
            }
          }

          <div class="actions">
            <button matButton (click)="service.duplicateSelection()">Duplicate</button>
            <button matButton class="danger" (click)="service.deleteSelection()">Delete</button>
          </div>
        } @else if (multi() > 1) {
          <div class="empty">{{ multi() }} objects selected.</div>
          <div class="actions">
            <button matButton (click)="service.duplicateSelection()">Duplicate</button>
            <button matButton class="danger" (click)="service.deleteSelection()">Delete</button>
          </div>
        } @else {
          <div class="empty">Select an object to edit its properties.</div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #12161f;
        border-left: 1px solid #2a3140;
      }
      .section-title {
        text-transform: uppercase;
        letter-spacing: 0.6px;
        font-size: 10.5px;
        font-weight: 600;
        color: #6b7488;
        padding: 9px 12px 6px;
      }
      .section-title.sub {
        border-top: 1px solid #232a38;
        margin-top: 4px;
      }
      .scroll {
        overflow-y: auto;
        min-height: 0;
        flex: 1;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px 2px;
        font-weight: 600;
      }
      .id {
        font-family: var(--mmx-mono);
        font-size: 10px;
        color: #6b7488;
        padding: 0 12px 6px;
        word-break: break-all;
      }
      .swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
      }
      .row2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        padding: 2px 12px;
      }
      .field {
        padding: 2px 12px;
      }
      mat-form-field {
        width: 100%;
        font-size: 12px;
      }
      .err {
        color: #ff9d9d;
        font-size: 10.5px;
        margin: 2px 0 4px;
      }
      .err.block {
        padding: 4px 12px;
      }
      .help {
        color: #6b7488;
        font-size: 10px;
        margin: 2px 0 4px;
      }
      .empty {
        padding: 24px 14px;
        color: #6b7488;
        font-size: 12px;
        text-align: center;
      }
      .actions {
        display: flex;
        gap: 8px;
        padding: 12px;
      }
      .actions button {
        flex: 1;
      }
      .actions .danger {
        color: #ff9d9d;
      }
      mat-checkbox {
        font-size: 12px;
      }
    `,
  ],
})
export class InspectorComponent {
  readonly service = inject(EditorService);

  readonly single = computed<Single | null>(() => {
    const s = this.service.state();
    if (s.selectedIds.length !== 1) return null;
    const inst = s.document.objects.find((o) => o.id === s.selectedIds[0]);
    if (!inst) return null;
    const def = requireDefinition(inst.definitionId);
    const size = instanceSize(inst);
    return { inst, def, width: size.width, height: size.height };
  });

  readonly multi = computed(() => this.service.state().selectedIds.length);

  private readonly issues = computed<ValidationIssue[]>(() => {
    const one = this.single();
    if (!one) return [];
    return this.service.validation().issues.filter((i) => i.objectId === one.inst.id);
  });

  readonly objectIssues = computed(() => this.issues().filter((i) => !i.field));

  hasIssue(field: string): boolean {
    return this.issues().some((i) => i.field === field);
  }
  issueFor(field: string): ValidationIssue | undefined {
    return this.issues().find((i) => i.field === field);
  }

  fmt(value: number): string {
    return String(value);
  }
  str(inst: LevelObjectInstance, key: string): string {
    const v = effectiveValue(inst, key);
    return v === undefined || v === null ? "" : String(v);
  }
  boolVal(inst: LevelObjectInstance, key: string): boolean {
    return effectiveValue(inst, key) === true;
  }

  onTransform(s: Single, key: "x" | "y" | "width" | "height", event: Event): void {
    const next = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(next)) return;
    const before = key === "x" ? s.inst.x : key === "y" ? s.inst.y : s[key];
    if (next === before) return;
    this.service.store.execute(setTransform(s.inst.id, { [key]: before }, { [key]: next }));
  }

  onProp(inst: LevelObjectInstance, prop: PropertyMeta, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const next = prop.type === "number" ? Number(raw) : raw;
    if (prop.type === "number" && !Number.isFinite(next as number)) return;
    this.service.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key), next),
    );
  }

  onBool(inst: LevelObjectInstance, prop: PropertyMeta, checked: boolean): void {
    this.service.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key) === true, checked),
    );
  }

  onEnum(inst: LevelObjectInstance, prop: PropertyMeta, value: string): void {
    this.service.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key), value),
    );
  }
}
