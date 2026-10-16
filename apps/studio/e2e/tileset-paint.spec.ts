import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
// The import copies the PNG into the project, so work on a scratch copy of the fixture.
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-tileset-paint-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });
const levelPath = join(projectRoot, "levels/level.main.json");
// No floor: the player can only stand on what the test paints.
const fixtureLevel = JSON.parse(readFileSync(levelPath, "utf8"));
writeFileSync(
  levelPath,
  JSON.stringify({ ...fixtureLevel, tiles: fixtureLevel.tiles.map(() => 0) }, null, 2),
);

// Synthetic 4x2 tileset of 16 px tiles, one flat colour per tile, outside the project.
const sourceDir = mkdtempSync(join(tmpdir(), "mmx-tileset-src-"));
const tilesetPath = join(sourceDir, "ground.png");
const px = new Uint8Array(64 * 32 * 4);
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 64; x++) {
    const tile = Math.floor(y / 16) * 4 + Math.floor(x / 16);
    px.set([40 + tile * 25, 200 - tile * 20, 90, 255], (y * 64 + x) * 4);
  }
}
writeFileSync(tilesetPath, encodePng({ width: 64, height: 32, px }));

const COLS = 32;
const WIDE = 40;
const FLOOR_ROW = 12;

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(sourceDir, { recursive: true, force: true });
});

/** Screen point at the centre of a level cell, from the viewport's zoom/position. */
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

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await cellPoint(page, ...from);
  const b = await cellPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 24 });
  await page.mouse.up();
}

async function saveAndRead(page: Page) {
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  // Let the toast go so the next save shows a fresh one.
  await expect(page.getByText("Project saved.")).toHaveCount(0, { timeout: 15_000 });
  return {
    level: JSON.parse(readFileSync(levelPath, "utf8")),
    project: JSON.parse(readFileSync(join(projectRoot, "project.json"), "utf8")),
  };
}

