import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

// The minimal fixture plus one moving platform (default Travel 96) at a fixed spot.
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-platform-gizmo-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });
const levelPath = join(projectRoot, "levels/level.main.json");
const level = JSON.parse(readFileSync(levelPath, "utf8"));
const PLATFORM = { id: "platform.gizmo", definitionId: "platform.moving", x: 64, y: 96, width: 48, height: 8 };
level.objects.push(PLATFORM);
writeFileSync(levelPath, JSON.stringify(level, null, 2));

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(projectRoot, { recursive: true, force: true });
});

/** Screen point of a world point, from the viewport's zoom/position. */
async function screenPoint(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const canvas = page.locator("#viewport-canvas");
  const [zoom, vx, vy] = (await canvas.getAttribute("data-view"))!.split(",").map(Number) as [number, number, number];
  const box = (await canvas.boundingBox())!;
  return { x: box.x + (wx - vx) * zoom, y: box.y + (wy - vy) * zoom };
}

/** Drag from one world point by a world-pixel delta. */
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  const a = await screenPoint(page, from.x, from.y);
  const b = await screenPoint(page, from.x + dx, from.y + dy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

test("a moving platform's travel gizmo draws on both axes and its grip sets Travel in one undo step", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    // The baseline is CSS px at scale 1, like visual.spec.ts.
    args: [resolve(appRoot, "out/main/index.js"), "--force-device-scale-factor=1"],
    cwd: appRoot,
    env,
  });
  const page = await app.firstWindow();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  const canvas = page.locator("#viewport-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
  await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([1280, 800]);

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  await page.getByRole("tab", { name: /Scene/ }).click();
  await page.getByTitle(PLATFORM.id, { exact: true }).click();
  await page.getByRole("tab", { name: "Inspector" }).click();
  const travel = page.getByLabel("Travel", { exact: true });
  await expect(travel).toHaveValue("96");

  // The selected platform shows its travel path, the ghost at the far end, and the grip. Clipped
  // to the level around them: the viewport's themed toolbars stay out of the baseline.
  await page.mouse.move(0, 0);
  const topLeft = await screenPoint(page, PLATFORM.x - 16, PLATFORM.y - 32);
  const bottomRight = await screenPoint(page, PLATFORM.x + 96 + PLATFORM.width + 16, PLATFORM.y + 32);
  await expect(page).toHaveScreenshot("moving-platform-gizmo.png", {
    clip: { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y },
  });

  // The grip sits at the centre of the end rect; dragging it 3 cells right adds 48 px of Travel.
  const grip = { x: PLATFORM.x + 96 + PLATFORM.width / 2, y: PLATFORM.y + PLATFORM.height / 2 };
  await drag(page, grip, 45, 30);
  await expect(travel).toHaveValue("144");
  // The platform itself did not move.
  await expect(page.getByLabel("X", { exact: true })).toHaveValue(String(PLATFORM.x));

  // One drag is one history entry.
  await page.keyboard.press("Control+z");
  await expect(travel).toHaveValue("96");

  // Vertical: the grip moves below the platform and follows the pointer's y only.
  const axis = page.getByRole("combobox", { name: "Axis" });
  await axis.click();
  await page.getByRole("option", { name: "vertical" }).click();
  await expect(axis).toHaveText("vertical");
  const down = { x: PLATFORM.x + PLATFORM.width / 2, y: PLATFORM.y + 96 + PLATFORM.height / 2 };
  await drag(page, down, 40, -34);
  await expect(travel).toHaveValue("64");
  await page.keyboard.press("Control+z");
  await expect(travel).toHaveValue("96");

  // A falling platform comes from the palette and edits its Delay.
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await page.getByTitle("Place Falling Platform", { exact: true }).click();
  const spot = await screenPoint(page, 256, 160);
  await page.mouse.click(spot.x, spot.y);
  await page.getByRole("tab", { name: "Inspector" }).click();
  await expect(page.getByLabel("Delay", { exact: true })).toHaveValue("0.5");
  await expect(page.getByLabel("Travel", { exact: true })).toHaveCount(0);

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
