import { useEffect, useState, type CSSProperties, type PointerEvent } from "react";
import { chakra } from "@chakra-ui/react";
import { AnimationCursor } from "@mmx/engine";
import type {
  AnimationAsset,
  AnimationClip,
  AnimationFrame,
  FrameBox,
  Region,
} from "@mmx/project-schema";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import { setAnimationAsset, setPlayerAnimation } from "../core/actions.js";
import {
  boxFromPoints,
  canDeleteClip,
  copyBoxes,
  DURATION_PRESETS,
  feetAnchor,
  moveBox,
  moveItem,
  requiredPlayerClips,
  withBoxes,
} from "../core/clips.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { Panel, PanelActions, PanelNote, PanelScroll } from "../ui/editor/panel.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { loadSheet, type Sheet } from "./SheetSlicerPanel.js";

const Grid2 = chakra("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "2",
    py: "3px",
    px: "3.5",
  },
});
const Strip = chakra("div", {
  base: { display: "flex", flexWrap: "wrap", gap: "1", px: "3.5", py: "1" },
});
const Tile = chakra("button", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1",
    p: "1",
    border: "1px solid",
    borderColor: "studio.border",
    rounded: "5px",
    bg: "studio.raised",
    cursor: "pointer",
    fontSize: "9px",
    fontFamily: "mono",
    color: "studio.fgTertiary",
    _pressed: { borderColor: "studio.accent", bg: "studio.accent/20" },
  },
});

const PREVIEW_ZOOM = 3;
const SPEEDS = [0.25, 0.5, 1, 2];

/** What a press on the preview does: set the feet, or draw a box of that type. */
type PreviewTool = "anchor" | "hurtbox" | "hitbox";
/** A box of the shown frame: its hurtbox, or hitbox `index`. */
type BoxRef = { type: "hurtbox" } | { type: "hitbox"; index: number };
/** A box being drawn, moved or resized: written once, on release (one undo step). */
type BoxDrag = {
  mode: "draw" | "move" | "resize";
  ref: BoxRef;
  start: [number, number];
  from: FrameBox | null;
  box: FrameBox;
};

/** Hurtbox blue, hitboxes red. */
const BOX_COLORS = { hurtbox: "#3b82f6", hitbox: "#ef4444" } as const;
const sameRef = (a: BoxRef | null, b: BoxRef): boolean =>
  !!a && a.type === b.type && (a.type === "hurtbox" || a.index === (b as { index: number }).index);
/** Region pixels a press must travel before it draws a box. */
const DRAW_MIN_DRAG = 2;
const boxText = (box: FrameBox): string => `${box.x}, ${box.y} ${box.w}×${box.h}`;

/** One region of the sheet drawn at `zoom`, cropped with a CSS background. */
function RegionView({
  sheet,
  region,
  zoom,
  style,
}: {
  sheet: Sheet;
  region: Region;
  zoom: number;
  style?: CSSProperties;
}) {
  const [x, y, w, h] = region;
  return (
    <chakra.div
      flex="none"
      imageRendering="pixelated"
      style={{
        width: w * zoom,
        height: h * zoom,
        backgroundImage: `url(${sheet.url})`,
        backgroundPosition: `${-x * zoom}px ${-y * zoom}px`,
        backgroundSize: `${sheet.width * zoom}px ${sheet.height * zoom}px`,
        ...style,
      }}
    />
  );
}

/** Whole number from a field, or null when blank or below `min`. */
const int = (raw: string, min: number): number | null => {
  const value = Math.round(Number(raw));
  return raw.trim() !== "" && Number.isFinite(value) && value >= min ? value : null;
};

