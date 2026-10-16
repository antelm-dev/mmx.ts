import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";
import { encodePng } from "../src/project-io/import/png";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// The fixture stripped of every asset (and the bindings to them): nothing to open yet.
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-asset-start-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });
const manifestPath = join(projectRoot, "project.json");
writeFileSync(
  manifestPath,
  JSON.stringify({ ...JSON.parse(readFileSync(manifestPath, "utf8")), assets: [] }, null, 2),
);
writeFileSync(
  join(projectRoot, "game/data.json"),
  JSON.stringify({
    schemaVersion: 1,
    bindings: {
      sounds: {},
      enemyAnimations: {},
      pickupAnimations: {},
      shotAnimations: {},
      hudSprites: {},
    },
  }),
);
// 64×32 synthetic sheet: two 32×32 cells, a 20×24 figure in each.
const sheetDir = mkdtempSync(join(tmpdir(), "mmx-asset-start-png-"));
const sheetPath = join(sheetDir, "sheet.png");
const px = new Uint8Array(64 * 32 * 4);
for (let f = 0; f < 2; f++)
  for (let y = 4; y < 28; y++)
    for (let x = f * 32 + 6; x < f * 32 + 26; x++) px.set([40, 160, 220, 255], (y * 64 + x) * 4);
writeFileSync(sheetPath, encodePng({ width: 64, height: 32, px }));

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(sheetDir, { recursive: true, force: true });
});

test("from a project with no assets, Assets imports a sheet, slices it and creates an animation", async () => {
  const env = { ...process.env };
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

  const pick = (path: string) =>
    app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, path);
  const importSheet = page.getByRole("button", { name: "Import sprite sheet…" });
  const newAnimation = page.getByRole("button", { name: "New animation…" });
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });

  // Without a project both ways in are disabled, with a hint.
  await page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Assets" })
    .click();
  await expect(importSheet).toBeDisabled();
  await expect(importSheet).toHaveAttribute("title", "Open a project first");
  await expect(newAnimation).toBeDisabled();

  await pick(projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  await expect(page.locator("[data-asset-kind]:not([data-asset-kind=enemy])")).toHaveCount(0);

  // Import: the new sprite opens in its slicer tab; slice it on its grid.
  await pick(sheetPath);
  await importSheet.click();
  await expect(tab("sprite.sheet")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.sheet");
  await page.getByLabel("Mode").selectOption("grid");
  await page.getByRole("button", { name: "Apply grid" }).click();
  await expect(page.getByTestId("region-count")).toHaveText("2");
  await page.getByRole("button", { name: "Save regions" }).click();

  // New animation: pick the sheet, create a clip; the animation's own tab takes over.
  await newAnimation.click();
  await expect(tab("New animation")).toHaveAttribute("aria-selected", "true");
  const panel = page.getByTestId("clip-editor");
  await panel.getByLabel("Sprite sheet").selectOption("sprite.sheet");
  await expect(panel.getByLabel("Animation asset")).toHaveValue("anim.sheet");
  await panel.getByRole("button", { name: "Region 1", exact: true }).click();
  await panel.getByRole("button", { name: "Region 2", exact: true }).click();
  await panel.getByLabel("Clip name").fill("walk");
  await panel.getByRole("button", { name: "Create clip" }).click();
  await expect(tab("anim.sheet")).toHaveAttribute("aria-selected", "true");
  await expect(tab("New animation")).toHaveCount(0);
  await expect(panel.getByLabel("Clip", { exact: true })).toHaveValue("walk");
  await expect(panel.getByTestId("frame-count")).toHaveText("2");
  await expect(page.locator('[data-asset-id="anim.sheet"]')).toBeVisible();

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const byId = (id: string) => manifest.assets.find((asset: { id: string }) => asset.id === id);
  expect(byId("sprite.sheet").regions).toHaveLength(2);
  expect(byId("anim.sheet")).toMatchObject({ kind: "animation", sheetAssetId: "sprite.sheet" });
  expect(byId("anim.sheet").animations.walk.frames).toHaveLength(2);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
