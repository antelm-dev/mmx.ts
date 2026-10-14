import { Box, chakra } from "@chakra-ui/react";
import { AlertTriangle, ArrowDown, ArrowUp, ImagePlus, Trash2, X } from "lucide-react";
import {
  DECORATION_LAYERS,
  type DecorationLayer,
  type ImageLayer,
  type LevelSettings,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import {
  removeImageLayer,
  reorderImageLayer,
  setBackdrop,
  setRoomSettings,
  updateImageLayer,
} from "../core/actions.js";
import { Panel, PanelScroll } from "../ui/editor/panel.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { TileLayersSection } from "./TilesetPanel.js";

const Row = chakra("div", { base: { py: "3px", px: "3.5" } });
const Grid2 = chakra("div", {
  base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2" },
});

/** Right dock tab: configure the level ("room") — name, grid pitch, size and art layers. */
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
    editor.store.execute(setRoomSettings(doc, next));
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
    <Panel>
      <PanelScroll>
        <SectionTitle>Room</SectionTitle>
        <Row>
          <Field label="Name">
            <FieldInput
              type="text"
              defaultValue={doc.name}
              key={`name-${doc.name}`}
              onBlur={(e) => commit({ name: e.target.value.trim() || doc.name })}
            />
          </Field>
        </Row>

        <SectionTitle divider>Size</SectionTitle>
        <Grid2 py="3px" px="3.5">
          <Field label="Columns">
            <FieldInput
              type="number"
              min={1}
              defaultValue={doc.cols}
              key={`cols-${doc.cols}`}
              onBlur={(e) => commitInt("cols", e.target.value)}
            />
          </Field>
          <Field label="Rows">
            <FieldInput
              type="number"
              min={1}
              defaultValue={doc.rows}
              key={`rows-${doc.rows}`}
              onBlur={(e) => commitInt("rows", e.target.value)}
            />
          </Field>
        </Grid2>
        <Row>
          <Field label="Grid size (px)">
            <FieldInput
              type="number"
              min={1}
              defaultValue={doc.gridSize}
              key={`grid-${doc.gridSize}`}
              onBlur={(e) => commitInt("gridSize", e.target.value)}
            />
          </Field>
        </Row>

        <chakra.div
          mx="3.5"
          mt="2"
          mb="1"
          display="flex"
          justifyContent="space-between"
          gap="2.5"
          rounded="lg"
          border="1px solid"
          borderColor="studio.border"
          bg="studio.raised"
          px="3"
          py="2"
          textStyle="xs"
        >
          <chakra.span color="studio.muted">World size</chakra.span>
          <chakra.span fontFamily="mono" color="studio.fg">
            {worldW} × {worldH} px
          </chakra.span>
        </chakra.div>

        <chakra.div
          display="flex"
          alignItems="flex-start"
          gap="2"
          px="3.5"
          py="2"
          fontSize="10.5px"
          lineHeight="1.5"
          color="studio.fgTertiary"
        >
          <Box asChild mt="1px" flex="none" color="studio.warning">
            <AlertTriangle size={13} />
          </Box>
          <span>Shrinking the room crops terrain and slopes outside the new bounds.</span>
        </chakra.div>

        <SectionTitle divider>Image layers</SectionTitle>
        <chakra.div
          display="flex"
          flexDirection="column"
          gap="2"
          px="3.5"
          py="3px"
          data-testid="image-layers"
        >
          {(doc.imageLayers ?? []).map((layer, index, all) => (
            <ImageLayerRow key={layer.id} layer={layer} first={index === 0} last={index === all.length - 1} />
          ))}
          <ToolbarButton onClick={() => void editor.importImageLayer()}>
            <ImagePlus size={14} /> Add image layer…
          </ToolbarButton>
        </chakra.div>

        <TileLayersSection />

        <SectionTitle divider>Backdrop</SectionTitle>
        <chakra.div display="flex" alignItems="center" gap="2" px="3.5" py="3px">
          <chakra.input
            type="color"
            aria-label="Backdrop colour"
            h="8"
            w="12"
            cursor="pointer"
            rounded="sm"
            border="1px solid"
            borderColor="studio.borderStrong"
            bg="studio.raised"
            defaultValue={doc.backdrop ?? "#000000"}
            key={`backdrop-${doc.backdrop ?? ""}`}
            onBlur={(e) => setBackdrop(editor.store, e.target.value)}
          />
          <chakra.span fontFamily="mono" textStyle="xs" color="studio.fgSecondary">
            {doc.backdrop ?? "none"}
          </chakra.span>
          {doc.backdrop && (
            <ToolbarButton
              icon
              aria-label="Clear backdrop"
              onClick={() => setBackdrop(editor.store, undefined)}
            >
              <X size={14} />
            </ToolbarButton>
          )}
        </chakra.div>
      </PanelScroll>
    </Panel>
  );
}

/** One image layer: asset, draw layer, parallax, position, list order and removal. */
function ImageLayerRow({ layer, first, last }: { layer: ImageLayer; first: boolean; last: boolean }) {
  const commitNumber = (key: "parallax" | "x" | "y", raw: string): void => {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) return;
    updateImageLayer(editor.store, layer.id, { [key]: value });
  };
  return (
    <chakra.div
      rounded="lg"
      border="1px solid"
      borderColor="studio.border"
      bg="studio.raised"
      p="2"
      data-image-layer={layer.id}
    >
      <chakra.div mb="1.5" display="flex" alignItems="center" gap="1">
        <chakra.span
          minW="0"
          flex="1"
          truncate
          fontFamily="mono"
          fontSize="11px"
          color="studio.fg"
          title={layer.assetId}
        >
          {layer.assetId}
        </chakra.span>
        <ToolbarButton
          icon
          aria-label="Move layer back"
          disabled={first}
          onClick={() => reorderImageLayer(editor.store, layer.id, -1)}
        >
          <ArrowUp size={14} />
        </ToolbarButton>
        <ToolbarButton
          icon
          aria-label="Move layer forward"
          disabled={last}
          onClick={() => reorderImageLayer(editor.store, layer.id, 1)}
        >
          <ArrowDown size={14} />
        </ToolbarButton>
        <ToolbarButton
          icon
          aria-label="Remove image layer"
          onClick={() => removeImageLayer(editor.store, layer.id)}
        >
          <Trash2 size={14} />
        </ToolbarButton>
      </chakra.div>
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
    </chakra.div>
  );
}
