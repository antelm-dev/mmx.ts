/**
 * The engine's content-compilation surface: turning authored {@link LevelData}
 * into a runtime, and the structured diagnostics that come out of it. Grouped
 * under `@mmx/engine/content` so authoring tools import the compiler without
 * reaching into `game/level.js`.
 */
export {
  compileLevel,
  loadLevel,
  LevelCompileError,
  type EngineDiagnostic,
  type CompileLevelResult,
  type LevelRuntime,
  type EnemySpawn,
} from "../game/level.js";
export type { RuntimeIdentity } from "../game/Identity.js";
