import { useEffect, useState } from "react";
import { chakra } from "@chakra-ui/react";
import { ImagePlus } from "lucide-react";
import {
  mergeRects,
  sliceAuto,
  sliceGrid,
  splitRect,
  toRegions,
  type Rect,
  type SliceBackground,
} from "@mmx/project-io";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import { setSpriteRegions } from "../core/actions.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { Panel, PanelActions, PanelNote, PanelScroll } from "../ui/editor/panel.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";

const Row = chakra("div", { base: { py: "3px", px: "3.5" } });
const Grid2 = chakra("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "2",
    py: "3px",
    px: "3.5",
  },
});

export type Sheet = { url: string; width: number; height: number; px: Uint8ClampedArray };

/** Decode a data URL to RGBA through a canvas (any PNG the browser reads, not only 8-bit RGBA). */
export async function loadSheet(url: string): Promise<Sheet> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return {
    url,
    width: canvas.width,
    height: canvas.height,
    px: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
  };
}

/** Whole number from a field, or the fallback when blank or invalid. */
const int = (raw: string, fallback: number, min = 0): number => {
  const value = Math.round(Number(raw));
  return raw.trim() !== "" && Number.isFinite(value) && value >= min ? value : fallback;
};

/** Tool panel: slice a sprite sheet into frame regions (auto or grid), retouch them, save them on the asset. */
export function SheetSlicerPanel() {
  const session = useProjectSession();
  const sprites = session.project?.manifest.assets.filter((asset) => asset.kind === "sprite") ?? [];
  const [assetId, setAssetId] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<"auto" | "grid">("auto");
  const [background, setBackground] = useState<"alpha" | "corner">("alpha");
  const [mergeGap, setMergeGap] = useState(3);
  const [byRow, setByRow] = useState(false);
  const [cell, setCell] = useState<[number, number]>([32, 32]);
  const [margin, setMargin] = useState(0);
  const [spacing, setSpacing] = useState(0);
  const [zoom, setZoom] = useState(2);

  // Load the sheet's pixels and its saved regions whenever another asset is picked.
  useEffect(() => {
    let cancelled = false;
    setSheet(null);
    setSelected([]);
    setRects(projectSession.spriteRegions(assetId).map((entry) => entry.region));
    if (!assetId) return;
    void projectSession
      .readAssetUrl(assetId)
      .then((url) => (url ? loadSheet(url) : null))
      .then((loaded) => !cancelled && setSheet(loaded))
      .catch((error: unknown) =>
        editor.toast(
          `Could not read sheet: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [assetId, session.rootPath]);

  const bg = (): SliceBackground =>
    background === "alpha" || !sheet ? "alpha" : [sheet.px[0]!, sheet.px[1]!, sheet.px[2]!];

  const replace = (next: Rect[]): void => {
    // Keep reading order so the numbers shown are the saved order.
    setRects(toRegions(next).map((entry) => entry.region));
    setSelected([]);
  };

  const importSheet = async (): Promise<void> => {
    try {
      const id = await projectSession.importImage("sprite");
      if (id) setAssetId(id);
    } catch (error) {
      editor.toast(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (!session.open) return <PanelNote>Open a project to slice its sprite sheets.</PanelNote>;

  return (
    <Panel>
      <PanelScroll>
        <SectionTitle>Sheet</SectionTitle>
        <chakra.div display="flex" gap="2" alignItems="flex-end" py="3px" px="3.5">
          <chakra.div flex="1" minW="0">
            <Field label="Sprite asset">
              <FieldSelect value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">Choose a sprite…</option>
                {sprites.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.id}
                  </option>
                ))}
              </FieldSelect>
            </Field>
          </chakra.div>
          <ToolbarButton onClick={() => void importSheet()}>
            <ImagePlus size={14} /> Import sheet…
          </ToolbarButton>
        </chakra.div>

        <SectionTitle divider>Slicing</SectionTitle>
        <Grid2>
          <Field label="Mode">
            <FieldSelect value={mode} onChange={(e) => setMode(e.target.value as "auto" | "grid")}>
              <option value="auto">Auto (connected pixels)</option>
              <option value="grid">Grid</option>
            </FieldSelect>
          </Field>
          <Field label="Zoom">
            <FieldSelect value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
              {[1, 2, 3, 4, 6].map((z) => (
                <option key={z} value={z}>
                  {z}×
                </option>
              ))}
            </FieldSelect>
          </Field>
        </Grid2>
        {mode === "auto" ? (
          <>
            <Grid2>
              <Field label="Background">
                <FieldSelect
                  value={background}
                  onChange={(e) => setBackground(e.target.value as "alpha" | "corner")}
                >
                  <option value="alpha">Transparent</option>
                  <option value="corner">Top-left pixel colour</option>
                </FieldSelect>
              </Field>
              <Field label="Merge gap (px)">
                <FieldInput
                  type="number"
                  min={0}
                  value={mergeGap}
                  onChange={(e) => setMergeGap(int(e.target.value, mergeGap))}
                />
              </Field>
            </Grid2>
            <PanelActions>
              <ActionButton
                disabled={!sheet}
                onClick={() =>
                  sheet &&
                  replace(
                    sliceAuto(sheet.px, sheet.width, sheet.height, { background: bg(), mergeGap }),
                  )
                }
              >
                Detect regions
              </ActionButton>
            </PanelActions>
          </>
        ) : (
          <>
            <Grid2>
              <Field label="Cell width">
                <FieldInput
                  type="number"
                  min={1}
                  value={cell[0]}
                  onChange={(e) => setCell([int(e.target.value, cell[0], 1), cell[1]])}
                />
              </Field>
              <Field label="Cell height">
                <FieldInput
                  type="number"
                  min={1}
                  value={cell[1]}
                  onChange={(e) => setCell([cell[0], int(e.target.value, cell[1], 1)])}
                />
              </Field>
              <Field label="Margin">
                <FieldInput
                  type="number"
                  min={0}
                  value={margin}
                  onChange={(e) => setMargin(int(e.target.value, margin))}
                />
              </Field>
              <Field label="Spacing">
                <FieldInput
                  type="number"
                  min={0}
                  value={spacing}
                  onChange={(e) => setSpacing(int(e.target.value, spacing))}
                />
              </Field>
            </Grid2>
            <PanelActions>
              <ActionButton
                disabled={!sheet}
                onClick={() =>
                  sheet && replace(sliceGrid(sheet.width, sheet.height, { cell, margin, spacing }))
                }
              >
                Apply grid
              </ActionButton>
            </PanelActions>
          </>
        )}

        <SectionTitle divider>
          Regions <span data-testid="region-count">{rects.length}</span>
        </SectionTitle>
        <Row>
          <Checkbox label="Group ids by row (rowR.C)" checked={byRow} onCheckedChange={setByRow} />
        </Row>
        <PanelActions>
          <ActionButton
            disabled={selected.length < 2}
            onClick={() =>
              replace([
                ...rects.filter((_, i) => !selected.includes(i)),
                mergeRects(selected.map((i) => rects[i]!)),
              ])
            }
          >
            Merge
          </ActionButton>
          <ActionButton
            disabled={selected.length !== 1 || !sheet}
            onClick={() =>
              sheet &&
              replace([
                ...rects.filter((_, i) => i !== selected[0]),
                ...splitRect(sheet.px, sheet.width, rects[selected[0]!]!, bg()),
              ])
            }
          >
            Split
          </ActionButton>
          <ActionButton
            disabled={!assetId}
            onClick={() =>
              setSpriteRegions(editor.store, projectSession, assetId, toRegions(rects, byRow))
            }
          >
            Save regions
          </ActionButton>
        </PanelActions>

        {sheet && (
          <chakra.div px="3.5" pb="3" overflow="auto">
            <chakra.div
              position="relative"
              flex="none"
              bg="studio.raised"
              style={{ width: sheet.width * zoom, height: sheet.height * zoom }}
            >
              <chakra.img
                src={sheet.url}
                alt=""
                draggable={false}
                imageRendering="pixelated"
                maxW="none"
                style={{ width: sheet.width * zoom, height: sheet.height * zoom }}
              />
              {rects.map(([x, y, w, h], i) => {
                const on = selected.includes(i);
                return (
                  <chakra.button
                    key={`${x},${y},${w},${h}`}
                    type="button"
                    aria-label={`Region ${i + 1}`}
                    aria-pressed={on}
                    data-region={i}
                    position="absolute"
                    display="flex"
                    alignItems="flex-start"
                    justifyContent="flex-start"
                    p="0"
                    border="1px solid"
                    borderColor={on ? "studio.accent" : "studio.warning"}
                    bg={on ? "studio.accent/25" : "transparent"}
                    cursor="pointer"
                    fontFamily="mono"
                    fontSize="9px"
                    lineHeight="1"
                    color="white"
                    textShadow="0 0 2px black"
                    style={{ left: x * zoom, top: y * zoom, width: w * zoom, height: h * zoom }}
                    onClick={() =>
                      setSelected(on ? selected.filter((s) => s !== i) : [...selected, i])
                    }
                  >
                    {i + 1}
                  </chakra.button>
                );
              })}
            </chakra.div>
          </chakra.div>
        )}
      </PanelScroll>
    </Panel>
  );
}
