import { useEffect, useState } from "react";
import { chakra } from "@chakra-ui/react";
import { Eraser, PaintBucket, Paintbrush, Square } from "lucide-react";
import { TerrainTile } from "@mmx/content-schema";
import type { TilesetAsset } from "@mmx/project-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { updateAsset } from "../core/actions.js";
import type { TilePaintMode } from "../core/EditorStore.js";
import { projectSession } from "../core/projectSession.js";
import { tileGrid } from "../core/EditorViewportGeometry.js";
import { Field, FieldInput } from "../ui/editor/field.js";
import { Panel, PanelNote, PanelScroll } from "../ui/editor/panel.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { TilePalette } from "./TilePalette.js";

const Grid2 = chakra("div", {
  base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2" },
});
const Hint = chakra("div", {
  base: { fontSize: "10.5px", lineHeight: "1.5", color: "studio.fgTertiary" },
});

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

/** Loads a tileset's image URL and pixel size from the open project's assets. */
export function useTilesetImage(tileset: TilesetAsset | undefined) {
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

/** Brush / Rectangle / Fill / Erase: the tile tool painting `layerId`, disabled without one. */
export function PaintModes({ layerId }: { layerId: string | undefined }) {
  const { tilePaint, activeTool } = useEditorSnapshot().state;
  return (
    <chakra.div display="flex" flexWrap="wrap" gap="1">
      {MODES.map(({ mode, label, icon: Icon }) => (
        <ToolbarButton
          key={mode}
          disabled={!layerId}
          active={activeTool === "tilePaint" && tilePaint.mode === mode}
          onClick={() => {
            editor.store.setTilePaint({ mode, layerId });
            editor.store.setTool("tilePaint");
          }}
        >
          <Icon size={14} /> {label}
        </ToolbarButton>
      ))}
    </chakra.div>
  );
}

/**
 * Tileset document tab (C-DOC, opened by `openTilesetDocument`): tile size, per-tile
 * collision and slopes (each edit one undo step in the level history), tile pick and
 * paint tools. `params.assetId` names the `tileset` asset.
 */
export function TilesetDocument({ params }: { params: { assetId?: unknown } }) {
  const snap = useEditorSnapshot();
  const { document: doc, tilesets, tilePaint } = snap.state;
  const assetId = typeof params.assetId === "string" ? params.assetId : "";
  const tileset = tilesets[assetId];
  const image = useTilesetImage(tileset);
  const [selected, setSelected] = useState<number[]>([tilePaint.tile]);
  const [profile, setProfile] = useState({ l: "", r: "" });

  if (!tileset) {
    // Another project was opened, or the asset was removed.
    return (
      <Panel data-testid="tileset-document">
        <PanelNote>Tileset “{assetId}” is not in the open project.</PanelNote>
      </Panel>
    );
  }

  const grid = image ? tileGrid(tileset, image) : null;
  const count = grid ? grid.columns * grid.rows : 0;
  const ts = tileset.tileSize;
  // Paint with this tileset: the paint layer if it uses it, else its first tile layer.
  const paintLayer = doc.tileLayers?.find((l) => l.id === tilePaint.layerId);
  const layerId = (
    paintLayer?.tilesetId === assetId
      ? paintLayer
      : doc.tileLayers?.find((l) => l.tilesetId === assetId)
  )?.id;

  const save = (
    collision: TilesetAsset["collision"],
    slopes: NonNullable<TilesetAsset["slopes"]>,
  ) => {
    const next: TilesetAsset = { ...tileset, collision, slopes };
    if (Object.keys(slopes).length === 0) delete next.slopes;
    updateAsset(editor.store, projectSession, next, "Set tile collision");
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
    editor.store.setTilePaint(layerId ? { tile, layerId } : { tile });
  };

  return (
    <Panel data-testid="tileset-document">
      <PanelScroll>
        <SectionTitle>Tileset</SectionTitle>
        <chakra.div
          display="flex"
          flexDirection="column"
          gap="2"
          px="3.5"
          py="3px"
          maxW="420px"
          data-testid="tileset"
        >
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
                  updateAsset(
                    editor.store,
                    projectSession,
                    { ...rest, tileSize: value, collision: {} },
                    "Set tile size",
                  );
                }
              }}
            />
          </Field>
          <Hint>Changing the tile size clears the tiles' collision.</Hint>
          {ts !== doc.gridSize && (
            <Hint color="studio.warning">
              Tile size differs from the grid ({doc.gridSize} px): art and collision will not line
              up.
            </Hint>
          )}

          {image && (
            <TilePalette tileset={tileset} image={image} selected={selected} onPick={pick} />
          )}
          <Hint>
            Click a tile to paint with it; Shift-click selects several to set their collision.
          </Hint>

          <PaintModes layerId={layerId} />
          {!layerId && <Hint>Add a tile layer with this tileset (Room panel) to paint it.</Hint>}

          <chakra.div
            display="flex"
            flexWrap="wrap"
            gap="1"
            role="group"
            aria-label="Tile collision"
          >
            {COLLISIONS.map(({ kind, label }) => (
              <ToolbarButton
                key={kind}
                onClick={() =>
                  assign(
                    kind,
                    selected.filter((t) => t < count),
                  )
                }
              >
                {label}
              </ToolbarButton>
            ))}
            <ToolbarButton
              onClick={() =>
                assign(
                  TerrainTile.Solid,
                  Array.from({ length: count }, (_, i) => i),
                )
              }
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
      </PanelScroll>
    </Panel>
  );
}
