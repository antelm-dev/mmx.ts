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
import { cx, scroll } from "../ui.js";

interface Kv {
  k: string;
  v: string;
}

const sectionTitle =
  "uppercase tracking-[0.6px] text-[10.5px] font-semibold text-fg-3 pt-2.5 px-3 pb-[7px] " +
  "border-b border-[#2d3748]/50";
const sectionIcon = "mr-[5px] text-[#7792bc] text-[11px]";
const dot = "inline-block w-2 h-2 rounded-full flex-none";

/** Extra per-column classes for the Problems table cells. */
const cellCls = (id: string): string =>
  id === "msg" ? "w-full" : id === "code" ? "text-muted font-mono text-[10px] whitespace-nowrap" : "";

const column = createColumnHelper<ValidationIssue>();
const problemColumns: ColumnDef<ValidationIssue, string>[] = [
  column.display({
    id: "dot",
    cell: (ctx) => (
      <span className={cx(dot, ctx.row.original.severity === "error" ? "bg-danger" : "bg-warning")} />
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
    <div className="flex h-full bg-surface">
      <div className="flex-1 flex flex-col min-w-0 border-r border-border last:border-r-0">
        <div className={sectionTitle}>
          <span className={sectionIcon}>▦</span> Assets
        </div>
        <div className="flex items-center justify-center flex-col gap-[7px] h-full text-fg-3 text-[11.5px] text-center p-3">
          <span className="text-[#55647b]" style={{ fontSize: 22 }}>
            ▧
          </span>
          <span>Asset browser coming soon</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 border-r border-border last:border-r-0">
        <div className={sectionTitle}>
          <span className={sectionIcon}>✓</span> {problemsTitle}
        </div>
        <div className={scroll}>
          {validation.issues.length === 0 ? (
            <div className="px-3 py-3.5 text-xs text-[#7f91aa]">
              <span className={cx(dot, "bg-success mr-[7px]")} /> No problems detected. Ready to play.
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-popover-hover"
                    onClick={() => row.original.objectId && editor.focusObject(row.original.objectId)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cx("py-[5px] px-3 align-baseline", cellCls(cell.column.id))}>
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

      <div className="flex-1 flex flex-col min-w-0 border-r border-border last:border-r-0">
        <div className={sectionTitle}>
          <span className={sectionIcon}>◇</span> Selection
        </div>
        <div className={scroll}>
          {selection.map((row) => (
            <div className="py-1 px-3 text-xs flex justify-between gap-2.5" key={row.k}>
              <span className="text-muted">{row.k}</span>
              <span className="font-mono text-[#e6ebf5] text-right break-all">{row.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
