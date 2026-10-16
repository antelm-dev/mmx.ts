import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import electronPath from "electron";
import { encodePng } from "../src/project-io/import/png";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// Imports copy files into the project, so work on a scratch copy of the fixture.
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-layers-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });
// A one-tile 16 px tileset outside the project.
const sourceDir = mkdtempSync(join(tmpdir(), "mmx-layers-src-"));
const tilesetPath = join(sourceDir, "one.png");
writeFileSync(
  tilesetPath,
  encodePng({ width: 16, height: 16, px: new Uint8Array(16 * 16 * 4).fill(200) }),
);

let app: ElectronApplication;

test.afterEach(async () => {
  await app?.close();
});

test.afterAll(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(sourceDir, { recursive: true, force: true });
});

async function launch(): Promise<{ page: Page; pageErrors: string[] }> {
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
  return { page, pageErrors };
}

/** Screen point at the centre of a 16 px level cell, from the viewport's zoom/position. */
async function cellPoint(page: Page, col: number, row: number): Promise<{ x: number; y: number }> {
  const canvas = page.locator("#viewport-canvas");
  const [zoom, vx, vy] = (await canvas.getAttribute("data-view"))!.split(",").map(Number) as [
    number,
    number,
    number,
  ];
  const box = (await canvas.boundingBox())!;
  return { x: box.x + ((col + 0.5) * 16 - vx) * zoom, y: box.y + ((row + 0.5) * 16 - vy) * zoom };
}

const openLayers = (page: Page) =>
  page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Layers" })
    .click();

test("AC-LAYERS: a hidden then locked collision layer is neither drawn nor painted", async () => {
  const { page, pageErrors } = await launch();
  const canvas = page.locator("#viewport-canvas");

  // A fresh level: nothing to undo yet, so the Undo button tells whether a click painted.
  await page.getByRole("button", { name: "Level menu" }).click();
  await page.getByRole("menuitem", { name: "New Level" }).click();
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();

  await openLayers(page);
  const layers = page.getByTestId("layers-panel");
  await expect(layers).toBeVisible();
  // Front first, as the level view stacks them.
  const keys = () =>
    layers.locator("[data-layer]").evaluateAll((rows) => rows.map((r) => r.dataset.layer));
  expect(await keys()).toEqual([
    "foreground",
    "world-front",
    "objects",
    "cameras",
    "world-back",
    "background",
    "far-background",
    "collision",
  ]);

  // Hidden: not drawn.
  await layers.getByRole("button", { name: "Hide Collision" }).click();
  await expect(canvas).toHaveAttribute("data-collision-visible", "false");
  await layers.getByRole("button", { name: "Show Collision" }).click();
  await expect(canvas).toHaveAttribute("data-collision-visible", "true");

  // Locked: still drawn, but the Tile tool says so and paints nothing.
  await layers.getByRole("button", { name: "Lock Collision" }).click();
  await page.getByRole("button", { name: "Tile tool" }).click();
  await expect(page.getByTestId("paint-blocked")).toHaveText("Layer locked");
  const cell = await cellPoint(page, 3, 3);
  await page.mouse.click(cell.x, cell.y);
  await expect(canvas).toHaveAttribute("data-collision-visible", "true");
  await expect(undo).toBeDisabled();

  // Unlocked, the same click paints a tile.
  await layers.getByRole("button", { name: "Unlock Collision" }).click();
  await expect(page.getByTestId("paint-blocked")).toHaveCount(0);
  await page.mouse.click(cell.x, cell.y);
  await expect(undo).toBeEnabled();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});

test("hidden tile, image and object layers are not drawn", async () => {
  const { page, pageErrors } = await launch();
  const canvas = page.locator("#viewport-canvas");
  const pick = (path: string) =>
    app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, path);
  await pick(projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  await openLayers(page);
  const layers = page.getByTestId("layers-panel");

  // One painted tile, one image layer and the fixture's spawn, all drawn.
  await pick(tilesetPath);
  await layers.getByRole("button", { name: /Import tileset/ }).click();
  await layers
    .getByTestId("tile-picker")
    .getByRole("button", { name: "Tile 0", exact: true })
    .click();
  await layers.getByRole("button", { name: "Brush", exact: true }).click();
  const cell = await cellPoint(page, 2, 2);
  await page.mouse.click(cell.x, cell.y);
  await pick(join(fixtureRoot, "assets/sprites/bg.png"));
  await layers.getByRole("button", { name: /Import image layer/ }).click();
  await expect(canvas).toHaveAttribute("data-tile-layer-sprites", "1");
  // The art containers hold the image sprite and the tile layer's container.
  await expect(canvas).toHaveAttribute("data-image-layer-sprites", "2");
  await expect(canvas).toHaveAttribute("data-objects-drawn", "1");

  const hide = (row: string) =>
    layers
      .locator(row)
      .getByRole("button", { name: /^Hide / })
      .click();
  await hide("[data-tile-layer]");
  await expect(canvas).toHaveAttribute("data-tile-layer-sprites", "0");
  await expect(canvas).toHaveAttribute("data-image-layer-sprites", "1");
  await hide("[data-image-layer]");
  await expect(canvas).toHaveAttribute("data-image-layer-sprites", "0");
  await hide('[data-layer="objects"]');
  await expect(canvas).toHaveAttribute("data-objects-drawn", "0");
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
