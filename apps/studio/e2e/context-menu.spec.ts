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

/** The Scene tab title tracks the object + decoration count: "Scene (N)". */
async function sceneCount(): Promise<number> {
  const title = await page.getByRole("tab", { name: /Scene/ }).textContent();
  return Number(/\((\d+)\)/.exec(title ?? "")?.[1]);
}

test("scene row context menu duplicates, closes on Escape and keeps focus", async () => {
  await page.getByRole("tab", { name: /Scene/ }).click();
  const rows = page.locator('[data-part="context-trigger"]');
  await expect(rows.first()).toBeVisible();
  const before = await sceneCount();
  expect(before).toBeGreaterThan(0);

  const row = rows.first();
  await row.click({ button: "right" });
  const duplicate = page.getByRole("menuitem", { name: "Duplicate" });
  await expect(duplicate).toBeVisible();
  // Portalled to body so Dockview never clips it.
  await expect
    .poll(() =>
      duplicate.evaluate(
        (el) => el.closest("[data-part=positioner]")?.parentElement === document.body,
      ),
    )
    .toBe(true);
  await duplicate.click();
  await expect(duplicate).toBeHidden();
  await expect.poll(sceneCount).toBe(before + 1);

  // Open, Escape: the menu closes, the row keeps focus, and editor shortcuts still fire.
  await row.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(row).toBeFocused();
  const withDuplicate = await sceneCount();
  await page.keyboard.press("Delete");
  await expect.poll(sceneCount).toBe(withDuplicate - 1);

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("viewport context menu opens at the pointer and closes on Escape", async () => {
  const canvas = page.locator("#viewport-canvas");
  const box = (await canvas.boundingBox())!;
  const at = { x: box.width / 2, y: box.height / 2 };
  await canvas.click({ button: "right", position: at });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Show grid|Hide grid/ })).toBeVisible();
  // Anchored at the click point: bottom-start (or flipped to top-start) keeps the left edge there.
  const m = (await menu.boundingBox())!;
  expect(Math.abs(m.x - (box.x + at.x))).toBeLessThan(8);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // Selecting an item runs its command and closes the menu.
  const grid = page.getByRole("button", { name: "Grid", exact: true });
  const pressed = await grid.getAttribute("aria-pressed");
  await canvas.click({ button: "right", position: at });
  await page.getByRole("menuitem", { name: /Show grid|Hide grid/ }).click();
  await expect(menu).toBeHidden();
  await expect(grid).toHaveAttribute("aria-pressed", pressed === "true" ? "false" : "true");

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
