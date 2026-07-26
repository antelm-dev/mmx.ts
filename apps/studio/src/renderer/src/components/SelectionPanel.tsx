import { useMemo, type ReactElement } from "react";
import { instanceSize, requireDefinition, TerrainTile } from "@mmx/content-schema";
import { useEditorSnapshot } from "../app/useEditor.js";
import { selectedObjectIds, selectionSize } from "../core/EditorStore.js";
import { panel, scroll } from "../ui.js";

interface Kv {
  k: string;
  v: string;
}

function tileKindLabel(value: number): string {
  switch (value) {
    case TerrainTile.Solid:
      return "Solid";
    case TerrainTile.SlopeUpRight:
      return "Slope /";
    case TerrainTile.SlopeUpLeft:
      return "Slope \\";
    default:
      return "Empty";
  }
}

/** Movable dock panel: details for the current selection (or level summary when empty). */
export function SelectionPanel(): ReactElement {
  const snap = useEditorSnapshot();

  const selection = useMemo<Kv[]>(() => {
    const s = snap.state;
    const doc = s.document;
    if (selectionSize(s.selection) === 0) {
      return [
        { k: "Level", v: doc.name },
        { k: "Grid", v: `${doc.gridSize}px — ${doc.cols}×${doc.rows} tiles` },
        { k: "Objects", v: String(doc.objects.length) },
        { k: "Mode", v: s.mode },
      ];
    }
    if (s.selection.kind === "tiles") {
      if (s.selection.indices.length > 1) {
        return [{ k: "Selected", v: `${s.selection.indices.length} tiles` }];
      }
      const index = s.selection.indices[0];
      const col = index % doc.cols;
      const row = Math.floor(index / doc.cols);
      const value = doc.tiles[index] ?? TerrainTile.Empty;
      return [
        { k: "Type", v: `${tileKindLabel(value)} tile` },
        { k: "Cell", v: `${col}, ${row}` },
        { k: "Index", v: String(index) },
      ];
    }
    const objectIds = selectedObjectIds(s.selection);
    if (objectIds.length > 1) return [{ k: "Selected", v: `${objectIds.length} objects` }];
    const inst = doc.objects.find((o) => o.id === objectIds[0]);
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
