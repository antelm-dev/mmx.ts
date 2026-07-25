import { useEffect, useMemo, type ReactElement } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type { ValidationIssue } from "@mmx/content-schema";
import type { DockviewPanelApi } from "dockview-react";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { cx, panel, scroll } from "../ui.js";

const dot = "inline-block w-2 h-2 rounded-full flex-none";

/** Extra per-column classes for the Problems table cells. */
const cellCls = (id: string): string =>
  id === "msg"
    ? "w-full"
    : id === "code"
      ? "text-muted font-mono text-[10px] whitespace-nowrap"
      : "";

const column = createColumnHelper<ValidationIssue>();
const problemColumns: ColumnDef<ValidationIssue, string>[] = [
  column.display({
    id: "dot",
    cell: (ctx) => (
      <span
        className={cx(dot, ctx.row.original.severity === "error" ? "bg-danger" : "bg-warning")}
      />
    ),
  }) as ColumnDef<ValidationIssue, string>,
  column.accessor("message", { id: "msg", cell: (c) => c.getValue() }),
  column.accessor("code", { id: "code", cell: (c) => c.getValue() }),
];

/** Movable dock panel: the live validation Problems table. Tab title tracks the issue count. */
export function ProblemsPanel({ api }: { api?: DockviewPanelApi }): ReactElement {
  const snap = useEditorSnapshot();
  const validation = snap.validation;

  const problemsTitle = useMemo(() => {
    if (validation.errorCount + validation.warningCount === 0) return "Problems";
    const e = `${validation.errorCount} error${validation.errorCount === 1 ? "" : "s"}`;
    const w = `${validation.warningCount} warning${validation.warningCount === 1 ? "" : "s"}`;
    return `Problems — ${e}, ${w}`;
  }, [validation]);

  useEffect(() => api?.setTitle(problemsTitle), [api, problemsTitle]);

  const table = useReactTable({
    data: validation.issues,
    columns: problemColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={panel}>
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
                    <td
                      key={cell.id}
                      className={cx("py-[5px] px-3 align-baseline", cellCls(cell.column.id))}
                    >
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
  );
}
