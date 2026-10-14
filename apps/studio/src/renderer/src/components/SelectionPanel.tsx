import { useMemo, type ReactElement } from "react";
import { chakra } from "@chakra-ui/react";
import { instanceSize, definitionFor, TerrainTile } from "@mmx/content-schema";
import { useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { selectedObjectIds, selectionSize } from "../core/EditorStore.js";
import { Panel, PanelScroll } from "../ui/editor/panel.js";

interface Kv {
  k: string;
  v: string;
}

function tileKindLabel(value: TerrainTile): string {
  switch (value) {
    case TerrainTile.Solid:
      return "Solid";
    case TerrainTile.SlopeUpRight:
      return "Slope /";
    case TerrainTile.SlopeUpLeft:
      return "Slope \\";
    case TerrainTile.OneWay:
      return "One-way";
    default:
      return "Empty";
  }
}

/** Movable dock panel: details for the current selection (or level summary when empty). */
export function SelectionPanel(): ReactElement {
  const snap = useEditorSnapshot();
  const objects = useProjectSession().project?.manifest.objects;

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
    const def = definitionFor(inst.definitionId);
    const { width, height } = instanceSize(inst);
    const rows: Kv[] = [
      { k: "Type", v: def.name },
      { k: "Definition", v: inst.definitionId },
      { k: "Position", v: `${inst.x}, ${inst.y}` },
    ];
    if (def.editor.resizable) rows.push({ k: "Size", v: `${width} × ${height}` });
    rows.push({ k: "ID", v: inst.id });
    return rows;
    // `objects` changes whenever the project's definitions (read by the lookups) do.
  }, [snap.state, objects]);

  return (
    <Panel>
      <PanelScroll>
        {selection.map((row) => (
          <chakra.div
            py="1"
            px="3"
            textStyle="xs"
            display="flex"
            justifyContent="space-between"
            gap="2.5"
            key={row.k}
          >
            <chakra.span color="studio.muted">{row.k}</chakra.span>
            <chakra.span
              fontFamily="mono"
              color="studio.fg"
              textAlign="right"
              wordBreak="break-all"
            >
              {row.v}
            </chakra.span>
          </chakra.div>
        ))}
      </PanelScroll>
    </Panel>
  );
}