/** Tool panel: assemble clips from a sliced sheet into a playable `animation` asset (contract C-CLIP). */
export function ClipEditorPanel() {
  const session = useProjectSession();
  const assets = session.project?.manifest.assets ?? [];
  const sheets = assets.filter(
    (asset) => asset.kind === "sprite" && (asset.regions?.length ?? 0) > 0,
  );
  const [sheetId, setSheetId] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pickedAnimId, setAnimId] = useState("");
  const [clipName, setClipName] = useState("");
  const [newName, setNewName] = useState("");
  const [preset, setPreset] = useState(2);
  const [regionSel, setRegionSel] = useState<number[]>([]);
  const [frameSel, setFrameSel] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playFrame, setPlayFrame] = useState(0);
  const [tool, setTool] = useState<PreviewTool>("anchor");
  const [boxSel, setBoxSel] = useState<BoxRef | null>(null);
  const [drag, setDrag] = useState<BoxDrag | null>(null);

  const sheetAsset = sheets.find((asset) => asset.id === sheetId);
  const regions = projectSession.spriteRegions(sheetId);
  const bound = assets.filter(
    (asset): asset is AnimationAsset =>
      asset.kind === "animation" && asset.sheetAssetId === sheetId,
  );
  const newAnimId = `anim.${sheetId.replace(/^sprite\./, "")}`;
  const animId = bound.some((asset) => asset.id === pickedAnimId)
    ? pickedAnimId
    : (bound[0]?.id ?? newAnimId);
  const anim = projectSession.animationAsset(animId);
  const clips = anim?.animations ?? {};
  const clip: AnimationClip | undefined = clips[clipName];
  const frames = clip?.frames ?? [];
  const isPlayer = projectSession.playerAnimation() === animId;
  const required = requiredPlayerClips(
    session.project?.manifest.player?.loadout,
    projectSession.gameData().compiled,
  );

  useEffect(() => {
    let cancelled = false;
    setSheet(null);
    setRegionSel([]);
    if (!sheetId) return;
    void projectSession
      .readAssetUrl(sheetId)
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
  }, [sheetId, session.rootPath]);

  useEffect(() => setFrameSel([]), [clipName, animId]);
  useEffect(() => {
    setBoxSel(null);
    setDrag(null);
  }, [clipName, animId, frameSel[0], playing, tool]);

  // Preview playback on the engine's own cursor, at 60 Hz clip time scaled by `speed`.
  useEffect(() => {
    if (!playing || !clip) return;
    const cursor = new AnimationCursor();
    cursor.play(clip);
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      cursor.advance(((now - last) / 1000) * speed);
      last = now;
      setPlayFrame(cursor.frame);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, clip, speed]);

  if (!session.open) return <PanelNote>Open a project to edit its animation clips.</PanelNote>;

  const writeAll = (label: string, animations: Record<string, AnimationClip>): void => {
    if (!sheetAsset) return;
    const next: AnimationAsset | null =
      Object.keys(animations).length > 0
        ? {
            id: animId,
            kind: "animation",
            path: anim?.path ?? sheetAsset.path,
            sheetAssetId: sheetId,
            animations,
          }
        : null;
    setAnimationAsset(editor.store, projectSession, animId, next, label);
  };
  const writeClip = (label: string, next: AnimationClip): void =>
    writeAll(label, { ...clips, [clipName]: next });
  const writeFrames = (label: string, next: AnimationFrame[]): void => {
    const { loopStart, ...rest } = clip!;
    writeClip(label, {
      ...rest,
      frames: next,
      ...(loopStart !== undefined && loopStart < next.length ? { loopStart } : {}),
    });
  };

  const newFrame = (region: Region): AnimationFrame => ({
    region,
    duration: DURATION_PRESETS[preset]!.duration,
    ...(sheet ? { anchor: feetAnchor(sheet.px, sheet.width, region) } : {}),
  });
  const pickedFrames = (): AnimationFrame[] => regionSel.map((i) => newFrame(regions[i]!.region));

  const createClip = (): void => {
    const name = newName.trim();
    if (!name || clips[name] || regionSel.length === 0) return;
    writeAll("Create clip", {
      ...clips,
      [name]: { loop: true, speed: 60, frames: pickedFrames() },
    });
    setClipName(name);
    setNewName("");
    setRegionSel([]);
  };

  const shown = playing ? playFrame : (frameSel[0] ?? 0);
  const current = frames[shown];
  const previous = frames[shown - 1];
  const targets = frameSel.length > 0 ? frameSel : current ? [shown] : [];
  const setAnchors = (label: string, anchorOf: (frame: AnimationFrame) => [number, number]): void =>
    writeFrames(
      label,
      frames.map((frame, i) =>
        targets.includes(i) ? { ...frame, anchor: anchorOf(frame) } : frame,
      ),
    );
  const anchorAt = (frame: AnimationFrame | undefined): [number, number] =>
    frame?.anchor ? [frame.anchor[0], frame.anchor[1]] : [0, 0];

  // Boxes of the shown frame, with the box being dragged in place of its stored one.
  const hitboxes = current?.hitboxes ?? [];
  const boxAt = (ref: BoxRef): FrameBox | undefined =>
    ref.type === "hurtbox" ? current?.hurtbox : hitboxes[ref.index];
  const shownBoxes: { ref: BoxRef; box: FrameBox }[] = [
    ...(current?.hurtbox ? [{ ref: { type: "hurtbox" } as BoxRef, box: current.hurtbox }] : []),
    ...hitboxes.map((box, index) => ({ ref: { type: "hitbox", index } as BoxRef, box })),
  ].map((entry) => (drag && sameRef(drag.ref, entry.ref) ? { ...entry, box: drag.box } : entry));
  if (drag?.mode === "draw" && !shownBoxes.some((entry) => sameRef(drag.ref, entry.ref))) {
    shownBoxes.push({ ref: drag.ref, box: drag.box });
  }
  const selectedBox = boxSel ? boxAt(boxSel) : undefined;
  const boxing = tool !== "anchor" && !playing && !!current?.anchor;

  /** Write the shown frame's boxes with `ref` set to `box` (removed when null). */
  const writeBox = (label: string, ref: BoxRef, box: FrameBox | null): void => {
    if (!current) return;
    const nextHit =
      ref.type === "hurtbox"
        ? hitboxes
        : box
          ? [...hitboxes.slice(0, ref.index), box, ...hitboxes.slice(ref.index + 1)]
          : hitboxes.filter((_, i) => i !== ref.index);
    const nextHurt = ref.type === "hurtbox" ? (box ?? undefined) : current.hurtbox;
    writeFrames(
      label,
      frames.map((frame, i) => (i === shown ? withBoxes(frame, nextHurt, nextHit) : frame)),
    );
  };
  /** Pointer position in the shown frame's region pixels (fractional). */
  const regionPoint = (e: PointerEvent<HTMLElement>, preview: HTMLElement): [number, number] => {
    const rect = preview.getBoundingClientRect();
    return [(e.clientX - rect.left) / PREVIEW_ZOOM, (e.clientY - rect.top) / PREVIEW_ZOOM];
  };
  const startDrag = (
    e: PointerEvent<HTMLElement>,
    mode: BoxDrag["mode"],
    ref: BoxRef,
    from: FrameBox | null,
  ): void => {
    const preview = e.currentTarget.closest<HTMLElement>("[data-testid=clip-preview]");
    if (e.button !== 0 || !boxing || !preview || !current?.anchor) return;
    e.stopPropagation();
    preview.setPointerCapture(e.pointerId);
    const start = regionPoint(e, preview);
    const size: [number, number] = [current.region[2], current.region[3]];
    setBoxSel(ref);
    setDrag({
      mode,
      ref,
      start,
      from,
      box: from ?? boxFromPoints(start, start, current.anchor, size),
    });
  };
  const onPreviewMove = (e: PointerEvent<HTMLElement>): void => {
    if (!drag || !current?.anchor) return;
    const point = regionPoint(e, e.currentTarget);
    const size: [number, number] = [current.region[2], current.region[3]];
    const [ax, ay] = current.anchor;
    const box =
      drag.mode === "move" && drag.from
        ? moveBox(
            drag.from,
            point[0] - drag.start[0],
            point[1] - drag.start[1],
            current.anchor,
            size,
          )
        : drag.mode === "resize" && drag.from
          ? boxFromPoints([ax + drag.from.x, ay + drag.from.y], point, current.anchor, size)
          : boxFromPoints(drag.start, point, current.anchor, size);
    setDrag({ ...drag, box });
  };
  const onPreviewUp = (e: PointerEvent<HTMLElement>): void => {
    if (!drag) return;
    setDrag(null);
    // A bare click (under DRAW_MIN_DRAG region pixels) draws nothing: it only selects.
    const [x, y] = regionPoint(e, e.currentTarget);
    if (
      drag.mode === "draw" &&
      Math.max(Math.abs(x - drag.start[0]), Math.abs(y - drag.start[1])) < DRAW_MIN_DRAG
    ) {
      setBoxSel(null);
      return;
    }
    if (drag.from && boxText(drag.from) === boxText(drag.box)) return;
    const label =
      drag.mode === "draw"
        ? `Draw ${drag.ref.type}`
        : drag.mode === "move"
          ? "Move box"
          : "Resize box";
    writeBox(label, drag.ref, drag.box);
  };

  return (
    <Panel data-testid="clip-editor">
      <PanelScroll>
        <SectionTitle>Sheet</SectionTitle>
        <Grid2>
          <Field label="Sprite sheet">
            <FieldSelect value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
              <option value="">Choose a sliced sheet…</option>
              {sheets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.id}
                </option>
              ))}
            </FieldSelect>
          </Field>
          <Field label="Animation asset">
            <FieldSelect value={animId} onChange={(e) => setAnimId(e.target.value)}>
              {bound.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.id}
                </option>
              ))}
              {!anim && sheetId && <option value={newAnimId}>{newAnimId} (new)</option>}
            </FieldSelect>
          </Field>
        </Grid2>
        {sheets.length === 0 && (
          <PanelNote>Slice a sprite sheet first (File → Slice Sheet…).</PanelNote>
        )}
        <PanelActions>
          <ActionButton
            disabled={!anim || isPlayer}
            onClick={() => setPlayerAnimation(editor.store, projectSession, animId)}
          >
            {isPlayer ? "Player animation" : "Use as player animation"}
          </ActionButton>
        </PanelActions>

        {sheet && (
          <>
            <SectionTitle divider>Regions</SectionTitle>
            <Strip>
              {regions.map((entry, i) => {
                const on = regionSel.includes(i);
                return (
                  <Tile
                    key={entry.id}
                    type="button"
                    aria-label={`Region ${i + 1}`}
                    aria-pressed={on}
                    onClick={() =>
                      setRegionSel(on ? regionSel.filter((r) => r !== i) : [...regionSel, i])
                    }
                  >
                    <RegionView sheet={sheet} region={entry.region} zoom={1} />
                    {i + 1}
                  </Tile>
                );
              })}
            </Strip>
            <Grid2>
              <Field label="Clip name">
                <FieldInput
                  list="clip-names"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </Field>
              <Field label="Default duration">
                <FieldSelect value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
                  {DURATION_PRESETS.map((entry, i) => (
                    <option key={entry.label} value={i}>
                      {entry.label}
                    </option>
                  ))}
                </FieldSelect>
              </Field>
            </Grid2>
            <datalist id="clip-names">
              {required
                .filter((name) => !clips[name])
                .map((name) => (
                  <option key={name} value={name} />
                ))}
            </datalist>
            <PanelActions>
              <ActionButton
                disabled={!newName.trim() || !!clips[newName.trim()] || regionSel.length === 0}
                onClick={createClip}
              >
                Create clip
              </ActionButton>
              <ActionButton
                disabled={!clip || regionSel.length === 0}
                onClick={() => {
                  writeFrames("Add frames", [...frames, ...pickedFrames()]);
                  setRegionSel([]);
                }}
              >
                Add frames
              </ActionButton>
            </PanelActions>
          </>
        )}

        <SectionTitle divider>Clip</SectionTitle>
        <Grid2>
          <Field label="Clip">
            <FieldSelect value={clip ? clipName : ""} onChange={(e) => setClipName(e.target.value)}>
              <option value="">Choose a clip…</option>
              {Object.keys(clips).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </FieldSelect>
          </Field>
          <Field label="Loop start">
            <FieldInput
              type="number"
              min={0}
              disabled={!clip?.loop}
              value={clip?.loopStart ?? 0}
              onChange={(e) => {
                const value = int(e.target.value, 0);
                if (clip && value !== null && value < frames.length)
                  writeClip("Set loop start", { ...clip, loopStart: value });
              }}
            />
          </Field>
        </Grid2>
        {clip && (
          <>
            <chakra.div display="flex" gap="3" alignItems="center" py="1" px="3.5">
              <Checkbox
                label="Loop"
                checked={clip.loop}
                onCheckedChange={(loop) =>
                  writeClip(loop ? "Loop clip" : "Play clip once", { ...clip, loop })
                }
              />
              <ActionButton
                disabled={!canDeleteClip(Object.keys(clips).length, isPlayer)}
                title={
                  canDeleteClip(Object.keys(clips).length, isPlayer)
                    ? undefined
                    : "The player animation needs at least one clip: bind another asset first."
                }
                onClick={() => {
                  const { [clipName]: _removed, ...rest } = clips;
                  writeAll("Delete clip", rest);
                }}
              >
                Delete clip
              </ActionButton>
            </chakra.div>

            <SectionTitle divider>
              Timeline <span data-testid="frame-count">{frames.length}</span>
            </SectionTitle>
            <Strip>
              {frames.map((frame, i) => {
                const on = frameSel.includes(i);
                return (
                  <chakra.div key={i} display="flex" flexDirection="column" gap="1" w="60px">
                    <Tile
                      type="button"
                      aria-label={`Frame ${i + 1}`}
                      aria-pressed={on}
                      borderColor={playing && playFrame === i ? "studio.warning" : undefined}
                      onClick={(e) =>
                        setFrameSel(
                          e.shiftKey || e.ctrlKey
                            ? on
                              ? frameSel.filter((f) => f !== i)
                              : [...frameSel, i]
                            : [i],
                        )
                      }
                    >
                      {sheet && <RegionView sheet={sheet} region={frame.region} zoom={1} />}
                      {i + 1}
                    </Tile>
                    <FieldInput
                      type="number"
                      min={1}
                      aria-label={`Frame ${i + 1} duration`}
                      title="Duration in 1/60 s"
                      value={frame.duration}
                      onChange={(e) => {
                        const duration = int(e.target.value, 1);
                        if (duration !== null)
                          writeFrames(
                            "Set frame duration",
                            frames.map((f, j) => (j === i ? { ...f, duration } : f)),
                          );
                      }}
                    />
                  </chakra.div>
                );
              })}
            </Strip>
            <PanelActions flexWrap="wrap">
              <ActionButton
                disabled={frameSel.length !== 1 || frameSel[0] === 0}
                onClick={() => {
                  writeFrames("Move frame", moveItem(frames, frameSel[0]!, frameSel[0]! - 1));
                  setFrameSel([frameSel[0]! - 1]);
                }}
              >
                Move left
              </ActionButton>
              <ActionButton
                disabled={frameSel.length !== 1 || frameSel[0] === frames.length - 1}
                onClick={() => {
                  writeFrames("Move frame", moveItem(frames, frameSel[0]!, frameSel[0]! + 1));
                  setFrameSel([frameSel[0]! + 1]);
                }}
              >
                Move right
              </ActionButton>
              <ActionButton
                disabled={frameSel.length === 0}
                onClick={() =>
                  writeFrames(
                    "Duplicate frames",
                    frames.flatMap((f, i) => (frameSel.includes(i) ? [f, { ...f }] : [f])),
                  )
                }
              >
                Duplicate
              </ActionButton>
              <ActionButton
                disabled={frameSel.length === 0 || frameSel.length === frames.length}
                onClick={() => {
                  writeFrames(
                    "Remove frames",
                    frames.filter((_, i) => !frameSel.includes(i)),
                  );
                  setFrameSel([]);
                }}
              >
                Remove
              </ActionButton>
            </PanelActions>

            <SectionTitle divider>Preview</SectionTitle>
            <Grid2>
              <Field label="Speed">
                <FieldSelect value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </FieldSelect>
              </Field>
              <chakra.div display="flex" alignItems="flex-end" gap="2">
                <ActionButton onClick={() => setPlaying(!playing)}>
                  {playing ? "Stop preview" : "Preview"}
                </ActionButton>
                <ActionButton
                  disabled={!sheet || targets.length === 0}
                  onClick={() =>
                    sheet &&
                    setAnchors("Align feet", (frame) =>
                      feetAnchor(sheet.px, sheet.width, frame.region),
                    )
                  }
                >
                  Align feet
                </ActionButton>
              </chakra.div>
            </Grid2>
            <Grid2>
              <Field label="Preview tool">
                <FieldSelect value={tool} onChange={(e) => setTool(e.target.value as PreviewTool)}>
                  <option value="anchor">Set feet (anchor)</option>
                  <option value="hurtbox">Draw hurtbox</option>
                  <option value="hitbox">Draw hitbox</option>
                </FieldSelect>
              </Field>
            </Grid2>
            <chakra.div px="3.5" py="1" fontSize="xs" color="studio.fgTertiary">
              Anchor{" "}
              <span data-testid="frame-anchor">
                {current?.anchor ? current.anchor.join(", ") : "none"}
              </span>{" "}
              ·{" "}
              {tool === "anchor"
                ? "click the preview to set the feet of the selected frames"
                : current && !current.anchor
                  ? "set this frame's feet first: boxes are measured from them"
                  : "drag on the preview to draw; drag a box to move it, its corner to resize it"}
            </chakra.div>
            {tool !== "anchor" && current && (
              <>
                <chakra.div px="3.5" py="1" fontSize="xs" color="studio.fgTertiary">
                  Hurtbox{" "}
                  <span data-testid="frame-hurtbox">
                    {current.hurtbox ? boxText(current.hurtbox) : "none"}
                  </span>{" "}
                  · Hitboxes{" "}
                  <span data-testid="frame-hitboxes">
                    {hitboxes.length > 0 ? hitboxes.map(boxText).join(" | ") : "none"}
                  </span>
                </chakra.div>
                <PanelActions flexWrap="wrap">
                  <ActionButton
                    disabled={!selectedBox}
                    onClick={() => {
                      if (!boxSel) return;
                      writeBox("Delete box", boxSel, null);
                      setBoxSel(null);
                    }}
                  >
                    Delete box
                  </ActionButton>
                  <ActionButton
                    disabled={shown >= frames.length - 1}
                    onClick={() =>
                      writeFrames("Copy boxes to next frame", copyBoxes(frames, shown, [shown + 1]))
                    }
                  >
                    Copy boxes to next frame
                  </ActionButton>
                  <ActionButton
                    disabled={frames.length < 2}
                    onClick={() =>
                      writeFrames(
                        "Copy boxes to all frames",
                        copyBoxes(
                          frames,
                          shown,
                          frames.map((_, i) => i),
                        ),
                      )
                    }
                  >
                    Copy boxes to all frames
                  </ActionButton>
                </PanelActions>
              </>
            )}
            {sheet && current && (
              <chakra.div px="3.5" pb="3">
                <chakra.div
                  data-testid="clip-preview"
                  position="relative"
                  bg="studio.raised"
                  cursor="crosshair"
                  touchAction="none"
                  style={{
                    width: current.region[2] * PREVIEW_ZOOM,
                    height: current.region[3] * PREVIEW_ZOOM,
                  }}
                  onPointerDown={(e) => {
                    const ref: BoxRef =
                      tool === "hurtbox"
                        ? { type: "hurtbox" }
                        : { type: "hitbox", index: hitboxes.length };
                    startDrag(e, "draw", ref, null);
                  }}
                  onPointerMove={onPreviewMove}
                  onPointerUp={onPreviewUp}
                  onPointerCancel={() => setDrag(null)}
                  onClick={(e) => {
                    if (tool !== "anchor") return;
                    const box = e.currentTarget.getBoundingClientRect();
                    const x = Math.floor((e.clientX - box.left) / PREVIEW_ZOOM);
                    const y = Math.floor((e.clientY - box.top) / PREVIEW_ZOOM);
                    setAnchors("Set anchor", (frame) => [
                      Math.max(0, Math.min(x, frame.region[2])),
                      Math.max(0, Math.min(y, frame.region[3])),
                    ]);
                  }}
                >
                  {/* Onion skin: the previous frame, its anchor laid on this one's. */}
                  {previous && !playing && (
                    <RegionView
                      sheet={sheet}
                      region={previous.region}
                      zoom={PREVIEW_ZOOM}
                      style={{
                        position: "absolute",
                        opacity: 0.3,
                        pointerEvents: "none",
                        left: (anchorAt(current)[0] - anchorAt(previous)[0]) * PREVIEW_ZOOM,
                        top: (anchorAt(current)[1] - anchorAt(previous)[1]) * PREVIEW_ZOOM,
                      }}
                    />
                  )}
                  <RegionView
                    sheet={sheet}
                    region={current.region}
                    zoom={PREVIEW_ZOOM}
                    style={{ position: "absolute", pointerEvents: "none" }}
                  />
                  {current.anchor && (
                    <chakra.div
                      aria-hidden
                      position="absolute"
                      w="9px"
                      h="9px"
                      ml="-4px"
                      mt="-4px"
                      border="2px solid"
                      borderColor="studio.accent"
                      rounded="full"
                      pointerEvents="none"
                      style={{
                        left: current.anchor[0] * PREVIEW_ZOOM,
                        top: current.anchor[1] * PREVIEW_ZOOM,
                      }}
                    />
                  )}
                  {/* Boxes from the feet, as the engine reads them (the frame as drawn). */}
                  {current.anchor &&
                    shownBoxes.map(({ ref, box }) => {
                      const selected = sameRef(boxSel, ref);
                      const color = BOX_COLORS[ref.type];
                      const id = ref.type === "hurtbox" ? "hurtbox" : `hitbox-${ref.index}`;
                      // Only boxes of the tool's type are grabbed: a hitbox can be drawn over the hurtbox.
                      const grabbable = boxing && ref.type === tool;
                      return (
                        <chakra.div
                          key={id}
                          data-testid={`box-${id}`}
                          position="absolute"
                          boxSizing="border-box"
                          cursor={grabbable ? "move" : undefined}
                          pointerEvents={grabbable ? "auto" : "none"}
                          style={{
                            left: (current.anchor![0] + box.x) * PREVIEW_ZOOM,
                            top: (current.anchor![1] + box.y) * PREVIEW_ZOOM,
                            width: box.w * PREVIEW_ZOOM,
                            height: box.h * PREVIEW_ZOOM,
                            border: `${selected ? 2 : 1}px ${selected ? "dashed" : "solid"} ${color}`,
                            background: `${color}33`,
                          }}
                          onPointerDown={(e) => startDrag(e, "move", ref, boxAt(ref) ?? null)}
                        >
                          {selected && grabbable && (
                            <chakra.div
                              aria-hidden
                              data-testid="box-resize"
                              position="absolute"
                              right="-4px"
                              bottom="-4px"
                              w="7px"
                              h="7px"
                              cursor="nwse-resize"
                              style={{ background: color }}
                              onPointerDown={(e) => startDrag(e, "resize", ref, boxAt(ref) ?? null)}
                            />
                          )}
                        </chakra.div>
                      );
                    })}
                </chakra.div>
              </chakra.div>
            )}
          </>
        )}
      </PanelScroll>
    </Panel>
  );
}
