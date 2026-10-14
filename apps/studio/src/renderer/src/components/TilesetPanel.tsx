import { useEffect, useState } from "react";
import { chakra } from "@chakra-ui/react";
import {
  ArrowDown,
  ArrowUp,
  Eraser,
  LayoutGrid,
  PaintBucket,
  Paintbrush,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { DECORATION_LAYERS, TerrainTile, type DecorationLayer, type TileLayer } from "@mmx/content-schema";
import type { TilesetAsset } from "@mmx/project-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import {
  addTileLayer,
  removeTileLayer,
  reorderTileLayer,
  tileLayerWritesCollision,
  updateTileLayer,
} from "../core/actions.js";
import type { TilePaintMode } from "../core/EditorStore.js";
import { projectSession } from "../core/projectSession.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { tileGrid } from "../core/EditorViewportGeometry.js";
import { TilePalette } from "./TilePalette.js";

const Grid2 = chakra("div", {
  base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2" },
});
const Hint = chakra("div", { base: { fontSize: "10.5px", lineHeight: "1.5", color: "studio.fgTertiary" } });

const COLLISIONS: { kind: TerrainTile; label: string }[] = [
  { kind: TerrainTile.Empty, label: "Empty" },
  { kind: TerrainTile.Solid, label: "Solid" },
  { kind: TerrainTile.OneWay, label: "One-way" },
  { kind: TerrainTile.SlopeUpRight, label: "Slope /" },
  { kind: TerrainTile.SlopeUpLeft, label: "Slope \\" },
];

const MODES: { mode: TilePaintMode; label: string; icon: typeof Paintbrush }[] = [
  { mode: "brush", label: "Brush", icon: Paintbrush },
  { mode: "rect", label: "Rectangle", icon: Square },
  { mode: "fill", label: "Fill", icon: PaintBucket },
  { mode: "erase", label: "Erase", icon: Eraser },
];

/** Room panel section: the level's tile layers, adding them from a tileset, and the tileset palette. */
export function TileLayersSection() {
  const snap = useEditorSnapshot();
  const { document: doc, tilesets, tilePaint } = snap.state;
  const ids = Object.keys(tilesets);
  const [picked, setPicked] = useState<string>();
  const addFrom = picked && tilesets[picked] ? picked : ids[0];
  return (
    <>
      <SectionTitle divider>Tile layers</SectionTitle>
      <chakra.div display="flex" flexDirection="column" gap="2" px="3.5" py="3px" data-testid="tile-layers">
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
            <FieldSelect aria-label="Tileset" value={addFrom} onChange={(e) => setPicked(e.target.value)}>
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
      <TilesetPanel />
    </>
  );
}

/** One tile layer: tileset, paint target, draw layer, parallax, list order and removal. */
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
        <chakra.span minW="0" flex="1" truncate fontFamily="mono" fontSize="11px" color="studio.fg" title={layer.tilesetId}>
          {layer.tilesetId}
        </chakra.span>
        <ToolbarButton
          icon
          active={painting}
          aria-label="Paint this layer"
          onClick={() => editor.store.setTilePaint({ layerId: layer.id })}
        >
          <Paintbrush size={14} />
        </ToolbarButton>
        <ToolbarButton icon aria-label="Move tile layer back" disabled={first} onClick={() => reorderTileLayer(editor.store, layer.id, -1)}>
          <ArrowUp size={14} />
        </ToolbarButton>
        <ToolbarButton icon aria-label="Move tile layer forward" disabled={last} onClick={() => reorderTileLayer(editor.store, layer.id, 1)}>
          <ArrowDown size={14} />
        </ToolbarButton>
        <ToolbarButton icon aria-label="Remove tile layer" onClick={() => removeTileLayer(editor.store, layer.id)}>
          <Trash2 size={14} />
        </ToolbarButton>
      </chakra.div>
      <Grid2>
        <Field label="Layer">
          <FieldSelect
            value={layer.layer}
            onChange={(e) => updateTileLayer(editor.store, layer.id, { layer: e.target.value as DecorationLayer })}
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