test("AC-PAINT: a painted tileset floor writes art and collision together and holds the player", async () => {
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

  await pick(projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  // Import: a tileset asset and a tile layer that paints it, with a 4x2 palette. Room stays
  // shown (right) for its Columns field, beside the Layers view (left).
  await page.getByRole("tab", { name: "Room" }).click();
  await page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Layers" })
    .click();
  await pick(tilesetPath);
  await page.getByRole("button", { name: /Import tileset/ }).click();
  await expect(page.locator("[data-tile-layer]")).toHaveCount(1);
  // Collision is edited in the tileset's document tab, which covers the level view; tiles
  // are picked for painting from the Layers panel's picker under the paint layer.
  await page.getByRole("button", { name: "Edit tileset" }).click();
  const tilesetTab = page.getByRole("tab", {
    name: (await page.locator("[data-tile-layer] [title]").getAttribute("title"))!,
  });
  const showTileset = () => tilesetTab.click();
  const showLevel = () => page.getByRole("tab", { name: "Level", exact: true }).click();
  const doc = page.getByTestId("tileset-document");
  const picker = page.getByTestId("tile-picker");
  const tile = (i: number) => doc.getByRole("button", { name: `Tile ${i}`, exact: true });
  const pickerTile = (i: number) => picker.getByRole("button", { name: `Tile ${i}`, exact: true });
  await expect(doc.locator("[data-tile]")).toHaveCount(8);
  await expect(picker.locator("[data-tile]")).toHaveCount(8);

  // Collision: tiles 0 and 1 solid (multi-select), tile 2 one-way.
  const collision = page.getByRole("group", { name: "Tile collision" });
  await tile(0).click();
  await tile(1).click({ modifiers: ["Shift"] });
  await collision.getByRole("button", { name: "Solid", exact: true }).click();
  await tile(2).click();
  await collision.getByRole("button", { name: "One-way", exact: true }).click();
  await expect(tile(0)).toHaveAttribute("data-collision", "1");
  await expect(tile(1)).toHaveAttribute("data-collision", "1");
  await expect(tile(2)).toHaveAttribute("data-collision", "4");
  await expect(tile(3)).toHaveAttribute("data-collision", "0");

  // Brush: a 10-tile floor of tile 0 under the spawn (32, 128), picked from Layers.
  await showLevel();
  await pickerTile(0).click();
  await picker.getByRole("button", { name: "Brush", exact: true }).click();
  await drag(page, [0, FLOOR_ROW], [9, FLOOR_ROW]);
  // Rectangle: a 3x3 block of tile 1, with no tab switch.
  await pickerTile(1).click();
  await expect(pickerTile(1)).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Rectangle", exact: true }).click();
  await drag(page, [14, 9], [16, 11]);
  await expect(canvas).toHaveAttribute("data-tile-layer-sprites", "19");

  const floor = Array.from({ length: 10 }, (_, c) => FLOOR_ROW * COLS + c);
  const block = [9, 10, 11].flatMap((r) => [14, 15, 16].map((c) => r * COLS + c));
  const painted = async (blockTile: number, blockCollision: number) => {
    const { level, project } = await saveAndRead(page);
    const cells: number[] = level.tileLayers[0].cells;
    expect(cells.length).toBe(level.cols * level.rows);
    expect(floor.map((i) => [cells[i], level.tiles[i]])).toEqual(floor.map(() => [0, 1]));
    expect(block.map((i) => [cells[i], level.tiles[i]])).toEqual(
      block.map(() => [blockTile, blockCollision]),
    );
    expect(cells.filter((c) => c !== -1).length).toBe(blockTile === -1 ? 10 : 19);
    const asset = project.assets.find((a: { kind: string }) => a.kind === "tileset");
    expect(asset).toMatchObject({ tileSize: 16, collision: { 0: 1, 1: 1, 2: 4 } });
    expect(level.tileLayers[0].tilesetId).toBe(asset.id);
  };
  await painted(1, 1);

  // One stroke is one undo step: undo drops the block (art and collision), redo brings it back.
  await page.keyboard.press("Control+z");
  await expect(canvas).toHaveAttribute("data-tile-layer-sprites", "10");
  await painted(-1, 0);
  await page.keyboard.press("Control+y");
  await expect(canvas).toHaveAttribute("data-tile-layer-sprites", "19");
  await painted(1, 1);

  // Widening the room keeps every painted cell at its (col, row), over its collision.
  const columns = page.getByLabel("Columns");
  await columns.fill(String(WIDE));
  await columns.blur();
  {
    const { level } = await saveAndRead(page);
    const cells: number[] = level.tileLayers[0].cells;
    expect([level.cols, cells.length]).toEqual([WIDE, WIDE * level.rows]);
    const wideFloor = Array.from({ length: 10 }, (_, c) => FLOOR_ROW * WIDE + c);
    expect(wideFloor.map((i) => [cells[i], level.tiles[i]])).toEqual(wideFloor.map(() => [0, 1]));
    expect(cells.filter((c) => c !== -1).length).toBe(19);
  }
  await expect(page.getByText(/No problems detected/)).toBeVisible();

  // Play: the player falls from the spawn and stands on the painted floor (top at y 192).
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  const playerY = async () => {
    const row = page.getByText("position", { exact: true }).locator("..");
    const match = /position\s*(-?[\d.]+),\s*(-?[\d.]+)/.exec((await row.textContent()) ?? "");
    return match ? Number(match[2]) : NaN;
  };
  await expect.poll(playerY, { timeout: 15_000 }).toBeGreaterThan(150);
  await page.waitForTimeout(1_500);
  const y = await playerY();
  expect(y).toBeGreaterThan(150);
  expect(y).toBeLessThan(192);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();

  // 32 px tiles cut the 64x32 sheet into 2: the painted index 1 still fits, but the check uses
  // the real tile count, and the old per-index collision is cleared.
  await pickerTile(2).click();
  await picker.getByRole("button", { name: "Brush", exact: true }).click();
  await drag(page, [20, 2], [20, 2]);
  await showTileset();
  const tileSize = page.getByLabel("Tile size (px)");
  await tileSize.fill("32");
  await tileSize.blur();
  await expect(page.getByText(/expected -1 or a tile index below 2/)).toBeVisible();
  await expect(doc.locator("[data-tile]")).toHaveCount(2);
  await expect(picker.locator("[data-tile]")).toHaveCount(2);
  await expect(tile(0)).toHaveAttribute("data-collision", "0");
});
