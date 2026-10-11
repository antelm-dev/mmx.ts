import { defineConfig } from "@playwright/test";

/**
 * Electron end-to-end smoke tests. They launch the *built* app (run
 * `pnpm build` first), so the main entry at `out/main` and
 * the bundled renderer both exist.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: {
    // 0.02% of a 1280x800 shot (~200 px): room for a few anti-aliased glyph edges, while a
    // changed icon, a 1px border along a panel or a recoloured control is larger than that.
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.0002 },
  },
});
