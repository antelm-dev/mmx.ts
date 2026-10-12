import { useMemo } from "react";
import { chakra } from "@chakra-ui/react";
import { Grid3x3, ListTree, MousePointer2, Sparkles } from "lucide-react";
import {
  DECORATION_LAYERS,
  TerrainTile,
  effectiveValue,
  instanceSize,
  requireDefinition,
  setDecoration,
  setProperty,
  setTransform,
  type DecorationInstance,
  type DecorationLayer,
  type GameObjectDefinition,
  type LevelObjectInstance,
  type PropertyMeta,
  type ValidationIssue,
} from "@mmx/content-schema";
import { getDecorationAsset } from "@mmx/renderer-pixi";
import { LOADOUT_IDS } from "@mmx/project-io";
import { editor, projectSession, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { selectedDecorationIds, selectedObjectIds } from "../core/EditorStore.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { Field, FieldInput } from "../ui/editor/field.js";
import { Panel, PanelActions, PanelScroll } from "../ui/editor/panel.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { Select } from "../ui/editor/select.js";
import { SpritePreview } from "./SpritePreview.js";
import { focusPanel } from "../app/dock.js";

const ErrorText = chakra("div", {
  base: { color: "studio.dangerFg", fontSize: "10.5px", mt: "3px", mb: "1" },
});
const EmptyState = chakra("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    pt: "16",
    px: "7",
    pb: "6",
    textAlign: "center",
  },
});
const EmptyTitle = chakra("div", { base: { mb: "1.5", color: "studio.fg", fontWeight: "650" } });
const EmptyCopy = chakra("div", {
  base: { maxW: "220px", color: "studio.fgTertiary", fontSize: "11.5px", lineHeight: "1.55" },
});
const EmptyIcon = chakra("div", {
  base: {
    display: "grid",
    placeItems: "center",
    w: "12",
    h: "12",
    mb: "4",
    border: "1px solid",
    borderColor: "studio.accent/35",
    rounded: "14px",
    color: "#7aaaff",
    bgImage: "linear-gradient(145deg,rgba(59,130,246,0.18),rgba(59,130,246,0.04))",
    boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
  },
});
/** Preview + name/id block at the top of a single selection. */
const Header = chakra("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "3",
    pt: "4",
    px: "3.5",
    pb: "3",
    fontWeight: "semibold",
  },
});
const HeaderText = chakra("div", {
  base: { display: "flex", flexDirection: "column", gap: "3px", minW: "0" },
});
const HeaderId = chakra("span", {
  base: { fontFamily: "mono", fontSize: "10px", fontWeight: "medium", color: "studio.fgTertiary" },
});
const Row = chakra("div", { base: { py: "3px", px: "3.5" } });
const RowGrid = chakra("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "2",
    py: "3px",
    px: "3.5",
  },
});
const KeyValue = chakra("div", {
  base: {
    py: "1",
    px: "3.5",
    textStyle: "xs",
    display: "flex",
    justifyContent: "space-between",
    gap: "2.5",
  },
});

