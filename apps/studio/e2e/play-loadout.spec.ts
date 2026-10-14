import { resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
});

test("Play runs the player loadout picked in the project settings", async () => {
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
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, fixtureRoot);

  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  await page.getByRole("tab", { name: "Inspector" }).click();
  // The fixture has no player key, so X is the default; the edit is not saved.
  const loadout = page.getByRole("combobox", { name: "Player loadout" });
  await expect(loadout).toHaveText("X");
  await loadout.click();
  await page.getByRole("option", { name: "Zero" }).click();
  await expect(loadout).toHaveText("Zero");
  await page.getByRole("button", { name: "File menu" }).click();
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  const host = page.locator("[data-player-loadout]");
  await expect(host).toHaveAttribute("data-player-loadout", "player.zero");
  // Zero has no buster: no Shot / Charge in the running player's moveset.
  await expect(host).toHaveAttribute("data-player-moveset", /\bDash\b/);
  await expect(host).not.toHaveAttribute("data-player-moveset", /\bShot\b/);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});
