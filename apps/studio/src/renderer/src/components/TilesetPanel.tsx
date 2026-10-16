import { useState } from "react";
import { chakra } from "@chakra-ui/react";
import { ArrowDown, ArrowUp, LayoutGrid, Paintbrush, Pencil, Plus, Trash2 } from "lucide-react";
import { DECORATION_LAYERS, type DecorationLayer, type TileLayer } from "@mmx/content-schema";
import { openTilesetDocument } from "../app/dock.js";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import {
  addTileLayer,
  removeTileLayer,
  reorderTileLayer,
  tileLayerWritesCollision,
  updateTileLayer,
} from "../core/actions.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";

const Grid2 = chakra("div", {
  base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2" },
});
const Hint = chakra("div", {
  base: { fontSize: "10.5px", lineHeight: "1.5", color: "studio.fgTertiary" },
});

/** Room panel section: the level's tile layers and adding them from a tileset; each opens its tileset's document. */
export function TileLayersSection() {
  const snap = useEditorSnapshot();
  const { document: doc, tilesets, tilePaint } = snap.state;
  const ids = Object.keys(tilesets);
  const [picked, setPicked] = useState<string>();
  const addFrom = picked && tilesets[picked] ? picked : ids[0];
  return (
    <>
      <SectionTitle divider>Tile layers</SectionTitle>
      <chakra.div
        display="flex"
        flexDirection="column"
        gap="2"
        px="3.5"
        py="3px"
        data-testid="tile-layers"
      >
        {(doc.tileLayers ?? []).map((layer, index, all) => (
          <TileLayerRow
            key={layer.id}
            layer={layer}
            painting={layer.id === tilePaint.layerId}
            first={index === 0}
            last={index === all.length - 1}
          />
        ))}
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
            <ToolbarButton flex="none" onClick={() => addTileLayer(editor.store, addFrom)}>
              <Plus size={14} /> Add tile layer
            </ToolbarButton>
          </chakra.div>
        )}
        <ToolbarButton onClick={() => void editor.importImageLayer("tileset")}>
          <LayoutGrid size={14} /> Import tileset…
        </ToolbarButton>
      </chakra.div>
    </>
  );
}

/** One tile layer: tileset (and its editor), paint target, draw layer, parallax, list order and removal. */
function TileLayerRow({
  layer,
  painting,
  first,
  last,
}: {
  layer: TileLayer;
  painting: boolean;
  first: boolean;
  last: boolean;
}) {
  return (
    <chakra.div
      rounded="lg"
      border="1px solid"
      borderColor={painting ? "studio.accent" : "studio.border"}
      bg="studio.raised"
      p="2"
      data-tile-layer={layer.id}
    >
      <chakra.div mb="1.5" display="flex" alignItems="center" gap="1">
        <chakra.span
          minW="0"
          flex="1"
          truncate
          fontFamily="mono"
          fontSize="11px"
          color="studio.fg"
          title={layer.tilesetId}
        >
          {layer.tilesetId}
        </chakra.span>
        <ToolbarButton
          icon
          aria-label="Edit tileset"
          onClick={() => openTilesetDocument(layer.tilesetId)}
        >
          <Pencil size={14} />
        </ToolbarButton>
        <ToolbarButton
          icon
          active={painting}
          aria-label="Paint this layer"
          onClick={() => editor.store.setTilePaint({ layerId: layer.id })}
        >
          <Paintbrush size={14} />
        </ToolbarButton>
        <ToolbarButton
          icon
          aria-label="Move tile layer back"
          disabled={first}
          onClick={() => reorderTileLayer(editor.store, layer.id, -1)}
        >
          <ArrowUp size={14} />
        </ToolbarButton>
        <ToolbarButton
          icon
          aria-label="Move tile layer forward"
          disabled={last}
          onClick={() => reorderTileLayer(editor.store, layer.id, 1)}
        >
          <ArrowDown size={14} />
        </ToolbarButton>
        <ToolbarButton
          icon
          aria-label="Remove tile layer"
          onClick={() => removeTileLayer(editor.store, layer.id)}
        >
          <Trash2 size={14} />
        </ToolbarButton>
      </chakra.div>
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
      <Hint mt="1.5">
        {tileLayerWritesCollision(layer)
          ? "World layer: painting also writes each tile's collision."
          : "Decor only: painting leaves collision alone."}
      </Hint>
    </chakra.div>
  );
}
