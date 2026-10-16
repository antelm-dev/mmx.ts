import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

let app: ElectronApplication;
let projectRoot: string;
let importRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  if (importRoot) rmSync(importRoot, { recursive: true, force: true });
});

test("Levels: edit A, switch to B, save writes both; add, import, rename, move and delete levels", async () => {
  // The fixture plus a second level, `level.b`; `level.main` stays the entry.
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-levels-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const readJson = (path: string) => JSON.parse(readFileSync(join(projectRoot, path), "utf8"));
  const main = readJson("levels/level.main.json");
  writeFileSync(
    join(projectRoot, "levels/level.b.json"),
    JSON.stringify({ ...main, id: "level.b", name: "Second Level" }),
  );
  const manifest = readJson("project.json");
  manifest.levels.push({ id: "level.b", path: "levels/level.b.json" });
  writeFileSync(join(projectRoot, "project.json"), JSON.stringify(manifest));
  // A level JSON outside the project, for Open Level.
  importRoot = mkdtempSync(join(tmpdir(), "mmx-levels-import-"));
  const importFile = join(importRoot, "cave.json");
  writeFileSync(importFile, JSON.stringify({ ...main, id: "level.cave", name: "Cave" }));

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

  const pick = (path: string) =>
    app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, path);
  await pick(projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  await page.getByRole("button", { name: "Levels", exact: true }).click();
  const row = (id: string) => page.getByTitle(id, { exact: true });
  await expect(row("level.main")).toHaveAttribute("aria-current", "true");
  await expect(row("level.main").getByLabel("Entry level")).toBeVisible();
  await expect(row("level.b")).toContainText("Second Level");

  const roomField = async (label: string) => {
    await page.getByRole("tab", { name: "Room" }).click();
    return page.getByLabel(label, { exact: true });
  };
  const setRoomField = async (label: string, value: string) => {
    const field = await roomField(label);
    await field.fill(value);
    await field.press("Enter");
  };
  const unsaved = async () => {
    await page.getByRole("button", { name: "File menu" }).click();
    const marked = await page.getByLabel("Unsaved changes").isVisible();
    await page.keyboard.press("Escape");
    return marked;
  };

  // Edit A, then B: leaving A keeps its edit, unsaved.
  await setRoomField("Columns", "40");
  await row("level.b").click();
  await expect(row("level.b")).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Level menu" })).toContainText("Second Level");
  await expect(await roomField("Columns")).toHaveValue("32");
  await setRoomField("Rows", "20");
  expect(await unsaved()).toBe(true);
  await row("level.main").click();
  await expect(await roomField("Columns")).toHaveValue("40");
  await row("level.b").click();

  // Save writes both levels; the entry level is still the entry.
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /^Save/ }).click();
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  expect(await unsaved()).toBe(false);
  expect(readJson("levels/level.main.json")).toMatchObject({ id: "level.main", cols: 40 });
  expect(readJson("levels/level.b.json")).toMatchObject({ id: "level.b", rows: 20 });
  expect(readJson("project.json")).toMatchObject({
    entryLevelId: "level.main",
    levels: [{ id: "level.main" }, { id: "level.b" }],
  });

  // In a project, New Level and Open Level add levels instead of replacing the entry.
  await page.getByRole("button", { name: "Level menu" }).click();
  await page.getByRole("menuitem", { name: "New Level", exact: true }).click();
  await expect(row("level.3")).toHaveAttribute("aria-current", "true");
  await pick(importFile);
  await page.getByRole("button", { name: "Level menu" }).click();
  await page.getByRole("menuitem", { name: "Open Level…", exact: true }).click();
  await expect(row("level.cave")).toHaveAttribute("aria-current", "true");
  await expect(row("level.cave")).toContainText("Cave");

  // Rename inline, move up, delete with the in-panel confirmation.
  await page.getByRole("button", { name: "Rename level" }).click();
  await page.getByLabel("Level name").fill("Deep Cave");
  await page.getByLabel("Level name").press("Enter");
  await expect(row("level.cave")).toContainText("Deep Cave");
  await page.getByRole("button", { name: "Move level up" }).click();
  await page.getByRole("button", { name: "Move level up" }).click();
  await row("level.3").click();
  await page.getByRole("button", { name: "Delete level" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete level" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(row("level.3")).toBeVisible();
  await page.getByRole("button", { name: "Delete level" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete level" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(row("level.3")).toHaveCount(0);
  // The deleted level was shown: the editor is back on the entry level, which cannot be deleted.
  await expect(row("level.main")).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Delete level" })).toBeDisabled();

  await page.keyboard.press("Control+s");
  // The first save's toast may still show: wait for the file instead.
  await expect.poll(() => readJson("project.json").levels.length).toBe(3);
  expect(readJson("project.json")).toMatchObject({
    entryLevelId: "level.main",
    levels: [
      { id: "level.main" },
      { id: "level.cave", path: "levels/level.cave.json" },
      { id: "level.b" },
    ],
  });
  expect(readJson("levels/level.cave.json")).toMatchObject({ id: "level.cave", name: "Deep Cave" });
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
