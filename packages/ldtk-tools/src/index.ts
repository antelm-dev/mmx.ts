export {
  TILE,
  bakeSlope,
  slopeRects,
  applySlopes,
  type SlopeRect,
  type SlopeProfile,
  type SlopeMap,
  type BakedTile,
  type LevelEntityLike,
} from "./slopeBake.js";

export { convert, emit, type ConvertedLevel } from "./importLdtk.js";
export { buildStage1Project } from "./exportLdtk.js";

export type * from "./ldtkTypes.js";
