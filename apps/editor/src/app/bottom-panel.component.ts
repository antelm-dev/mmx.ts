import { Component, computed, inject } from "@angular/core";
import { instanceSize, requireDefinition } from "@mmx/content-schema";
import { EditorService } from "./editor.service.js";

interface Kv {
  k: string;
  v: string;
}

/** Bottom dock: asset placeholder, validation problems, and selection details. */
@Component({
  selector: "mmx-bottom-panel",
  template: `
    <div class="dock">
      <div class="col">
        <div class="section-title"><span class="section-icon">▦</span> Assets</div>
        <div class="asset-ph">
          <span class="asset-icon">▧</span>
          <span>Asset browser coming soon</span>
        </div>
      </div>

      <div class="col">
        <div class="section-title"><span class="section-icon">✓</span> {{ problemsTitle() }}</div>
        <div class="scroll">
          @for (issue of validation().issues; track $index) {
            <div
              class="problem"
              [class.error]="issue.severity === 'error'"
              (click)="focus(issue.objectId)"
            >
              <span class="dot" [class.error]="issue.severity === 'error'"></span>
              <span class="msg">{{ issue.message }}</span>
              <span class="code">{{ issue.code }}</span>
            </div>
          }
          @if (validation().issues.length === 0) {
            <div class="empty good"><span>●</span> No problems detected. Ready to play.</div>
          }
        </div>
      </div>

      <div class="col">
        <div class="section-title"><span class="section-icon">◇</span> Selection</div>
        <div class="scroll">
          @for (row of selection(); track row.k) {
            <div class="kv">
              <span class="k">{{ row.k }}</span
              ><span class="v">{{ row.v }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .dock {
        display: flex;
        height: 100%;
        background: var(--mmx-surface);
      }
      .col {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        border-right: 1px solid var(--mmx-border);
      }
      .col:last-child {
        border-right: none;
      }
      .section-title {
        text-transform: uppercase;
        letter-spacing: 0.6px;
        font-size: 10.5px;
        font-weight: 600;
        color: var(--mmx-text-3);
        padding: 10px 12px 7px;
        border-bottom: 1px solid rgba(45, 55, 72, 0.5);
      }
      .section-icon {
        margin-right: 5px;
        color: #7792bc;
        font-size: 11px;
      }
      .scroll {
        overflow-y: auto;
        min-height: 0;
        flex: 1;
      }
      .asset-ph {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 7px;
        height: 100%;
        color: var(--mmx-text-3);
        font-size: 11.5px;
        text-align: center;
        padding: 12px;
      }
      .asset-icon {
        color: #55647b;
        font-size: 22px;
      }
      .problem {
        display: flex;
        gap: 8px;
        padding: 5px 12px;
        font-size: 12px;
        cursor: pointer;
        align-items: baseline;
      }
      .problem:hover {
        background: #181d29;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex: none;
        margin-top: 4px;
        background: #eab308;
      }
      .dot.error {
        background: #ef4444;
      }
      .msg {
        flex: 1;
      }
      .code {
        color: #6b7488;
        font-family: var(--mmx-mono);
        font-size: 10px;
      }
      .empty {
        padding: 14px 12px;
        color: var(--mmx-text-3);
        font-size: 12px;
      }
      .empty.good {
        color: #7f91aa;
      }
      .empty.good span {
        margin-right: 7px;
        color: #34d399;
        font-size: 8px;
      }
      .kv {
        padding: 4px 12px;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }
      .k {
        color: #6b7488;
      }
      .v {
        font-family: var(--mmx-mono);
        color: #e6ebf5;
        text-align: right;
        word-break: break-all;
      }
    `,
  ],
})
export class BottomPanelComponent {
  readonly service = inject(EditorService);
  readonly validation = this.service.validation;

  readonly problemsTitle = computed(() => {
    const r = this.validation();
    if (r.errorCount + r.warningCount === 0) return "Problems";
    const e = `${r.errorCount} error${r.errorCount === 1 ? "" : "s"}`;
    const w = `${r.warningCount} warning${r.warningCount === 1 ? "" : "s"}`;
    return `Problems — ${e}, ${w}`;
  });

  readonly selection = computed<Kv[]>(() => {
    const s = this.service.state();
    const doc = s.document;
    if (s.selectedIds.length === 0) {
      return [
        { k: "Level", v: doc.name },
        { k: "Grid", v: `${doc.gridSize}px — ${doc.cols}×${doc.rows} tiles` },
        { k: "Objects", v: String(doc.objects.length) },
        { k: "Mode", v: s.mode },
      ];
    }
    if (s.selectedIds.length > 1) return [{ k: "Selected", v: `${s.selectedIds.length} objects` }];

    const inst = doc.objects.find((o) => o.id === s.selectedIds[0]);
    if (!inst) return [];
    const def = requireDefinition(inst.definitionId);
    const { width, height } = instanceSize(inst);
    const rows: Kv[] = [
      { k: "Type", v: def.name },
      { k: "Definition", v: inst.definitionId },
      { k: "Position", v: `${inst.x}, ${inst.y}` },
    ];
    if (def.editor.resizable) rows.push({ k: "Size", v: `${width} × ${height}` });
    rows.push({ k: "ID", v: inst.id });
    return rows;
  });

  focus(objectId: string | undefined): void {
    if (objectId) this.service.focusObject(objectId);
  }
}
