export type Region = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
];

export interface FrameData {
  region: Region;
  armRegion?: Region;
  duration: number;
}

export interface ClipData {
  loop: boolean;
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
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
