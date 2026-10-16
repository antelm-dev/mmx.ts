import { useState } from "react";
import { chakra } from "@chakra-ui/react";
import {
  ArrowDown,
  ArrowUp,
  BrickWall,
  Eye,
  EyeOff,
  Flower2,
  Image,
  ImagePlus,
  LayoutGrid,
  Lock,
  Shapes,
  Trash2,
  Unlock,
  Video,
  type LucideIcon,
} from "lucide-react";
import { DECORATION_LAYERS, type DecorationLayer, type ImageLayer } from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import {
  removeImageLayer,
  reorderImageLayer,
  reorderTarget,
  reorderTileLayer,
  updateImageLayer,
} from "../core/actions.js";
import { isLayerLocked, isLayerVisible, type LayerKey } from "../core/EditorStore.js";
import { layerStack, type LayerRow } from "../core/layers.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { Panel, PanelScroll } from "../ui/editor/panel.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { AddTileLayer, TileLayerDetails } from "./TilesetPanel.js";

const LayerButton = chakra("button", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
    w: "6",
    h: "6",
    rounded: "md",
    color: "studio.fgTertiary",
    cursor: "pointer",
    _hover: { color: "studio.fg", bg: "studio.hover" },
    _disabled: { opacity: 0.3, cursor: "default", _hover: { bg: "transparent" } },
  },
});
const Grid2 = chakra("div", {
  base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2" },
});
const Details = chakra("div", {
  base: {
    mx: "2",
    mb: "1",
    p: "2",
    rounded: "lg",
    border: "1px solid",
    borderColor: "studio.border",
    bg: "studio.raised",
  },
});

const ICONS: Record<LayerRow["kind"], LucideIcon> = {
  objects: Shapes,
  cameras: Video,
  collision: BrickWall,
  decorations: Flower2,
  tile: LayoutGrid,
  image: Image,
};

function rowLabel(row: LayerRow): string {
  switch (row.kind) {
    case "objects":
      return "Instances";
    case "cameras":
      return "Cameras";
    case "collision":
      return "Collision";
    case "decorations":
      return `Decorations: ${row.key}`;
    case "tile":
      return row.layer.tilesetId;
    case "image":
      return row.layer.assetId;
  }
}

/**
 * Left dock view: every layer the level view draws, front first, each with a visibility and a
 * lock toggle (editor state, never saved). Tile and image layers move within their draw layer;
 * the selected one shows its settings below it, and a selected tile layer is the paint target.
 */
export function LayersPanel() {
  const snap = useEditorSnapshot();
  const { state } = snap;
  const [selected, setSelected] = useState<LayerKey>();
  const paintKey: LayerKey | undefined = state.tilePaint.layerId
    ? `tile:${state.tilePaint.layerId}`
    : undefined;
  // Until a row is picked, the paint layer is the selection (a new tile layer shows its picker).
  const current = selected ?? paintKey;
  const select = (row: LayerRow): void => {
    setSelected(row.key);
    if (row.kind === "tile") editor.store.setTilePaint({ layerId: row.layer.id });
  };
  /** Up is toward the front: later in the layer list. Only tile and image layers move. */
  const mover = (row: LayerRow) => {
    if (row.kind !== "tile" && row.kind !== "image") return undefined;
    const { id } = row.layer;
    const [list, reorder] =
      row.kind === "tile"
        ? [state.document.tileLayers ?? [], reorderTileLayer]
        : [state.document.imageLayers ?? [], reorderImageLayer];
    return {
      can: (delta: -1 | 1) => reorderTarget(list, id, delta) >= 0,
      move: (delta: -1 | 1) => reorder(editor.store, id, delta),
    };
  };

  return (
    <Panel data-testid="layers-panel">
      <PanelScroll py="1">
        {layerStack(state.document).map((row) => (
          <div key={row.key}>
            <LayerRowView
              row={row}
              active={row.key === current}
              visible={isLayerVisible(state, row.key)}
              locked={isLayerLocked(state, row.key)}
              onSelect={() => select(row)}
              mover={mover(row)}
            />
            {row.key === current && row.kind === "tile" && (
              <Details>
                <TileLayerDetails layer={row.layer} />
              </Details>
            )}
            {row.key === current && row.kind === "image" && (
              <Details>
                <ImageLayerDetails layer={row.layer} />
              </Details>
            )}
          </div>
        ))}
      </PanelScroll>
      <chakra.div
        flex="none"
        display="flex"
        flexDirection="column"
        gap="1.5"
        p="2"
        borderTop="1px solid"
        borderColor="studio.border"
      >
        <AddTileLayer onAdd={() => setSelected(undefined)} />
        <ToolbarButton onClick={() => void editor.importImageLayer()}>
          <ImagePlus size={14} /> Import image layer…
        </ToolbarButton>
      </chakra.div>
    </Panel>
  );
}

