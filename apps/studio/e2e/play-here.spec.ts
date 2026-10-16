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

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

let app: ElectronApplication;
let projectRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
});

/** Screen point of a world point once the view is fitted to the 32×16-cell level. */
async function screenAt(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator("#viewport-canvas").boundingBox())!;
  const worldW = 32 * 16;
  const worldH = 16 * 16;
  // EditorViewport.fitToDocument.
  const zoom = Math.max(0.25, Math.min(box.width / worldW, box.height / worldH) * 0.95);
  const vx = (worldW - box.width / zoom) / 2;
  const vy = (worldH - box.height / zoom) / 2;
  return { x: box.x + (wx - vx) * zoom, y: box.y + (wy - vy) * zoom };
}

/** The Play inspector's player position, "x, y". */
function playerPosition(page: Page) {
  return page
    .getByText("position", { exact: true })
    .locator("xpath=following-sibling::*[1]")
    .textContent();
}

test("Play from here starts the player at the chosen point without moving the Spawn", async () => {
  // The minimal fixture (Spawn at 32,128, floor on row 15) plus a platform and a wall.
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-play-here-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const levelPath = join(projectRoot, "levels/level.main.json");
  const level = JSON.parse(readFileSync(levelPath, "utf8"));
  for (let col = 16; col <= 23; col++) level.tiles[8 * level.cols + col] = 1;
  for (let row = 10; row <= 14; row++)
    for (const col of [26, 27]) level.tiles[row * level.cols + col] = 1;
  writeFileSync(levelPath, JSON.stringify(level, null, 2));

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

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  await page.keyboard.press("f");

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();
  const canvas = page.locator("#viewport-canvas");
  const menu = page.getByRole("menu");
  const fromHere = page.getByText("from here", { exact: true });

  // Inside the wall: refused with a message, Play does not start.
  const wall = await screenAt(page, 424, 200);
  await page.mouse.click(wall.x, wall.y, { button: "right" });
  await expect(menu.getByText("Cell 26, 12")).toBeVisible();
  await page.getByRole("menuitem", { name: /Play from here/ }).click();
  await expect(page.getByText(/the player would start inside a wall/)).toBeVisible();
  await expect(page.locator("#play-canvas")).toHaveCount(0);

  // On an object (the Spawn) the menu opens too, with the cell's items off; the player
  // starts there and falls to the floor (centre y = 240 - 14).
  const onSpawn = await screenAt(page, 40, 136);
  await page.mouse.click(onSpawn.x, onSpawn.y, { button: "right" });
  await expect(menu.getByText("Cell 2, 8")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /solid tile/ })).toBeDisabled();
  await page.getByRole("menuitem", { name: /Play from here/ }).click();
  await expect(fromHere).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => playerPosition(page), { timeout: 10_000 }).toBe("32, 226");
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();

  // Above the platform: the player beams in there and lands on it (centre y = 128 - 14).
  const ledge = await screenAt(page, 324, 120);
  await page.mouse.click(ledge.x, ledge.y, { button: "right" });
  await expect(menu.getByText("Cell 20, 7")).toBeVisible();
  await page.getByRole("menuitem", { name: /Play from here/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(fromHere).toBeVisible();
  await expect.poll(() => playerPosition(page), { timeout: 10_000 }).toBe("320, 114");
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();
  await expect(undo).toBeDisabled();

  // Ctrl+Shift+Enter plays from the mouse when it is over the level...
  await page.mouse.move(ledge.x, ledge.y);
  await page.keyboard.press("Control+Shift+Enter");
  await expect(fromHere).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => playerPosition(page), { timeout: 10_000 }).toBe("320, 114");
  await page.keyboard.press("Escape");
  await expect(canvas).toBeVisible();

  // ...and is a normal Play from the untouched Spawn otherwise.
  await page.getByRole("button", { name: "File menu" }).hover();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => playerPosition(page), { timeout: 10_000 }).toMatch(/^32, /);
  await expect(fromHere).toHaveCount(0);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();
  await expect(undo).toBeDisabled();

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
