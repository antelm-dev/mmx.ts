import { resolve } from "node:path";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");

let app: ElectronApplication;
let page: Page;
let storedTheme: string | null = null;

test.beforeAll(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    // Baselines are 1280×800 CSS px at scale 1; a 125 %/150 % display would otherwise change the PNG size.
    args: [resolve(appRoot, "out/main/index.js"), "--force-device-scale-factor=1"],
    cwd: appRoot,
    env,
  });
  page = await app.firstWindow();
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });
  storedTheme = await page.evaluate(() => localStorage.getItem("mmx-studio-theme"));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
  await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([1280, 800]);
});

test.afterAll(async () => {
  // The suite runs on the real profile: put the developer's theme back even if a test failed midway.
  await page
    ?.evaluate((v) => {
      if (v === null) localStorage.removeItem("mmx-studio-theme");
      else localStorage.setItem("mmx-studio-theme", v);
    }, storedTheme)
    .catch(() => {});
  await app?.close();
});

const themes = ["dark", "light"] as const;
type Theme = (typeof themes)[number];

/** Picks the theme from View → Appearance; leaves the menu open (radio items keep it open). */
async function pickTheme(theme: Theme): Promise<void> {
  const item = page.getByRole("menuitemradio", { name: theme === "dark" ? "Dark theme" : "Light theme" });
  if (!(await item.isVisible())) await page.getByRole("button", { name: "View menu" }).click();
  await item.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
}

/** Web fonts and sprite previews are loaded. */
async function loaded(): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0)))
    .toBe(true);
}

/** Generated level/object ids change on every launch. */
const dynamic = (): Locator[] => [page.getByText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/)];

/** One screenshot per theme of the current state, with the menu closed. */
async function shootThemes(name: string, mask: Locator[] = []): Promise<void> {
  for (const theme of themes) {
    await pickTheme(theme);
    // Not Escape: in Play mode it also stops the playtest.
    await page.getByRole("button", { name: "View menu" }).click();
    await expect(page.getByRole("menu")).toBeHidden();
    // The returned focus ring shows only sometimes; drop it.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    await loaded();
    await expect(page).toHaveScreenshot(`${name}-${theme}.png`, { mask: [...dynamic(), ...mask] });
  }
}

test("initial editor", async () => {
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  await shootThemes("editor");
});

test("Scene tab with rows", async () => {
  await page.getByRole("tab", { name: /Scene/ }).click();
  await expect(page.locator('[data-part="context-trigger"]').first()).toBeVisible();
  await shootThemes("scene");
});

test("object selected with the Inspector", async () => {
  await page.locator('[data-part="context-trigger"]').first().click();
  await page.getByRole("tab", { name: "Inspector" }).click();
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await shootThemes("selected");
});

test("View menu open", async () => {
  for (const theme of themes) {
    await pickTheme(theme);
    await loaded();
    await expect(page).toHaveScreenshot(`view-menu-${theme}.png`, { mask: dynamic() });
  }
  await page.getByRole("button", { name: "View menu" }).click();
});

test("Play mode with the Playtest Debugger paused", async () => {
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Pause (F8)" }).click();
  // Restarting while paused lands on frame 0 with an empty recording, whatever ran before the pause.
  await page.getByRole("button", { name: "Restart level" }).click();
  await expect(page.getByText("0/1", { exact: true })).toBeVisible();
  await expect(page.getByText("restarting level")).toBeHidden({ timeout: 10_000 });
  // FPS and timing readouts.
  await shootThemes("play-paused", [page.getByText("timing median / p95 / worst (ms)").locator("..")]);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});
