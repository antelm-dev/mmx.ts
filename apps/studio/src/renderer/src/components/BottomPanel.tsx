import { useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  instanceSize,
  requireDefinition,
  type ValidationIssue,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";

interface Kv {
  k: string;
  v: string;
}

const column = createColumnHelper<ValidationIssue>();
const problemColumns: ColumnDef<ValidationIssue, string>[] = [
  column.display({
    id: "dot",
    cell: (ctx) => (
      <span className={`dot${ctx.row.original.severity === "error" ? " error" : ""}`} />
    ),
  }) as ColumnDef<ValidationIssue, string>,
  column.accessor("message", { id: "msg", cell: (c) => c.getValue() }),
  column.accessor("code", { id: "code", cell: (c) => c.getValue() }),
];

/** Bottom dock: asset placeholder, a validation Problems table, selection details. */
export function BottomPanel() {
  const snap = useEditorSnapshot();
  const validation = snap.validation;

  const problemsTitle = useMemo(() => {
    if (validation.errorCount + validation.warningCount === 0) return "Problems";
    const e = `${validation.errorCount} error${validation.errorCount === 1 ? "" : "s"}`;
    const w = `${validation.warningCount} warning${validation.warningCount === 1 ? "" : "s"}`;
    return `Problems — ${e}, ${w}`;
  }, [validation]);

  const table = useReactTable({
    data: validation.issues,
    columns: problemColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const selection = useMemo<Kv[]>(() => {
    const s = snap.state;
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
  }, [snap.state]);

  return (
    <div className="dock">
      <div className="col">
        <div className="section-title">
          <span className="section-icon">▦</span> Assets
        </div>
        <div className="asset-ph">
          <span className="asset-icon" style={{ fontSize: 22 }}>
            ▧
          </span>
          <span>Asset browser coming soon</span>
        </div>
      </div>

      <div className="col">
        <div className="section-title">
          <span className="section-icon">✓</span> {problemsTitle}
        </div>
        <div className="scroll">
          {validation.issues.length === 0 ? (
            <div className="empty good">
              <span className="dot" /> No problems detected. Ready to play.
            </div>
          ) : (
            <table className="problems-table">
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} onClick={() => row.original.objectId && editor.focusObject(row.original.objectId)}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cell.column.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="col">
        <div className="section-title">
          <span className="section-icon">◇</span> Selection
        </div>
        <div className="scroll">
          {selection.map((row) => (
            <div className="kv" key={row.k}>
              <span className="k">{row.k}</span>
              <span className="v">{row.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
