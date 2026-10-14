// Shared gate for the Zero × MMX oracle tests: they compare the TS readers with zero-x-mashup's Python cache
// (`$ZERO_X_MASHUP_ROOT/game/cache`, default ../zero-x-mashup) built from the user's own Steam installs.
// Neither is committed, so on CI they skip, loudly, with the reason.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TestContext } from "node:test";

import { findSteamGame, type SteamGame } from "../../src/project-io/node.js";

export const ZERO_X_MASHUP_ROOT = resolve(process.env.ZERO_X_MASHUP_ROOT ?? "../zero-x-mashup");

/** The located install and zero-x-mashup root, or null after a visible skip naming what is missing. */
export async function oracle(t: TestContext, game: SteamGame, cacheFiles: string[] = []): Promise<{ install: string; root: string; cache: string } | null> {
  const install = await findSteamGame(game);
  const cache = join(ZERO_X_MASHUP_ROOT, "game", "cache");
  const missing = cacheFiles.filter((f) => !existsSync(join(cache, f)));
  const reasons = [
    ...(install.ok ? [] : [install.error]),
    ...(missing.length ? [`oracle cache missing ${missing.join(", ")} in ${cache} (ZERO_X_MASHUP_ROOT=${process.env.ZERO_X_MASHUP_ROOT ?? "unset"}; run python game/build_cache.py there)`] : []),
  ];
  if (install.ok && !reasons.length) return { install: install.root, root: ZERO_X_MASHUP_ROOT, cache };
  const reason = reasons.join("; ");
  console.warn(`[oracle] SKIPPED "${t.name}": ${reason}`);
  t.skip(reason);
  return null;
}
