import { resolve } from "node:path";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // ELECTRON_RUN_AS_NODE would make Electron boot as plain Node (no BrowserWindow),
  // so strip it before launching the real GUI app.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js")],
    cwd: appRoot,
    env,
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  // Give the Pixi viewport a moment to attach.
  await page.waitForTimeout(2500);
});

test.afterAll(async () => {
  await app?.close();
});

test("boots into the editor shell with the toolbar and default level", async () => {
  await expect(page.locator(".brand")).toContainText("Studio");
  await expect(page.getByRole("button", { name: /Play|Stop/ })).toBeVisible();
  // Stage 1 opens by default; its title shows in the level selector.
  await expect(page.locator(".level-title")).toContainText("Stage 1");
  // The Pixi editing surface exists.
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});

test("switches to the Scene tab and lists placed objects", async () => {
  await page.getByRole("tab", { name: /Scene/ }).click();
  // Stage 1 ships with authored objects, so the scene list is non-empty.
  await expect(page.locator(".item").first()).toBeVisible();
});
