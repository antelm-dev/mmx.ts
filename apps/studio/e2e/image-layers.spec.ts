import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// The import copies the PNG into the project, so work on a scratch copy of the fixture.
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-image-layers-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(projectRoot, { recursive: true, force: true });
});

test("an imported PNG becomes an image layer drawn in the viewport and in Play", async () => {
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

  const pick = (path: string) =>
    app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, path);

  await pick(projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  await page.getByRole("tab", { name: "Room" }).click();
  await pick(join(fixtureRoot, "assets/sprites/bg.png"));
  await page.getByRole("button", { name: /Add image layer/ }).click();

  await expect(page.locator("[data-image-layer]")).toHaveCount(1);
  await expect(page.getByTestId("image-layers")).toContainText("image.bg");
  await expect(canvas).toHaveAttribute("data-image-layer-sprites", "1");
  await page.getByRole("button", { name: "File menu" }).click();
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();
});
