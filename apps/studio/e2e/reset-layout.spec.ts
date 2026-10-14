import { resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");

let app: ElectronApplication;
let page: Page;
const pageErrors: string[] = [];
const consoleErrors: string[] = [];

test.beforeAll(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js")],
    cwd: appRoot,
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
});

/** Distinct colours in a screenshot of the viewport canvas (a cleared canvas has one). */
async function canvasColors(): Promise<number> {
  const png = await page.locator("#viewport-canvas").screenshot();
  return page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  }, [...png]);
}

test("View → Reset Layout twice keeps a working viewport and Play", async () => {
  const canvas = page.locator("#viewport-canvas");
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "View menu" }).click();
    await page.getByRole("menuitem", { name: /Reset Layout/ }).click();
    await expect(page.getByText("Layout reset.").first()).toBeVisible();
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toBeVisible({ timeout: 30_000 });
  }
  // Resize the window so any observer left on a torn-down viewport fires.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const [w, h] = win.getSize();
    win.setSize(w - 120, h - 80);
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect.poll(canvasColors).toBeGreaterThan(1);

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();
  await expect.poll(canvasColors).toBeGreaterThan(1);

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
