import { useEffect, useMemo, type ReactElement } from "react";
import { chakra } from "@chakra-ui/react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type { ValidationIssue } from "@mmx/content-schema";
import type { ProjectIssue } from "@mmx/project-io";
import type { DockviewPanelApi } from "dockview-react";
import { editor, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { Panel, PanelNote, PanelScroll } from "../ui/editor/panel.js";

const Dot = chakra("span", {
  base: { display: "inline-block", w: "2", h: "2", rounded: "full", flex: "none" },
});

/** Extra per-column styles for the Problems table cells. */
const cellStyle = (id: string) =>
  id === "msg"
    ? { w: "full" }
    : id === "code"
      ? { color: "studio.muted", fontFamily: "mono", fontSize: "10px", whiteSpace: "nowrap" }
      : {};

type ProblemRow = {
  severity: "error" | "warning";
  code: string;
  message: string;
  objectId?: string;
  path?: string;
};

const column = createColumnHelper<ProblemRow>();
const problemColumns: ColumnDef<ProblemRow, string>[] = [
  column.display({
    id: "dot",
    cell: (ctx) => (
      <Dot bg={ctx.row.original.severity === "error" ? "studio.danger" : "studio.warning"} />
    ),
  }) as ColumnDef<ProblemRow, string>,
  column.accessor("message", { id: "msg", cell: (c) => c.getValue() }),
  column.accessor("code", { id: "code", cell: (c) => c.getValue() }),
];

function toProblemRows(
  levelIssues: ValidationIssue[],
  projectIssues: ProjectIssue[],
): ProblemRow[] {
  const projectRows = projectIssues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: `${issue.path}: ${issue.message}`,
    path: issue.path,
  }));
  const levelRows = levelIssues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    objectId: issue.objectId,
  }));
  return [...projectRows, ...levelRows];
}

/** Movable dock panel: the live validation Problems table. Tab title tracks the issue count. */
export function ProblemsPanel({ api }: { api?: DockviewPanelApi }): ReactElement {
  const snap = useEditorSnapshot();
  const project = useProjectSession();
  const validation = snap.validation;
  // A stable `data` reference: TanStack resets the page index (a setState) whenever `data`
  // changes, so a fresh array per render re-renders forever once Problems is non-empty.
  const issues = useMemo(
    () => toProblemRows(validation.issues, project.issues),
    [validation.issues, project.issues],
  );
  const errorCount =
    validation.errorCount + project.issues.filter((issue) => issue.severity === "error").length;
  const warningCount =
    validation.warningCount +
    project.issues.filter((issue) => issue.severity === "warning").length;

  const problemsTitle = useMemo(() => {
    if (errorCount + warningCount === 0) return "Problems";
    const e = `${errorCount} error${errorCount === 1 ? "" : "s"}`;
    const w = `${warningCount} warning${warningCount === 1 ? "" : "s"}`;
    return `Problems — ${e}, ${w}`;
  }, [errorCount, warningCount]);

  useEffect(() => api?.setTitle(problemsTitle), [api, problemsTitle]);

  const table = useReactTable({
    data: issues,
    columns: problemColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Panel>
      <PanelScroll>
        {issues.length === 0 ? (
          <PanelNote color="studio.fgTertiary">
            <Dot bg="studio.success" mr="7px" /> No problems detected. Ready to play.
          </PanelNote>
        ) : (
          <chakra.table w="full" borderCollapse="collapse" textStyle="xs">
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <chakra.tr
                  key={row.id}
                  cursor="pointer"
                  _hover={{ bg: "studio.popoverHover" }}
                  onClick={() => row.original.objectId && editor.focusObject(row.original.objectId)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <chakra.td
                      key={cell.id}
                      py="5px"
                      px="3"
                      verticalAlign="baseline"
                      {...cellStyle(cell.column.id)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </chakra.td>
                  ))}
                </chakra.tr>
              ))}
            </tbody>
          </chakra.table>
        )}
      </PanelScroll>
    </Panel>
  );
}
