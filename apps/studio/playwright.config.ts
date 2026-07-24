import { defineConfig } from "@playwright/test";

/**
 * Electron end-to-end smoke tests. They launch the *built* app (run
 * `pnpm --filter @mmx/studio build` first), so the main entry at `out/main` and
 * the bundled renderer both exist.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
