import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type Page } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
// Work projects live in the profile: never the developer's, always a fresh one per test.
const scratch = mkdtempSync(join(tmpdir(), "mmx-studio-work-"));
test.afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function launch(profile: string) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js"), `--user-data-dir=${profile}`],
    cwd: appRoot,
    env,
  });
  const page = await app.firstWindow();
  page.on("dialog", (dialog) => void dialog.accept());
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  return { app, page };
}

/** First launch of a profile: the fan notice, then the Start tab. */
async function firstLaunch(profile: string) {
  const launched = await launch(profile);
  await launched.page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(launched.page.getByRole("tab", { name: "Start" })).toBeVisible();
  return launched;
}

const unsaved = (page: Page) => page.getByRole("region", { name: "Unsaved projects" });
const workFolders = (profile: string) => {
  const base = join(profile, "work-projects");
  return existsSync(base) ? readdirSync(base).map((name) => join(base, name)) : [];
};
const ensureProject = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { studioEditor: { ensureProject(): Promise<boolean> } }).studioEditor
      .ensureProject()
      .then(String),
  );
const renameLevel = (page: Page, name: string) =>
  page.evaluate((next) => {
    const editor = (
      window as unknown as { studioEditor: { renameProjectLevel(id: string, name: string): void } }
    ).studioEditor;
    editor.renameProjectLevel("level.main", next);
  }, name);

test("a blank level becomes an untitled project, then its first Save moves it to a new folder", async () => {
  const profile = join(scratch, "save");
  const destination = join(scratch, "Hero Game");
  const { app, page } = await firstLaunch(profile);
  try {
    await expect(unsaved(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Blank level" }).click();
    expect(await ensureProject(page)).toBe("true");
    const [work] = workFolders(profile);
    expect(work && existsSync(join(work, "levels/level.main.json"))).toBe(true);
    await renameLevel(page, "First Stage");

    await page.getByRole("button", { name: "File menu" }).click();
    // The level's draft belongs to the open project: nothing to restore on its own.
    await expect(page.getByRole("menuitem", { name: /Restore Recovery Draft/ })).toHaveCount(0);
    await page.getByRole("menuitem", { name: /^Save/ }).click();
    const dialog = page.getByRole("dialog", { name: "Save project" });
    await dialog.getByLabel("Project name").fill("Hero Game");
    await app.evaluate(({ dialog: native }, picked) => {
      native.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, destination);
    await dialog.getByRole("button", { name: "Choose folder…" }).click();
    await expect(page.getByText("Project saved.")).toBeVisible();

    const manifest = JSON.parse(readFileSync(join(destination, "project.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Hero Game", entryLevelId: "level.main" });
    const level = JSON.parse(readFileSync(join(destination, "levels/level.main.json"), "utf8"));
    expect(level).toMatchObject({ id: "level.main", name: "First Stage" });
    expect(workFolders(profile)).toEqual([]);

    // Now a recent project, and nothing is left to restore.
    await page.getByRole("button", { name: "Help menu" }).click();
    await page.getByRole("menuitem", { name: "Start Page" }).click();
    const recents = page.getByRole("region", { name: "Recent projects" });
    await expect(recents.getByRole("button", { name: /Hero Game/ })).toBeVisible();
    await expect(unsaved(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("a work project left at exit is offered on Start with its edits, and can be deleted", async () => {
  const profile = join(scratch, "restore");
  const first = await firstLaunch(profile);
  try {
    await first.page.getByRole("button", { name: "Blank level" }).click();
    expect(await ensureProject(first.page)).toBe("true");
    // After the work folder was written: only the recovery draft has it.
    await renameLevel(first.page, "Edited Stage");
    await first.app.evaluate(({ session }) => session.defaultSession.flushStorageData());
  } finally {
    await first.app.close();
  }
  const [work] = workFolders(profile);

  const second = await launch(profile);
  try {
    const { page } = second;
    // One offer: Start's Restore, not the draft on its own.
    await expect(unsaved(page).getByRole("button", { name: /Untitled Project/ })).toBeVisible();
    await page.getByRole("button", { name: "File menu" }).click();
    await expect(page.getByRole("menuitem", { name: /Restore Recovery Draft/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await unsaved(page)
      .getByRole("button", { name: /Untitled Project/ })
      .click();
    await expect(page.getByText("Unsaved project restored.")).toBeVisible();
    await expect(page).toHaveTitle("Edited Stage · MMX Studio");
    await expect(page.getByRole("tab", { name: "Start" })).toHaveCount(0);
    expect(workFolders(profile)).toEqual([work]);
  } finally {
    await second.app.close();
  }

  const third = await launch(profile);
  try {
    const { page } = third;
    await unsaved(page).getByRole("button", { name: "Delete…" }).click();
    await unsaved(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Unsaved project deleted.")).toBeVisible();
    await expect(unsaved(page)).toHaveCount(0);
    expect(workFolders(profile)).toEqual([]);
  } finally {
    await third.app.close();
  }
});
