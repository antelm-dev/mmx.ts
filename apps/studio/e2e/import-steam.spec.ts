import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

import { writeZeroFixtureCache } from "../tests/project-io/zeroFixture.js";

const appRoot = resolve(__dirname, "..");

let app: ElectronApplication;
let tmp: string;

test.afterAll(async () => {
  await app?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test("File → Import from Steam installs builds the Zero project and opens it", async () => {
  tmp = mkdtempSync(join(tmpdir(), "mmx-import-e2e-"));
  const cache = join(tmp, "cache");
  const out = join(tmp, "out");
  await writeZeroFixtureCache(cache);
  mkdirSync(out);

  const env = { ...process.env, MMX_STUDIO_ZERO_IMPORT_CACHE: cache }; // synthetic readers' output
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js")],
    cwd: appRoot,
    env,
  });
  const page = await app.firstWindow();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, out);

  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Import from Steam installs/ }).click();
  await expect(page.getByText(/Imported project 'Zero x MMX - Intro Highway'/)).toBeVisible({ timeout: 30_000 });

  const manifest = JSON.parse(readFileSync(join(out, "project.json"), "utf8"));
  expect(manifest.player).toEqual({ loadout: "player.zero" });
  expect(existsSync(join(out, "assets/sprites/player/zero.png"))).toBe(true);
  expect(readFileSync(join(out, ".gitignore"), "utf8")).toContain("never commit");
  const level = JSON.parse(readFileSync(join(out, "levels/level.intro-highway.json"), "utf8"));
  expect(level.objects.filter((o: { definitionId: string }) => o.definitionId === "enemy.pantheon")).toHaveLength(2);

  // The imported project plays as Zero, with its Pantheons.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  await expect(page.locator("[data-player-loadout]")).toHaveAttribute("data-player-loadout", "player.zero");
  await page.getByRole("button", { name: /^Stop$/ }).click();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