function LayerRowView({
  row,
  active,
  visible,
  locked,
  onSelect,
  mover,
}: {
  row: LayerRow;
  active: boolean;
  visible: boolean;
  locked: boolean;
  onSelect: () => void;
  mover?: { can: (delta: -1 | 1) => boolean; move: (delta: -1 | 1) => void };
}) {
  const label = rowLabel(row);
  const Icon = ICONS[row.kind];
  const ids =
    row.kind === "tile"
      ? { "data-tile-layer": row.layer.id }
      : row.kind === "image"
        ? { "data-image-layer": row.layer.id }
        : {};
  return (
    <chakra.div
      display="flex"
      alignItems="center"
      gap="0.5"
      mx="2"
      my="1px"
      px="1"
      h="8"
      rounded="lg"
      border="1px solid"
      borderColor={active ? "studio.accent/40" : "transparent"}
      bg={active ? "studio.accent/15" : "transparent"}
      _hover={active ? undefined : { bg: "studio.hover" }}
      data-layer={row.key}
      {...ids}
    >
      <LayerButton
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        onClick={() => editor.store.setLayerVisible(row.key, !visible)}
      >
        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </LayerButton>
      <LayerButton
        aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
        color={locked ? "studio.warning" : undefined}
        onClick={() => editor.store.setLayerLocked(row.key, !locked)}
      >
        {locked ? <Lock size={14} /> : <Unlock size={14} />}
      </LayerButton>
      <chakra.button
        type="button"
        aria-current={active || undefined}
        title={label}
        onClick={onSelect}
        display="flex"
        alignItems="center"
        gap="1.5"
        minW="0"
        flex="1"
        h="full"
        px="1"
        bg="transparent"
        border="0"
        cursor="pointer"
        textAlign="left"
        fontSize="12px"
        color={active ? "studio.accentFg" : visible ? "studio.fgSecondary" : "studio.muted"}
      >
        <Icon size={13} style={{ flex: "none" }} />
        <chakra.span minW="0" flex="1" truncate>
          {label}
        </chakra.span>
        {(row.kind === "tile" || row.kind === "image") && (
          <chakra.span flex="none" fontFamily="mono" fontSize="9.5px" color="studio.muted">
            {row.layer.layer}
          </chakra.span>
        )}
      </chakra.button>
      {mover && (
        <>
          <LayerButton
            aria-label="Move layer up"
            disabled={!mover.can(1)}
            onClick={() => mover.move(1)}
          >
            <ArrowUp size={13} />
          </LayerButton>
          <LayerButton
            aria-label="Move layer down"
            disabled={!mover.can(-1)}
            onClick={() => mover.move(-1)}
          >
            <ArrowDown size={13} />
          </LayerButton>
        </>
      )}
    </chakra.div>
  );
}

/** The selected image layer: draw layer, parallax, position and removal. */
function ImageLayerDetails({ layer }: { layer: ImageLayer }) {
  const commitNumber = (key: "parallax" | "x" | "y", raw: string): void => {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) return;
    updateImageLayer(editor.store, layer.id, { [key]: value });
  };
  return (
    <chakra.div display="flex" flexDirection="column" gap="2">
      <Grid2>
        <Field label="Layer">
          <FieldSelect
            value={layer.layer}
            onChange={(e) =>
              updateImageLayer(editor.store, layer.id, { layer: e.target.value as DecorationLayer })
            }
          >
            {DECORATION_LAYERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </FieldSelect>
        </Field>
        {(["parallax", "x", "y"] as const).map((key) => (
          <Field key={key} label={key === "parallax" ? "Parallax" : key.toUpperCase()}>
            <FieldInput
              type="number"
              step={key === "parallax" ? 0.1 : 1}
              min={key === "parallax" ? 0 : undefined}
              defaultValue={layer[key]}
              key={`${key}-${layer[key]}`}
              onBlur={(e) => commitNumber(key, e.target.value)}
            />
          </Field>
        ))}
      </Grid2>
      <chakra.div display="flex" gap="1">
        <ToolbarButton onClick={() => removeImageLayer(editor.store, layer.id)}>
          <Trash2 size={14} /> Remove layer
        </ToolbarButton>
      </chakra.div>
    </chakra.div>
  );
}
