/**
 * The engine's typed, compiled, data-driven gameplay content.
 *
 * Authoring surface: {@link defineGameData} + the per-category definition tables.
 * Compilation: {@link compileGameData} → {@link CompiledGameData}. Runtime code
 * reads the compiled form; the compat constants (core/constants) and the default
 * loadout/enemy/weapon builders read {@link COMPILED_GAME_DATA}.
 */
export * from "./types.js";
export * from "./gameData.js";
export * from "./compileGameData.js";
export * from "./hash.js";
export { DEFAULT_COMPILE_REGISTRIES } from "./defaultRegistries.js";

import { GAME_DATA } from "./gameData.js";
import { compileGameData } from "./compileGameData.js";
import { buildCompileRegistries } from "../behaviors/index.js";
import type { CompiledGameData } from "./types.js";

/**
 * The default game data, compiled once at module load against the engine's real
 * behaviour registries (Part 4). This is the single compiled instance the runtime
 * and the compat constants share — compilation is never run per frame (Part 14).
 *
 * Compiling against the real registries means an unknown behaviour id or a
 * malformed ability config here is a build-time error, not a silent mismatch.
 * Compilation failure throws rather than degrading.
 */
export const COMPILED_GAME_DATA: CompiledGameData = (() => {
  const result = compileGameData(GAME_DATA, buildCompileRegistries());
  if (!result.ok) {
    const errors = result.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => `${d.code} ${d.fieldPath ?? d.definitionId ?? ""}: ${d.message}`)
      .join("\n  ");
    throw new Error(`default game data failed to compile:\n  ${errors}`);
  }
  return result.value;
})();
