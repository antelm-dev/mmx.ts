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
  await page.waitForTimeout(2500);
});

test.afterAll(async () => {
  await app?.close();
});

test("boots into the editor shell with the toolbar and default level", async () => {
  await expect(page.getByTestId("app-brand")).toContainText("Studio");
  await expect(page.getByRole("button", { name: /Play|Stop/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Level menu" })).toContainText("Stage 1");
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});

test("switches to the Scene tab and lists placed objects", async () => {
  await page.getByRole("tab", { name: /Scene/ }).click();
  await expect(page.locator("button[title]").first()).toBeVisible();
});