interface Single {
  inst: LevelObjectInstance;
  def: GameObjectDefinition;
  width: number;
  height: number;
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

/** Select value standing for an `asset` property set to none (asset ids are never empty). */
const NO_ASSET = "";

/** The inspector control for one property, chosen by its type; each edit is one undoable command. */
function PropertyControl({
  inst,
  prop,
  invalid,
}: {
  inst: LevelObjectInstance;
  prop: PropertyMeta;
  invalid: boolean;
}) {
  const assets = useProjectSession().project?.manifest.assets;
  const value = effectiveValue(inst, prop.key);
  const commit = (next: unknown): void => {
    if (next !== value) {
      editor.store.execute(setProperty(inst.id, prop.key, "override", value, next));
    }
  };

  switch (prop.type) {
    case "boolean":
      return <Checkbox label={prop.label} checked={value === true} onCheckedChange={commit} />;
    case "enum":
      return (
        <Select
          label={prop.label}
          options={(prop.options ?? []).map((opt) => ({ label: opt, value: opt }))}
          value={String(value ?? "")}
          onValueChange={commit}
          invalid={invalid}
        />
      );
    case "asset":
      return (
        <Select
          label={prop.label}
          options={[
            { label: "(none)", value: NO_ASSET },
            ...(assets ?? [])
              .filter((asset) => asset.kind === prop.assetKind)
              .map((asset) => ({ label: asset.id, value: asset.id })),
          ]}
          value={typeof value === "string" ? value : NO_ASSET}
          onValueChange={commit}
          invalid={invalid}
        />
      );
    default: {
      const text = String(value ?? "");
      return (
        <Field label={prop.label} invalid={invalid}>
          <FieldInput
            type={prop.type === "string" ? "text" : "number"}
            step={prop.type === "integer" ? 1 : undefined}
            defaultValue={text}
            key={`${prop.key}-${inst.id}-${text}`}
            onBlur={(e) => {
              if (prop.type === "string") return commit(e.target.value);
              const next = Number(e.target.value);
              if (Number.isFinite(next)) commit(next);
            }}
          />
        </Field>
      );
    }
  }
}

/** Right dock: schema-generated inspector with inline validation. */
export function Inspector() {
  const snap = useEditorSnapshot();
  const state = snap.state;
  const objectIds = selectedObjectIds(state.selection);
  const decorationIds = selectedDecorationIds(state.selection);
  const tileSelection = state.selection.kind === "tiles" ? state.selection.indices : [];

  const single = useMemo<Single | null>(() => {
    if (objectIds.length !== 1) return null;
    const inst = state.document.objects.find((o) => o.id === objectIds[0]);
    if (!inst) return null;
    const def = requireDefinition(inst.definitionId);
    const size = instanceSize(inst);
    return { inst, def, width: size.width, height: size.height };
  }, [objectIds, state.document.objects]);

  const singleDecoration = useMemo<DecorationInstance | null>(() => {
    if (decorationIds.length !== 1) return null;
    return state.document.decorations.find((d) => d.id === decorationIds[0]) ?? null;
  }, [decorationIds, state.document.decorations]);

  const singleTile = useMemo(() => {
    if (tileSelection.length !== 1) return null;
    const index = tileSelection[0];
    const col = index % state.document.cols;
    const row = Math.floor(index / state.document.cols);
    const value = state.document.tiles[index] ?? TerrainTile.Empty;
    return { index, col, row, value };
  }, [tileSelection, state.document.cols, state.document.tiles]);

  const issues = useMemo<ValidationIssue[]>(() => {
    if (!single) return [];
    return snap.validation.issues.filter((i) => i.objectId === single.inst.id);
  }, [single, snap.validation]);

  const objectIssues = issues.filter((i) => !i.field);
  const hasIssue = (field: string) => issues.some((i) => i.field === field);
  const issueFor = (field: string) => issues.find((i) => i.field === field);

  const onTransform = (s: Single, key: "x" | "y" | "width" | "height", raw: string): void => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const before = key === "x" ? s.inst.x : key === "y" ? s.inst.y : s[key];
    if (next === before) return;
    editor.store.execute(setTransform(s.inst.id, { [key]: before }, { [key]: next }));
  };

  const previewFlip = (s: Single) =>
    s.def.category === "enemy" && effectiveValue(s.inst, "FacesRight") === true;

