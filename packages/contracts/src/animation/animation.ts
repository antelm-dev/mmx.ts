export type Region = readonly [x: number, y: number, width: number, height: number];

/**
 * A gameplay box on a frame, in pixels: `x, y` is its top-left measured from the
 * body's feet (the frame `anchor`), `w, h` its size — drawn as authored (the frame
 * unflipped), y down, and mirrored with the sprite. Same convention as a
 * `player.slash` hitbox.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameData {
  region: Region;
  armRegion?: Region;
  duration: number;
  /**
   * Pixel in `region` (from its top-left) drawn on the body's feet, centred on pos.x.
   * Absent: the frame sits in the renderer's fixed cell. Shared by `armRegion`.
   */
  anchor?: readonly [x: number, y: number];
  /** Replaces the actor's definition hurtbox while this frame shows. */
  hurtbox?: Box;
  /** Contact-damage volumes live while this frame shows (enemies). */
  hitboxes?: Box[];
}

export interface ClipData {
  loop: boolean;
  /** Frame a looping clip wraps back to (default 0); ignored when not looping. */
  loopStart?: number;
  speed: number;
  frames: FrameData[];
}

export interface AnimData {
  animations: Record<string, ClipData>;
}

export function assertRegion(value: unknown, label = "region"): asserts value is Region {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((part) => Number.isInteger(part)) ||
    value[0] < 0 ||
    value[1] < 0 ||
    value[2] <= 0 ||
    value[3] <= 0
  ) {
    throw new Error(`${label}: expected non-negative integer coordinates and positive dimensions`);
  }
}

export function assertAnimData(data: unknown, label = "animation data"): asserts data is AnimData {
  if (!isRecord(data) || !isRecord(data.animations)) {
    throw new Error(`${label}: expected an animations object`);
  }
  if (Object.keys(data.animations).length === 0) {
    throw new Error(`${label}: must contain at least one animation`);
  }
  for (const [name, value] of Object.entries(data.animations)) {
    const clipLabel = `${label}: animation '${name}'`;
    if (!isRecord(value) || typeof value.loop !== "boolean" || !Array.isArray(value.frames)) {
      throw new Error(`${label}: animation '${name}' is malformed`);
    }
    if (!Number.isFinite(value.speed) || Number(value.speed) <= 0) {
      throw new Error(`${clipLabel}: speed must be greater than zero`);
    }
    if (value.frames.length === 0) {
      throw new Error(`${clipLabel}: must contain at least one frame`);
    }
    if (
      value.loopStart !== undefined &&
      (!Number.isInteger(value.loopStart) ||
        Number(value.loopStart) < 0 ||
        Number(value.loopStart) >= value.frames.length)
    ) {
      throw new Error(`${clipLabel}: loopStart must be an integer frame index`);
    }
    value.frames.forEach((frame, index) => {
      if (!isRecord(frame)) {
        throw new Error(`${label}: animation '${name}' frame ${index} is malformed`);
      }
      if (!Number.isFinite(frame.duration) || Number(frame.duration) <= 0) {
        throw new Error(`${clipLabel}: frame ${index} duration must be greater than zero`);
      }
      assertRegion(frame.region, `${label}: animation '${name}' frame ${index} region`);
      if (frame.armRegion !== undefined) {
        assertRegion(frame.armRegion, `${label}: animation '${name}' frame ${index} armRegion`);
      }
      if (frame.anchor !== undefined && !isAnchorIn(frame.anchor, frame.region as Region)) {
        throw new Error(`${clipLabel}: frame ${index} anchor must be integers inside its region`);
      }
      if (frame.hurtbox !== undefined && !isBox(frame.hurtbox)) {
        throw new Error(`${clipLabel}: frame ${index} hurtbox ${BOX_RULE}`);
      }
      if (
        frame.hitboxes !== undefined &&
        (!Array.isArray(frame.hitboxes) || !frame.hitboxes.every(isBox))
      ) {
        throw new Error(
          `${clipLabel}: frame ${index} hitboxes must be an array of boxes that each ${BOX_RULE}`,
        );
      }
    });
  }
}

const BOX_RULE = "must be { x, y, w, h } integers with positive w and h";

/** `{ x, y, w, h }` integers with positive size; x/y may be negative (above/behind the feet). */
export function isBox(value: unknown): value is Box {
  return (
    isRecord(value) &&
    [value.x, value.y, value.w, value.h].every((part) => Number.isInteger(part)) &&
    Number(value.w) > 0 &&
    Number(value.h) > 0
  );
}

/** `[x, y]` integers with 0 <= x <= width and 0 <= y <= height of `region`. */
function isAnchorIn(value: unknown, region: Region): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => Number.isInteger(part)) &&
    value[0] >= 0 &&
    value[0] <= region[2] &&
    value[1] >= 0 &&
    value[1] <= region[3]
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