/** Loads a tileset's image URL and pixel size from the open project's assets. */
function useTilesetImage(tileset: TilesetAsset | undefined) {
  const [image, setImage] = useState<{ url: string; w: number; h: number } | null>(null);
  const key = tileset ? `${tileset.id}|${tileset.path}` : "";
  useEffect(() => {
    setImage(null);
    if (!tileset) return;
    let live = true;
    void projectSession
      .getAssets()
      .then((assets) => {
        const url = assets?.resolveUrl(tileset);
        if (!url || !live) return;
        const img = new Image();
        img.onload = () => {
          if (live) setImage({ url, w: img.naturalWidth, h: img.naturalHeight });
        };
        img.src = url;
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Keyed on the file, not the asset object, which changes with every collision edit.
  }, [key]);
  return image;
}

/** The paint layer's tileset: tile size, per-tile collision, tile pick and paint tools. */
export function TilesetPanel() {
  const snap = useEditorSnapshot();
  const { document: doc, tilesets, tilePaint, activeTool } = snap.state;
  const layer = doc.tileLayers?.find((l) => l.id === tilePaint.layerId);
  const tileset = layer ? tilesets[layer.tilesetId] : undefined;
  const image = useTilesetImage(tileset);
  const [selected, setSelected] = useState<number[]>([tilePaint.tile]);
  const [profile, setProfile] = useState({ l: "", r: "" });

  if (!tileset) {
    return (
      <>
        <SectionTitle divider>Tileset</SectionTitle>
        <Hint px="3.5" py="3px">
          Import a tileset or pick a tile layer to paint (brush icon).
        </Hint>
      </>
    );
  }

  const grid = image ? tileGrid(tileset, image) : null;
  const count = grid ? grid.columns * grid.rows : 0;
  const ts = tileset.tileSize;

  const save = (collision: TilesetAsset["collision"], slopes: NonNullable<TilesetAsset["slopes"]>) => {
    const next: TilesetAsset = { ...tileset, collision, slopes };
    if (Object.keys(slopes).length === 0) delete next.slopes;
    projectSession.updateAsset(next);
  };

  const assign = (kind: TerrainTile, tiles: readonly number[]) => {
    const collision = { ...tileset.collision };
    const slopes = { ...tileset.slopes };
    const l = Math.round(Number(profile.l));
    const r = Math.round(Number(profile.r));
    const withProfile =
      (kind === TerrainTile.SlopeUpRight || kind === TerrainTile.SlopeUpLeft) &&
      profile.l.trim() !== "" &&
      profile.r.trim() !== "" &&
      [l, r].every((v) => v >= 0 && v <= ts);
    for (const tile of tiles) {
      if (kind === TerrainTile.Empty) delete collision[tile];
      else collision[tile] = kind;
      if (withProfile) slopes[tile] = [l, r];
      else delete slopes[tile];
    }
    save(collision, slopes);
  };

  const pick = (tile: number, additive: boolean) => {
    setSelected((prev) =>
      !additive ? [tile] : prev.includes(tile) ? prev.filter((t) => t !== tile) : [...prev, tile],
    );
    editor.store.setTilePaint({ tile });
  };

  return (
    <>
      <SectionTitle divider>Tileset</SectionTitle>
      <chakra.div display="flex" flexDirection="column" gap="2" px="3.5" py="3px" data-testid="tileset">
        <Field label="Tile size (px)">
          <FieldInput
            type="number"
            min={1}
            defaultValue={ts}
            key={`tile-size-${tileset.id}-${ts}`}
            onBlur={(e) => {
              const value = Math.round(Number(e.target.value));
              if (Number.isFinite(value) && value > 0 && value !== ts) {
                // Collision is keyed by tile index, which a new tile size renumbers.
                const { slopes: _dropped, ...rest } = tileset;
                projectSession.updateAsset({ ...rest, tileSize: value, collision: {} });
              }
            }}
          />
        </Field>
        <Hint>Changing the tile size clears the tiles' collision.</Hint>
        {ts !== doc.gridSize && (
          <Hint color="studio.warning">
            Tile size differs from the grid ({doc.gridSize} px): art and collision will not line up.
          </Hint>
        )}

        {image && <TilePalette tileset={tileset} image={image} selected={selected} onPick={pick} />}
        <Hint>Click a tile to paint with it; Shift-click selects several to set their collision.</Hint>

        <chakra.div display="flex" flexWrap="wrap" gap="1">
          {MODES.map(({ mode, label, icon: Icon }) => (
            <ToolbarButton
              key={mode}
              active={activeTool === "tilePaint" && tilePaint.mode === mode}
              onClick={() => {
                editor.store.setTilePaint({ mode });
                editor.store.setTool("tilePaint");
              }}
            >
              <Icon size={14} /> {label}
            </ToolbarButton>
          ))}
        </chakra.div>

        <chakra.div display="flex" flexWrap="wrap" gap="1" role="group" aria-label="Tile collision">
          {COLLISIONS.map(({ kind, label }) => (
            <ToolbarButton key={kind} onClick={() => assign(kind, selected.filter((t) => t < count))}>
              {label}
            </ToolbarButton>
          ))}
          <ToolbarButton
            onClick={() => assign(TerrainTile.Solid, Array.from({ length: count }, (_, i) => i))}
          >
            All solid
          </ToolbarButton>
        </chakra.div>
        <Grid2>
          <Field label="Slope left (px)">
            <FieldInput
              type="number"
              min={0}
              max={ts}
              placeholder="45°"
              value={profile.l}
              onChange={(e) => setProfile({ ...profile, l: e.target.value })}
            />
          </Field>
          <Field label="Slope right (px)">
            <FieldInput
              type="number"
              min={0}
              max={ts}
              placeholder="45°"
              value={profile.r}
              onChange={(e) => setProfile({ ...profile, r: e.target.value })}
            />
          </Field>
        </Grid2>
      </chakra.div>
    </>
  );
}
