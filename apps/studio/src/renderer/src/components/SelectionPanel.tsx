import { useMemo, type ReactElement } from "react";
import { instanceSize, requireDefinition } from "@mmx/content-schema";
import { useEditorSnapshot } from "../app/useEditor.js";
import { panel, scroll } from "../ui.js";

interface Kv {
  k: string;
  v: string;
}

/** Movable dock panel: details for the current selection (or level summary when empty). */
export function SelectionPanel(): ReactElement {
  const snap = useEditorSnapshot();

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
    <div className={panel}>
      <div className={scroll}>
        {selection.map((row) => (
          <div className="py-1 px-3 text-xs flex justify-between gap-2.5" key={row.k}>
            <span className="text-muted">{row.k}</span>
            <span className="font-mono text-[#e6ebf5] text-right break-all">{row.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
