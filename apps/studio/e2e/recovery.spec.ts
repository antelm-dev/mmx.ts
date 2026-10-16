import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// globalSetup keeps the developer's draft aside and globalTeardown puts it back.
const RECOVERY_KEY = "mmx-studio.recovery.v2";

let app: ElectronApplication;
let projectRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
});

test("Restore Recovery Draft: a draft from another project never replaces a level of the same id", async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-recovery-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });

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
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });

  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  const row = (id: string) => page.getByTitle(id, { exact: true });
  await expect(row("level.main")).toContainText("Fixture Level");

  // Opening the entry level wrote the draft with this project's root.
  const written = JSON.parse(
    (await page.evaluate((key) => localStorage.getItem(key), RECOVERY_KEY)) ?? "null",
  );
  expect(written).toMatchObject({ document: { id: "level.main" } });
  expect(typeof written.rootPath).toBe("string");

  const restore = async (draft: string) => {
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key!, value!),
      [RECOVERY_KEY, draft],
    );
    // The File menu reads the draft when it renders: a view change re-renders it.
    await page.getByRole("button", { name: "View menu" }).click();
    await page.getByRole("menuitem", { name: /Zoom In/ }).click();
    await page.getByRole("button", { name: "File menu" }).click();
  };
  const restoreItem = page.getByRole("menuitem", { name: /Restore Recovery Draft/ });

  // From another project: added as a new level, the project's `level.main` is untouched.
  const foreign = { ...written.document, name: "Foreign" };
  await restore(JSON.stringify({ rootPath: "/elsewhere", document: foreign }));
  await restoreItem.click();
  expect(dialogs.pop()).toContain('Add the recovery draft as a new level, "Foreign (recovered)"');
  await expect(page.getByText(/Recovery draft added as a new level/)).toBeVisible();
  await expect(row("level.foreign.recovered")).toHaveAttribute("aria-current", "true");
  await expect(row("level.main")).toContainText("Fixture Level");

  // From this project: restored over its own level, after a confirmation naming it.
  const own = { ...written.document, name: "Restored Main" };
  await restore(JSON.stringify({ rootPath: written.rootPath, document: own }));
  await restoreItem.click();
  expect(dialogs.pop()).toContain('Replace level "Fixture Level" with the recovery draft?');
  await expect(row("level.main")).toHaveAttribute("aria-current", "true");
  await expect(row("level.main")).toContainText("Restored Main");

  // A corrupt draft is not offered.
  await restore("{oops");
  await expect(page.getByRole("menuitem", { name: /Open Project/ })).toBeVisible();
  await expect(restoreItem).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
