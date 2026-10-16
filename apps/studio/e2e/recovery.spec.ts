import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  const getDraft = () => page.evaluate((key) => localStorage.getItem(key), RECOVERY_KEY);
  const setDraft = (value: string) =>
    page.evaluate(([key, draft]) => localStorage.setItem(key!, draft!), [RECOVERY_KEY, value]);
  const restoreItem = page.getByRole("menuitem", { name: /Restore Recovery Draft/ });
  const row = (id: string) => page.getByTitle(id, { exact: true });
  const setRoomField = async (label: string, value: string) => {
    await page.getByRole("tab", { name: "Room" }).click();
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press("Enter");
  };

  // A crash draft from another project, with the id of this project's entry level.
  const main = JSON.parse(readFileSync(join(fixtureRoot, "levels/level.main.json"), "utf8"));
  const foreign = JSON.stringify({
    rootPath: "/elsewhere",
    document: { ...main, name: "Foreign" },
  });
  await setDraft(foreign);

  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await expect(row("level.main")).toContainText("Fixture Level");
  // Opening the project's entry level keeps the draft.
  expect(await getDraft()).toBe(foreign);

  // From another project: added as a new level, the project's `level.main` is untouched.
  await page.getByRole("button", { name: "File menu" }).click();
  await restoreItem.click();
  expect(dialogs.pop()).toContain('Add the recovery draft as a new level, "Foreign (recovered)"');
  await expect(page.getByText(/Recovery draft added as a new level/)).toBeVisible();
  await expect(row("level.foreign.recovered")).toHaveAttribute("aria-current", "true");
  await expect(row("level.main")).toContainText("Fixture Level");
  // Restoring keeps the draft too: a second crash before any edit still has it.
  expect(await getDraft()).toBe(foreign);

  // An edit writes the draft, with this project's root.
  await row("level.main").click();
  await setRoomField("Columns", "40");
  const written = JSON.parse((await getDraft()) ?? "null");
  expect(written).toMatchObject({ document: { id: "level.main", cols: 40 } });
  expect(typeof written.rootPath).toBe("string");

  // From this project: restored over its own level, after a confirmation naming it. The File
  // menu checks the draft when a level opens.
  const own = { ...written.document, name: "Restored Main" };
  await setDraft(JSON.stringify({ rootPath: written.rootPath, document: own }));
  await row("level.foreign.recovered").click();
  await page.getByRole("button", { name: "File menu" }).click();
  await restoreItem.click();
  expect(dialogs.pop()).toContain('Replace level "Fixture Level" with the recovery draft?');
  await expect(row("level.main")).toHaveAttribute("aria-current", "true");
  await expect(row("level.main")).toContainText("Restored Main");

  // A corrupt draft is not offered.
  await setDraft("{oops");
  await row("level.foreign.recovered").click();
  await page.getByRole("button", { name: "File menu" }).click();
  await expect(page.getByRole("menuitem", { name: /Open Project/ })).toBeVisible();
  await expect(restoreItem).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Save clears the draft: it only exists while there are unsaved edits.
  await setRoomField("Rows", "20");
  expect(await getDraft()).toContain('"rows":20');
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /^Save/ }).click();
  await expect(page.getByText("Project saved.")).toBeVisible();
  expect(await getDraft()).toBeNull();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
