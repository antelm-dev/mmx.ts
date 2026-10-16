import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";
import { encodePng } from "../src/project-io/import/png";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// The import copies the PNG into the project; the second copy is the "other project".
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-tileset-doc-"));
const otherRoot = mkdtempSync(join(tmpdir(), "mmx-tileset-doc-other-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });
cpSync(fixtureRoot, otherRoot, { recursive: true });

// Synthetic 4x2 tileset of 16 px tiles, outside the project.
const sourceDir = mkdtempSync(join(tmpdir(), "mmx-tileset-doc-src-"));
const tilesetPath = join(sourceDir, "ground.png");
const px = new Uint8Array(64 * 32 * 4);
for (let i = 0; i < 64 * 32; i++) px.set([40 + (i % 64) * 3, 120, 90, 255], i * 4);
writeFileSync(tilesetPath, encodePng({ width: 64, height: 32, px }));

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  for (const dir of [projectRoot, otherRoot, sourceDir]) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-TILESET: the tileset editor is a document tab and its edits undo with Ctrl+Z", async () => {
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
  const canvas = page.locator("#viewport-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  const pick = (path: string) =>
    app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, path);
  const openProject = async (root: string) => {
    await pick(root);
    await page.getByRole("button", { name: "File menu" }).click();
    await page.getByRole("menuitem", { name: /Open Project/ }).click();
    await expect(page.getByText(/Opened project 'Fixture Project'/).last()).toBeVisible();
  };

  await openProject(projectRoot);
  await page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Layers" })
    .click();
  await pick(tilesetPath);
  await page.getByRole("button", { name: /Import tileset/ }).click();
  await expect(page.locator("[data-tile-layer]")).toHaveCount(1);
  const tilesetId = (await page.locator("[data-tile-layer] [title]").getAttribute("title"))!;

  // The layer row opens the tileset as a tab beside Level, covering the level view.
  const editTileset = page.getByRole("button", { name: "Edit tileset" });
  const levelTab = page.getByRole("tab", { name: "Level", exact: true });
  const tilesetTab = page.getByRole("tab", { name: tilesetId });
  await editTileset.click();
  await expect(tilesetTab).toHaveAttribute("aria-selected", "true");
  await expect(canvas).toBeHidden();
  // Opening it again surfaces the same tab.
  await levelTab.click();
  await expect(canvas).toBeVisible();
  await editTileset.click();
  await expect(tilesetTab).toHaveCount(1);
  await expect(tilesetTab).toHaveAttribute("aria-selected", "true");

  // Collision: set, Ctrl+Z restores it, Ctrl+Y sets it again (focus stays in the tab).
  // Scoped: the Layers panel shows the paint layer's tile picker too.
  const doc = page.getByTestId("tileset-document");
  const tile = (i: number) => doc.getByRole("button", { name: `Tile ${i}`, exact: true });
  const collision = page.getByRole("group", { name: "Tile collision" });
  await expect(doc.locator("[data-tile]")).toHaveCount(8);
  await tile(0).click();
  await collision.getByRole("button", { name: "Solid", exact: true }).click();
  await expect(tile(0)).toHaveAttribute("data-collision", "1");
  await page.keyboard.press("Control+z");
  await expect(tile(0)).toHaveAttribute("data-collision", "0");
  await page.keyboard.press("Control+y");
  await expect(tile(0)).toHaveAttribute("data-collision", "1");

  // Slope with a profile, then the tile size: each one undo step.
  await tile(1).click();
  await page.getByLabel("Slope left (px)").fill("4");
  await page.getByLabel("Slope right (px)").fill("12");
  await collision.getByRole("button", { name: "Slope /", exact: true }).click();
  await expect(tile(1)).toHaveAttribute("data-collision", "2");
  const tileSize = page.getByLabel("Tile size (px)");
  await tileSize.fill("32");
  await tileSize.blur();
  await expect(doc.locator("[data-tile]")).toHaveCount(2);
  await expect(tile(0)).toHaveAttribute("data-collision", "0");
  await collision.getByRole("button", { name: "Empty", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await expect(doc.locator("[data-tile]")).toHaveCount(8);
  await expect(tile(0)).toHaveAttribute("data-collision", "1");
  await page.keyboard.press("Control+z");
  await expect(tile(1)).toHaveAttribute("data-collision", "0");
  await page.keyboard.press("Control+y");
  await expect(tile(1)).toHaveAttribute("data-collision", "2");

  // Play from the tileset tab brings the level tab back to draw into.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(levelTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();

  // Another project has no such tileset: the open tab shows an empty state, not a crash.
  await openProject(otherRoot);
  await tilesetTab.click();
  await expect(page.getByText(`Tileset “${tilesetId}” is not in the open project.`)).toBeVisible();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
