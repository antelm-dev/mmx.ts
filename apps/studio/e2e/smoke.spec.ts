import { resolve } from "node:path";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
  type Request,
} from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");

let app: ElectronApplication;
let page: Page;

const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const failedRequests: string[] = [];
const undefinedAssetUrls: string[] = [];

function trackRequest(request: Request): void {
  const url = request.url();
  if (url.endsWith("/undefined") || /\/assets\/undefined(?:\?|$)/.test(url)) {
    undefinedAssetUrls.push(url);
  }
}

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

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
  });
  page.on("request", trackRequest);

  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });
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

test("renders non-empty palette sprite previews", async () => {
  const previews = page.locator('[title="spawn"] img, [title="enemy.metool"] img, [title="enemy.bat"] img');
  await expect(previews.first()).toBeVisible({ timeout: 15_000 });

  const count = await previews.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const img = previews.nth(i);
    await expect(img).toHaveAttribute("src", /^(?!.*\/undefined(?:\?|$)).+/);
    await expect
      .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth * el.naturalHeight))
      .toBeGreaterThan(0);
  }
});

test("switches to the Scene tab and lists placed objects", async () => {
  await page.getByRole("tab", { name: /Scene/ }).click();
  await expect(page.locator("button[title]").first()).toBeVisible();
});

test("enters and exits Play mode without asset URL failures", async () => {
  pageErrors.length = 0;
  consoleErrors.length = 0;
  failedRequests.length = 0;
  undefinedAssetUrls.length = 0;

  const playButton = page.getByRole("button", { name: /^Play$/ });
  await expect(playButton).toBeVisible();
  await playButton.click();

  const playCanvas = page.locator("#play-canvas");
  await expect(playCanvas).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /^Stop$/ })).toBeVisible();
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);

  await expect
    .poll(async () =>
      playCanvas.evaluate((el: HTMLCanvasElement) => el.width * el.height),
    )
    .toBeGreaterThan(0);

  expect(undefinedAssetUrls, `undefined asset URLs: ${undefinedAssetUrls.join("\n")}`).toEqual([]);
  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toEqual([]);

  const relevantConsole = consoleErrors.filter(
    (line) =>
      /undefined|Failed to load|net::ERR_FILE_NOT_FOUND|Could not load sound/i.test(line),
  );
  expect(relevantConsole, `console errors: ${relevantConsole.join("\n")}`).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#play-canvas")).toHaveCount(0);
  await expect(page.locator("#viewport-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play$/ })).toBeVisible();
});

test("toggles developer tools from the Help menu", async () => {
  await page.getByRole("button", { name: "Help menu" }).click();
  await page.getByRole("menuitem", { name: /Toggle Developer Tools/ }).click();

  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.isDevToolsOpened(),
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Help menu" }).click();
  await page.getByRole("menuitem", { name: /Toggle Developer Tools/ }).click();

  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.isDevToolsOpened(),
      ),
    )
    .toBe(false);
});
