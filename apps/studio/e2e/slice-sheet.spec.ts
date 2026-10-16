import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";
import { encodePng } from "../src/project-io/import/png";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// Import and save write into the project, so work on a scratch copy of the fixture.
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-slice-sheet-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });
const sheetDir = mkdtempSync(join(tmpdir(), "mmx-slice-png-"));
const sheetPath = join(sheetDir, "sheet.png");

/** 128×64 synthetic sheet: a 4×2 grid of 32×32 cells, a 20×20 frame in each of the first six. */
function writeSheet(): void {
  const width = 128;
  const height = 64;
  const px = new Uint8Array(width * height * 4);
  for (let f = 0; f < 6; f++) {
    const cx = (f % 4) * 32 + 4;
    const cy = Math.floor(f / 4) * 32 + 4;
    for (let y = cy; y < cy + 20; y++)
      for (let x = cx; x < cx + 20; x++) px.set([40, 160, 220, 255], (y * width + x) * 4);
  }
  writeFileSync(sheetPath, encodePng({ width, height, px }));
}

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(sheetDir, { recursive: true, force: true });
});

test("a PNG sheet is sliced on a grid, retouched, and its regions are saved on the sprite", async () => {
  writeSheet();
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

  await pick(projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  // Assets → double-click a sprite opens it in a Sheet Slicer tab.
  await page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Assets" })
    .click();
  await page.locator('[data-asset-kind][title="sprite.bg"]').dblclick();
  await expect(page.getByRole("tab", { name: "sprite.bg" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.bg");
  await pick(sheetPath);
  // Importing opens the new sprite in its own tab; the sprite.bg tab keeps sprite.bg.
  await page.getByRole("button", { name: /Import sheet/ }).click();
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });
  await expect(tab("sprite.sheet")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.sheet");
  await tab("sprite.bg").click();
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.bg");
  // The picker opens the picked sprite's tab instead of retargeting this one.
  await page.getByLabel("Sprite asset").selectOption("sprite.sheet");
  await expect(tab("sprite.sheet")).toHaveAttribute("aria-selected", "true");
  await expect(tab("sprite.sheet")).toHaveCount(1);
  await tab("sprite.bg").click();
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.bg");
  await tab("sprite.sheet").click();
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.sheet");

  const count = page.getByTestId("region-count");
  const regions = page.locator("[data-region]");
  // Auto mode: six frames.
  await page.getByRole("button", { name: "Detect regions" }).click();
  await expect(count).toHaveText("6");

  await page.getByLabel("Mode").selectOption("grid");
  await page.getByLabel("Cell width").fill("32");
  await page.getByLabel("Cell height").fill("32");
  await page.getByRole("button", { name: "Apply grid" }).click();
  await expect(count).toHaveText("8");
  await expect(regions).toHaveCount(8);

  // Merge the first two cells, then split them back into their two frames.
  await page.getByRole("button", { name: "Region 1", exact: true }).click();
  await page.getByRole("button", { name: "Region 2", exact: true }).click();
  await page.getByRole("button", { name: "Merge" }).click();
  await expect(count).toHaveText("7");
  await page.getByRole("button", { name: "Region 1", exact: true }).click();
  await page.getByRole("button", { name: "Split" }).click();
  await expect(count).toHaveText("8");

  // Back to the plain grid, then save the regions and the project.
  await page.getByRole("button", { name: "Apply grid" }).click();
  await page.getByRole("button", { name: "Save regions" }).click();
  await page.getByRole("button", { name: "File menu" }).click();
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();
  await page.getByRole("menuitem", { name: /^Save/ }).click();
  await expect(page.getByText("Project saved.")).toBeVisible();

  const manifest = JSON.parse(readFileSync(join(projectRoot, "project.json"), "utf8"));
  const sheet = manifest.assets.find((asset: { id: string }) => asset.id === "sprite.sheet");
  expect(sheet.kind).toBe("sprite");
  expect(sheet.regions).toHaveLength(8);
  expect(sheet.regions[0]).toEqual({ id: "frame.0", region: [0, 0, 32, 32] });
  expect(sheet.regions[7]).toEqual({ id: "frame.7", region: [96, 32, 32, 32] });

  // A malformed list (duplicate id) is reported by the schema in Problems when reopened.
  sheet.regions[1].id = "frame.0";
  writeFileSync(join(projectRoot, "project.json"), JSON.stringify(manifest, null, 2));
  await pick(projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await page.getByRole("tab", { name: /^Problems/ }).click();
  await expect(page.getByRole("cell", { name: "sprite.regions" })).toBeVisible();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