  return (
    <Panel>
      <PanelScroll>
        {single ? (
          <>
            <Header>
              <SpritePreview
                definitionId={single.def.id}
                size={56}
                flip={previewFlip(single)}
                fallbackColor={single.def.editor.color}
              />
              <HeaderText>
                <chakra.span lineHeight="1.2">
                  {single.def.icon} {single.def.name}
                </chakra.span>
                <HeaderId wordBreak="break-all">{single.inst.id}</HeaderId>
              </HeaderText>
            </Header>

            {objectIssues.map((issue) => (
              <ErrorText key={issue.code} px="3" py="1">
                {issue.message}
              </ErrorText>
            ))}

            <SectionTitle divider>Transform</SectionTitle>
            <RowGrid>
              <Field label="X">
                <FieldInput
                  type="number"
                  defaultValue={single.inst.x}
                  key={`x-${single.inst.id}-${single.inst.x}`}
                  onBlur={(e) => onTransform(single, "x", e.target.value)}
                />
              </Field>
              <Field label="Y">
                <FieldInput
                  type="number"
                  defaultValue={single.inst.y}
                  key={`y-${single.inst.id}-${single.inst.y}`}
                  onBlur={(e) => onTransform(single, "y", e.target.value)}
                />
              </Field>
            </RowGrid>
            {single.def.editor.resizable && (
              <RowGrid>
                <Field label="Width" invalid={hasIssue("width")}>
                  <FieldInput
                    type="number"
                    defaultValue={single.width}
                    key={`w-${single.inst.id}-${single.width}`}
                    onBlur={(e) => onTransform(single, "width", e.target.value)}
                  />
                </Field>
                <Field label="Height" invalid={hasIssue("height")}>
                  <FieldInput
                    type="number"
                    defaultValue={single.height}
                    key={`h-${single.inst.id}-${single.height}`}
                    onBlur={(e) => onTransform(single, "height", e.target.value)}
                  />
                </Field>
              </RowGrid>
            )}

            {single.def.properties.length > 0 && (
              <>
                <SectionTitle divider>Properties</SectionTitle>
                {single.def.properties.map((prop) => (
                  <Row key={prop.key}>
                    <PropertyControl
                      inst={single.inst}
                      prop={prop}
                      invalid={hasIssue(prop.key)}
                    />
                    {issueFor(prop.key) ? (
                      <ErrorText>{issueFor(prop.key)!.message}</ErrorText>
                    ) : prop.help ? (
                      <chakra.div color="studio.muted" fontSize="10px" mt="3px" mb="1">
                        {prop.help}
                      </chakra.div>
                    ) : null}
                  </Row>
                ))}
              </>
            )}

            <PanelActions>
              <ActionButton onClick={() => editor.duplicateSelection()}>
                Duplicate
              </ActionButton>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Delete
              </ActionButton>
            </PanelActions>
          </>
        ) : objectIds.length > 1 ? (
          <>
            <EmptyState>
              <EmptyIcon>
                <MousePointer2 size={20} />
              </EmptyIcon>
              <EmptyTitle>{objectIds.length} objects selected</EmptyTitle>
              <EmptyCopy>Duplicate or delete the current selection.</EmptyCopy>
            </EmptyState>
            <PanelActions>
              <ActionButton onClick={() => editor.duplicateSelection()}>
                Duplicate
              </ActionButton>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Delete
              </ActionButton>
            </PanelActions>
          </>
        ) : singleDecoration ? (
          <DecorationInspector inst={singleDecoration} />
        ) : decorationIds.length > 1 ? (
          <>
            <EmptyState>
              <EmptyIcon>
                <Sparkles size={20} />
              </EmptyIcon>
              <EmptyTitle>{decorationIds.length} decorations selected</EmptyTitle>
              <EmptyCopy>Duplicate or delete the current selection.</EmptyCopy>
            </EmptyState>
            <PanelActions>
              <ActionButton onClick={() => editor.duplicateSelection()}>
                Duplicate
              </ActionButton>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Delete
              </ActionButton>
            </PanelActions>
          </>
        ) : singleTile ? (
          <>
            <Header>
              <EmptyIcon w="14" h="14">
                <Grid3x3 size={20} />
              </EmptyIcon>
              <HeaderText>
                <chakra.span lineHeight="1.2">{tileKindLabel(singleTile.value)} tile</chakra.span>
                <HeaderId>
                  Cell {singleTile.col}, {singleTile.row}
                </HeaderId>
              </HeaderText>
            </Header>
            <SectionTitle divider>Terrain</SectionTitle>
            <KeyValue>
              <chakra.span color="studio.muted">Index</chakra.span>
              <chakra.span fontFamily="mono" color="studio.fg">
                {singleTile.index}
              </chakra.span>
            </KeyValue>
            <KeyValue>
              <chakra.span color="studio.muted">Kind</chakra.span>
              <chakra.span fontFamily="mono" color="studio.fg">
                {tileKindLabel(singleTile.value)}
              </chakra.span>
            </KeyValue>
            <PanelActions>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Erase tile
              </ActionButton>
            </PanelActions>
          </>
        ) : tileSelection.length > 1 ? (
          <>
            <EmptyState>
              <EmptyIcon>
                <Grid3x3 size={20} />
              </EmptyIcon>
              <EmptyTitle>{tileSelection.length} tiles selected</EmptyTitle>
              <EmptyCopy>Erase the selected terrain cells with Delete.</EmptyCopy>
            </EmptyState>
            <PanelActions>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Erase tiles
              </ActionButton>
            </PanelActions>
          </>
        ) : (
          <>
          <ProjectSettings />
          <EmptyState>
            <EmptyIcon>
              <MousePointer2 size={20} />
            </EmptyIcon>
            <EmptyTitle>Nothing selected</EmptyTitle>
            <EmptyCopy>
              Choose an object or solid tile on the canvas, or browse the Scene tab.
            </EmptyCopy>
            <chakra.button
              display="inline-flex"
              alignItems="center"
              gap="2"
              h="8"
              mt="4"
              px="3"
              rounded="lg"
              border="1px solid"
              borderColor="studio.borderStrong"
              bg="studio.raised"
              fontSize="11.5px"
              fontWeight="semibold"
              color="studio.fgSecondary"
              _hover={{ bg: "studio.hover", color: "studio.fg" }}
              onClick={() => focusPanel("scene")}
            >
              <ListTree size={14} /> Browse scene objects
            </chakra.button>
          </EmptyState>
          </>
        )}
      </PanelScroll>
    </Panel>
  );
}

