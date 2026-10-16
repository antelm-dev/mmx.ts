import { Box, chakra } from "@chakra-ui/react";
import { AlertTriangle, X } from "lucide-react";
import type { LevelSettings } from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { setBackdrop, setRoomSettings } from "../core/actions.js";
import { Panel, PanelScroll } from "../ui/editor/panel.js";
import { Field, FieldInput } from "../ui/editor/field.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";

const Row = chakra("div", { base: { py: "3px", px: "3.5" } });
const Grid2 = chakra("div", {
  base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2" },
});

/** Right dock tab: configure the level ("room") — name, grid pitch, size and backdrop (layers live in the Layers panel). */
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
