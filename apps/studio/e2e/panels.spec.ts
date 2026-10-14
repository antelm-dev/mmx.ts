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
  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join("\n")}`).toEqual([]);
  await app?.close();
});

const background = (row: Locator) => row.evaluate((el) => getComputedStyle(el).backgroundColor);

test("palette row click selects the object to place with the active tint", async () => {
  await page.getByRole("tab", { name: "Object Palette" }).click();
  const row = page.getByTitle(/^Place /).first();
  await expect(row).not.toHaveAttribute("aria-current");
  const idle = await background(row);
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");
  await page.mouse.move(0, 0);
  await expect.poll(() => background(row)).not.toBe(idle);
  await expect(page.locator('[title^="Place "][aria-current]')).toHaveCount(1);

  // Hover reveals the row's add icon.
  const next = page.getByTitle(/^Place /).nth(1);
  const reveal = next.locator("[data-reveal]");
  const opacity = () => reveal.evaluate((el) => getComputedStyle(el).opacity);
  expect(await opacity()).toBe("0");
  await next.hover();
  await expect.poll(opacity).toBe("1");
  await page.keyboard.press("Escape");
});

test("scene row selects from the keyboard and shows the active tint", async () => {
  await page.getByRole("tab", { name: /Scene/ }).click();
  const rows = page.locator('[data-part="context-trigger"]');
  await expect(rows.first()).toBeVisible();
  const title = await rows.and(page.locator(":not([aria-current])")).first().getAttribute("title");
  const row = rows.and(page.getByTitle(title!, { exact: true }));
  const idle = await background(row);
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(row).toBeFocused();
  await expect.poll(() => background(row)).not.toBe(idle);
  await expect(rows.and(page.locator("[aria-current]"))).toHaveCount(1);
});

test("Playtest Debugger opens with Play and closes with Stop", async () => {
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  const pause = page.getByRole("button", { name: "Pause (F8)" });
  await expect(pause).toBeVisible();
  await expect(page.getByRole("slider", { name: "Seek timeline" })).toBeVisible();

  const inspector = page.getByRole("button", { name: /inspector \(F9\)/ });
  const shown = (await inspector.getAttribute("aria-label"))?.startsWith("Hide");
  await inspector.click();
  await expect(inspector).toHaveAttribute("aria-label", shown ? /^Show/ : /^Hide/);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
  await expect(pause).toHaveCount(0);
});

test("New Level shows a dismissible toast", async () => {
  await page.getByRole("button", { name: "Level menu" }).click();
  await page.getByRole("menuitem", { name: "New Level" }).click();
  const toast = page.getByRole("status").filter({ hasText: "New level created." });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Dismiss" }).click();
  await expect(toast).toHaveCount(0);
});
