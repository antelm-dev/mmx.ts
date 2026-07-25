import { AlertTriangle } from "lucide-react";
import { setLevelSettings, type LevelSettings } from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { cx, fieldLabel, inputCls, panel, scroll, sectionTitle, sectionTitleSub } from "../ui.js";

/** Right dock tab: configure the level ("room") — name, grid pitch and size. */
export function RoomPanel() {
  const snap = useEditorSnapshot();
  const doc = snap.state.document;

  /** Commit a single-field change as one undoable step, ignoring no-ops. */
  const commit = (patch: Partial<LevelSettings>): void => {
    const next: LevelSettings = {
      name: doc.name,
      gridSize: doc.gridSize,
      cols: doc.cols,
      rows: doc.rows,
      ...patch,
    };
    if (next.gridSize < 1 || next.cols < 1 || next.rows < 1) return;
    if (
      next.name === doc.name &&
      next.gridSize === doc.gridSize &&
      next.cols === doc.cols &&
      next.rows === doc.rows
    ) {
      return;
    }
    editor.store.execute(setLevelSettings(doc, next));
  };

  /** Parse an integer field, committing only finite, whole values. */
  const commitInt = (key: "gridSize" | "cols" | "rows", raw: string): void => {
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value)) return;
    commit({ [key]: value });
  };

  const worldW = doc.cols * doc.gridSize;
  const worldH = doc.rows * doc.gridSize;

  return (
    <div className={panel}>
      <div className={scroll}>
        <div className={sectionTitle}>Room</div>
        <div className="py-[3px] px-3.5">
          <span className={fieldLabel}>Name</span>
          <input
            className={inputCls()}
            type="text"
            defaultValue={doc.name}
            key={`name-${doc.name}`}
            onBlur={(e) => commit({ name: e.target.value.trim() || doc.name })}
          />
        </div>

        <div className={cx(sectionTitle, sectionTitleSub)}>Size</div>
        <div className="grid grid-cols-2 gap-2 py-[3px] px-3.5">
          <label className="flex flex-col min-w-0">
            <span className={fieldLabel}>Columns</span>
            <input
              className={inputCls()}
              type="number"
              min={1}
              defaultValue={doc.cols}
              key={`cols-${doc.cols}`}
              onBlur={(e) => commitInt("cols", e.target.value)}
            />
          </label>
          <label className="flex flex-col min-w-0">
            <span className={fieldLabel}>Rows</span>
            <input
              className={inputCls()}
              type="number"
              min={1}
              defaultValue={doc.rows}
              key={`rows-${doc.rows}`}
              onBlur={(e) => commitInt("rows", e.target.value)}
            />
          </label>
        </div>
        <div className="py-[3px] px-3.5">
          <span className={fieldLabel}>Grid size (px)</span>
          <input
            className={inputCls()}
            type="number"
            min={1}
            defaultValue={doc.gridSize}
            key={`grid-${doc.gridSize}`}
            onBlur={(e) => commitInt("gridSize", e.target.value)}
          />
        </div>

        <div className="mx-3.5 mt-2 mb-1 flex justify-between gap-2.5 rounded-lg border border-border bg-raised px-3 py-2 text-xs">
          <span className="text-muted">World size</span>
          <span className="font-mono text-[#e6ebf5]">
            {worldW} × {worldH} px
          </span>
        </div>

        <div className="flex items-start gap-2 px-3.5 py-2 text-[10.5px] leading-[1.5] text-fg-3">
          <AlertTriangle size={13} className="mt-px flex-none text-warning" />
          <span>Shrinking the room crops terrain and slopes outside the new bounds.</span>
        </div>
      </div>
    </div>
  );
}
