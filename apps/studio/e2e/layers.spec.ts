import { resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
});

test("AC-LAYERS: a hidden then locked collision layer is neither drawn nor painted", async () => {
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

  // A fresh level: nothing to undo yet, so the Undo button tells whether a click painted.
  await page.getByRole("button", { name: "Level menu" }).click();
  await page.getByRole("menuitem", { name: "New Level" }).click();
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();

  await page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Layers" })
    .click();
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
  const [zoom, vx, vy] = (await canvas.getAttribute("data-view"))!.split(",").map(Number) as [
    number,
    number,
    number,
  ];
  const box = (await canvas.boundingBox())!;
  const cell = { x: box.x + (3.5 * 16 - vx) * zoom, y: box.y + (3.5 * 16 - vy) * zoom };
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
