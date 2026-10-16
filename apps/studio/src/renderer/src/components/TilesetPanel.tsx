import { useEffect, useState } from "react";
import { chakra } from "@chakra-ui/react";
import { LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { DECORATION_LAYERS, type DecorationLayer, type TileLayer } from "@mmx/content-schema";
import type { TilesetAsset } from "@mmx/project-schema";
import { openTilesetDocument } from "../app/dock.js";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import {
  addTileLayer,
  removeTileLayer,
  tileLayerWritesCollision,
  updateTileLayer,
} from "../core/actions.js";
import { tileGrid } from "../core/EditorViewportGeometry.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { TilePalette } from "./TilePalette.js";
import { PaintModes, useTilesetImage } from "./TilesetDocument.js";

const Grid2 = chakra("div", {
  base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2" },
});
const Hint = chakra("div", {
  base: { fontSize: "10.5px", lineHeight: "1.5", color: "studio.fgTertiary" },
});

/** Layers panel footer: add a tile layer painted from one of the project's tilesets, or import one. */
export function AddTileLayer({ onAdd }: { onAdd: () => void }) {
  const { tilesets } = useEditorSnapshot().state;
  const ids = Object.keys(tilesets);
  const [picked, setPicked] = useState<string>();
  const addFrom = picked && tilesets[picked] ? picked : ids[0];
  return (
    <>
      {addFrom && (
        <chakra.div display="flex" alignItems="center" gap="1.5">
          <FieldSelect
            aria-label="Tileset"
            value={addFrom}
            onChange={(e) => setPicked(e.target.value)}
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </FieldSelect>
          <ToolbarButton
            flex="none"
            onClick={() => {
              addTileLayer(editor.store, addFrom);
              onAdd();
            }}
          >
            <Plus size={14} /> Add tile layer
          </ToolbarButton>
        </chakra.div>
      )}
      <ToolbarButton
        onClick={() => {
          onAdd();
          void editor.importImageLayer("tileset");
        }}
      >
        <LayoutGrid size={14} /> Import tileset…
      </ToolbarButton>
    </>
  );
}

/**
 * The paint layer's tile pick and paint modes, so painting needs no tab switch; collision is
 * edited in the tileset document.
 */
function TilePicker({ tileset, layerId }: { tileset: TilesetAsset; layerId: string }) {
  const { tile } = useEditorSnapshot().state.tilePaint;
  const image = useTilesetImage(tileset);
  const grid = image ? tileGrid(tileset, image) : undefined;
  const count = grid ? grid.columns * grid.rows : 0;
  // A larger tile size leaves fewer tiles: keep the pick on the sheet.
  useEffect(() => {
    if (count > 0 && tile >= count) editor.store.setTilePaint({ tile: count - 1 });
  }, [count, tile]);
  return (
    <chakra.div display="flex" flexDirection="column" gap="1.5" data-testid="tile-picker">
      {image && (
        <TilePalette
          tileset={tileset}
          image={image}
          selected={[tile]}
          onPick={(picked) => editor.store.setTilePaint({ tile: picked, layerId })}
        />
      )}
      <PaintModes layerId={layerId} />
    </chakra.div>
  );
}

/** The selected tile layer: tile picker and paint modes, tileset editor, draw layer, parallax, removal. */
export function TileLayerDetails({ layer }: { layer: TileLayer }) {
  const tileset = useEditorSnapshot().state.tilesets[layer.tilesetId];
  return (
    <chakra.div display="flex" flexDirection="column" gap="2">
      {tileset && <TilePicker tileset={tileset} layerId={layer.id} />}
      <Grid2>
        <Field label="Layer">
          <FieldSelect
            value={layer.layer}
            onChange={(e) =>
              updateTileLayer(editor.store, layer.id, { layer: e.target.value as DecorationLayer })
            }
          >
            {DECORATION_LAYERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </FieldSelect>
        </Field>
        <Field label="Parallax">
          <FieldInput
            type="number"
            step={0.1}
            min={0}
            defaultValue={layer.parallax}
            key={`parallax-${layer.parallax}`}
            onBlur={(e) => {
              const value = Number(e.target.value);
              if (e.target.value.trim() !== "" && Number.isFinite(value) && value >= 0) {
                updateTileLayer(editor.store, layer.id, { parallax: value });
              }
            }}
          />
        </Field>
      </Grid2>
      <Hint>
        {tileLayerWritesCollision(layer)
          ? "World layer: painting also writes each tile's collision."
          : "Decor only: painting leaves collision alone."}
      </Hint>
      <chakra.div display="flex" gap="1">
        <ToolbarButton onClick={() => openTilesetDocument(layer.tilesetId)}>
          <Pencil size={14} /> Edit tileset
        </ToolbarButton>
        <ToolbarButton onClick={() => removeTileLayer(editor.store, layer.id)}>
          <Trash2 size={14} /> Remove layer
        </ToolbarButton>
      </chakra.div>
    </chakra.div>
  );
}
