import { resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
});

test("AC-MINIMAP: the minimap shows the level, recentres the view and hides from the View menu", async () => {
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

  // A fresh 40 x 23 level: a solid floor row and the Spawn.
  await page.getByRole("button", { name: "Level menu" }).click();
  await page.getByRole("menuitem", { name: "New Level" }).click();
  const minimap = page.getByTestId("minimap");
  const strip = minimap.getByRole("img", { name: "Minimap" });
  await expect(minimap).toBeVisible();
  await expect(minimap.locator("circle")).toHaveCount(1);

  const view = async () => {
    const [zoom, vx, vy] = (await canvas.getAttribute("data-view"))!.split(",").map(Number) as [
      number,
      number,
      number,
    ];
    const box = (await canvas.boundingBox())!;
    return { zoom, cx: vx + box.width / (2 * zoom), cy: vy + box.height / (2 * zoom), vx, vy };
  };
  const alphaAt = (col: number, row: number) =>
    minimap
      .locator("canvas")
      .evaluate(
        (c: HTMLCanvasElement, [x, y]) => c.getContext("2d")!.getImageData(x!, y!, 1, 1).data[3],
        [col, row],
      );
  // One bitmap pixel per cell.
  expect(await minimap.locator("canvas").evaluate((c) => [c.width, c.height])).toEqual([40, 23]);
  expect(await alphaAt(0, 22)).toBe(255);
  expect(await alphaAt(5, 5)).toBe(0);

  // Painting a tile shows on the minimap.
  const before = await view();
  const box = (await canvas.boundingBox())!;
  await page.getByRole("button", { name: "Tile tool" }).click();
  await page.mouse.click(
    box.x + (5.5 * 16 - before.vx) * before.zoom,
    box.y + (5.5 * 16 - before.vy) * before.zoom,
  );
  await expect.poll(() => alphaAt(5, 5)).toBe(255);
  await page.keyboard.press("v");

  // Zoomed in, a click centres the view on that point of the level, keeping the zoom.
  for (let i = 0; i < 3; i++) await page.keyboard.press("Control+Equal");
  const zoomed = (await view()).zoom;
  const worldW = 40 * 16;
  const worldH = 23 * 16;
  const s = (await strip.boundingBox())!;
  await page.mouse.click(s.x + s.width * 0.2, s.y + s.height * 0.5);
  let now = await view();
  expect(now.zoom).toBe(zoomed);
  expect(Math.abs(now.cx - worldW * 0.2)).toBeLessThan(8);
  expect(Math.abs(now.cy - worldH * 0.5)).toBeLessThan(8);
  // The view rectangle follows.
  const rect = (await minimap.getByTestId("minimap-view").boundingBox())!;
  expect(Math.abs(rect.x + rect.width / 2 - (s.x + s.width * 0.2))).toBeLessThan(2);

  // Dragging moves the view continuously.
  await page.mouse.move(s.x + s.width * 0.3, s.y + s.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width * 0.6, s.y + s.height * 0.4, { steps: 4 });
  now = await view();
  expect(Math.abs(now.cx - worldW * 0.6)).toBeLessThan(8);
  await page.mouse.move(s.x + s.width * 0.8, s.y + s.height * 0.6, { steps: 4 });
  await page.mouse.up();
  now = await view();
  expect(Math.abs(now.cx - worldW * 0.8)).toBeLessThan(8);
  expect(Math.abs(now.cy - worldH * 0.6)).toBeLessThan(8);

  // The wheel over the minimap does not zoom the editor.
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.wheel(0, -300);
  await page.mouse.wheel(0, 300);
  expect((await view()).zoom).toBe(zoomed);

  // Hidden in Play, back after Stop.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(minimap).toHaveCount(0);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(minimap).toBeVisible();

  // View → Minimap hides it and remembers; turning it back on restores the default.
  const toggle = async () => {
    await page.getByRole("button", { name: "View menu" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Minimap" }).click();
    await page.keyboard.press("Escape");
  };
  await toggle();
  await expect(minimap).toHaveCount(0);
  const stored = () => page.evaluate(() => localStorage.getItem("mmx.studio-minimap.v1"));
  expect(await stored()).toBe("false");
  await toggle();
  await expect(minimap).toBeVisible();
  expect(await stored()).toBe("true");
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