/** `player.x` -> "X", `player.zero` -> "Zero"; any other id is shown as-is. */
function loadoutLabel(id: string): string {
  const name = id.startsWith("player.") ? id.slice("player.".length) : id;
  return name.length <= 1 ? name.toUpperCase() : name.charAt(0).toUpperCase() + name.slice(1);
}

/** Project-wide settings shown when nothing is selected and a project is open. */
function ProjectSettings() {
  const project = useProjectSession().project;
  if (!project) return null;
  const loadout = project.manifest.player?.loadout ?? "player.x";
  return (
    <>
      <SectionTitle divider>Project</SectionTitle>
      <Row display="flex" flexDirection="column">
        <Select
          label="Player loadout"
          options={LOADOUT_IDS.map((id) => ({ label: loadoutLabel(id), value: id }))}
          value={loadout}
          onValueChange={(id) => projectSession.setPlayerLoadout(id)}
        />
      </Row>
    </>
  );
}

function DecorationInspector({ inst }: { inst: DecorationInstance }) {
  const asset = getDecorationAsset(inst.assetId);
  const name = asset?.name ?? inst.assetId;

  const onLayer = (layer: string) => {
    if (layer === inst.layer) return;
    editor.store.execute(
      setDecoration(inst.id, { layer: inst.layer }, { layer: layer as DecorationLayer }),
    );
  };

  const onFlip = (axis: "flipX" | "flipY", checked: boolean) => {
    editor.store.execute(
      setDecoration(inst.id, { [axis]: inst[axis] ?? false }, { [axis]: checked }),
    );
  };

  const onRotation = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next === (inst.rotation ?? 0)) return;
    editor.store.execute(
      setDecoration(inst.id, { rotation: inst.rotation }, { rotation: next || undefined }),
    );
  };

  const onParallax = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next === (inst.parallax ?? 1)) return;
    editor.store.execute(setDecoration(inst.id, { parallax: inst.parallax }, { parallax: next }));
  };

  const onTint = (raw: string) => {
    const trimmed = raw.trim();
    const next = trimmed === "" ? undefined : Number.parseInt(trimmed.replace("#", ""), 16);
    if (next !== undefined && !Number.isFinite(next)) return;
    editor.store.execute(setDecoration(inst.id, { tint: inst.tint }, { tint: next }));
  };

  return (
    <>
      <Header>
        <SpritePreview assetId={inst.assetId} size={56} />
        <HeaderText>
          <chakra.span lineHeight="1.2">{name}</chakra.span>
          <HeaderId wordBreak="break-all">{inst.id}</HeaderId>
        </HeaderText>
      </Header>

      <SectionTitle divider>Layer</SectionTitle>
      <Row>
        <Select
          aria-label="Layer"
          options={DECORATION_LAYERS.map((l) => ({ label: l, value: l }))}
          value={inst.layer}
          onValueChange={onLayer}
        />
      </Row>

      <SectionTitle divider>Properties</SectionTitle>
      <Row>
        <Checkbox
          label="Flip X"
          mb="2"
          checked={inst.flipX === true}
          onCheckedChange={(c) => onFlip("flipX", c)}
        />
        <Checkbox
          label="Flip Y"
          mb="2"
          checked={inst.flipY === true}
          onCheckedChange={(c) => onFlip("flipY", c)}
        />
      </Row>
      <RowGrid>
        <Field label="Rotation">
          <FieldInput
            type="number"
            step="any"
            defaultValue={inst.rotation ?? 0}
            key={`rot-${inst.id}-${inst.rotation}`}
            onBlur={(e) => onRotation(e.target.value)}
          />
        </Field>
        <Field label="Parallax">
          <FieldInput
            type="number"
            step="any"
            defaultValue={inst.parallax ?? 1}
            key={`par-${inst.id}-${inst.parallax}`}
            onBlur={(e) => onParallax(e.target.value)}
          />
        </Field>
      </RowGrid>
      <Row>
        <Field label="Tint (hex)">
          <FieldInput
            type="text"
            defaultValue={inst.tint !== undefined ? inst.tint.toString(16).padStart(6, "0") : ""}
            key={`tint-${inst.id}-${inst.tint}`}
            placeholder="ffffff"
            onBlur={(e) => onTint(e.target.value)}
          />
        </Field>
      </Row>

      <PanelActions>
        <ActionButton onClick={() => editor.duplicateSelection()}>
          Duplicate
        </ActionButton>
        <ActionButton danger onClick={() => editor.deleteSelection()}>
          Delete
        </ActionButton>
      </PanelActions>
    </>
  );
}
