import { resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
});

test("Play uses the open project's player sheet, not the starter's", async () => {
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

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  await expect(page.locator("[data-player-sheet]")).toHaveAttribute(
    "data-player-sheet",
    "sprite.player.fixture",
  );
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});
