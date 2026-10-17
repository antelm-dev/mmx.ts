import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import electronPath from "electron";
import { encodePng } from "../src/project-io/import/png";

const appRoot = resolve(__dirname, "..");
// Work projects live in the profile: never the developer's, always a fresh one.
const scratch = mkdtempSync(join(tmpdir(), "mmx-objects-no-project-"));
const profile = join(scratch, "profile");
const destination = join(scratch, "Crab Game");
// 64×32 synthetic sheet: two 32×32 cells, a 20×24 figure in each.
const sheetPath = join(scratch, "sheet.png");
const px = new Uint8Array(64 * 32 * 4);
for (let f = 0; f < 2; f++)
  for (let y = 4; y < 28; y++)
    for (let x = f * 32 + 6; x < f * 32 + 26; x++) px.set([40, 160, 220, 255], (y * 64 + x) * 4);
writeFileSync(sheetPath, encodePng({ width: 64, height: 32, px }));

test.afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function launch() {
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

const workFolders = () => {
  const base = join(profile, "work-projects");
  return existsSync(base) ? readdirSync(base) : [];
};
const pick = (app: ElectronApplication, path: string) =>
  app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
  }, path);
type LevelObject = { definitionId: string; x: number; y: number };
const levelObjects = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        studioEditor: { store: { get(): { document: { objects: LevelObject[] } } } };
      }
    ).studioEditor.store
      .get()
      .document.objects.map(({ definitionId, x, y }) => ({ definitionId, x, y })),
  );

test("AC-NOPROJECT: a pickup and an enemy made without a project, placed, saved to a new folder, reopened from Recent", async () => {
  let pickupId = "";
  const first = await launch();
  try {
    const { app, page } = first;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.getByRole("button", { name: "OK", exact: true }).click(); // first-launch notice
    await expect(page.getByRole("tab", { name: "Start" })).toBeVisible();
    const before = await levelObjects(page);

    await page.getByRole("tab", { name: "Object Palette" }).click();
    const newObject = page.getByRole("button", { name: "New object…" });
    const dialog = page.getByRole("dialog", { name: "New object" });
    const categories = dialog.getByRole("group", { name: "Categories" }).getByRole("button");
    const bases = dialog.getByRole("group", { name: "Based on" }).getByRole("button");
    const canvas = page.locator("#viewport-canvas");
    const levelTab = page.getByRole("tab", { name: "Level", exact: true });
    const place = async (name: string, dx: number) => {
      await expect(page.getByTitle(`Place ${name}`, { exact: true })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await levelTab.click();
      const box = (await canvas.boundingBox())!;
      await canvas.click({ position: { x: box.width / 2 + dx, y: box.height / 2 } });
    };

    // Without a project, New object… makes an untitled one, then opens; cancelling keeps
    // the level as it was and the work project, with nothing added.
    expect(workFolders()).toEqual([]);
    await newObject.click();
    await expect(categories.first()).toBeFocused();
    expect(workFolders()).toHaveLength(1);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(newObject).toBeFocused();
    expect(await levelObjects(page)).toEqual(before);

    // A pickup, placed. The same work project is reused.
    await newObject.click();
    await categories.filter({ hasText: "Pickups" }).click();
    await bases.filter({ hasText: "Life Capsule (Small)" }).click();
    await dialog.getByLabel("Name").fill("Big Life");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toHaveCount(0);
    expect(workFolders()).toHaveLength(1);
    await place("Big Life", -64);

    // An enemy needs an animation, and the work project has none: the dialog says so and
    // offers to import a sheet, then to make an animation from it.
    await page.getByRole("tab", { name: "Object Palette" }).click();
    const toMetool = async () => {
      await newObject.click();
      await categories.filter({ hasText: "Enemies" }).click();
      await bases.filter({ hasText: "Metool" }).click();
    };
    await toMetool();
    const none = dialog.getByRole("group", { name: "No animation" });
    await expect(none).toContainText("the project has none yet");
    await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
    await pick(app, sheetPath);
    await none.getByRole("button", { name: "Import sprite sheet…" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "sprite.sheet", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByLabel("Mode").selectOption("grid");
    await page.getByRole("button", { name: "Apply grid" }).click();
    await expect(page.getByTestId("region-count")).toHaveText("2");
    await page.getByRole("button", { name: "Save regions" }).click();

    await toMetool();
    await none.getByRole("button", { name: "New animation…" }).click();
    await expect(dialog).toHaveCount(0);
    const clips = page.getByTestId("clip-editor");
    await clips.getByLabel("Sprite sheet").selectOption("sprite.sheet");
    await clips.getByRole("button", { name: "Region 1", exact: true }).click();
    await clips.getByLabel("Clip name").fill("idle");
    await clips.getByRole("button", { name: "Create clip" }).click();
    await expect(page.getByRole("tab", { name: "anim.sheet", exact: true })).toBeVisible();

    await toMetool();
    await expect(none).toHaveCount(0);
    await dialog.getByLabel("Name").fill("Crab");
    await expect(dialog.getByLabel("Animation")).toHaveValue("anim.sheet");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toHaveCount(0);
    await place("Crab", 64);

    // First Save: a name, then a new folder; the whole project moves there.
    await page.getByRole("button", { name: "File menu" }).click();
    await page.getByRole("menuitem", { name: /^Save/ }).click();
    const save = page.getByRole("dialog", { name: "Save project" });
    await save.getByLabel("Project name").fill("Crab Game");
    await pick(app, destination);
    await save.getByRole("button", { name: "Choose folder…" }).click();
    await expect(page.getByText("Project saved.")).toBeVisible();
    expect(workFolders()).toEqual([]);

    const manifest = JSON.parse(readFileSync(join(destination, "project.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Crab Game", entryLevelId: "level.main" });
    expect(manifest.objects).toEqual([
      expect.objectContaining({ name: "Big Life", base: "pickup.life.small" }),
    ]);
    pickupId = manifest.objects[0].id as string;
    const level = JSON.parse(readFileSync(join(destination, "levels/level.main.json"), "utf8"));
    const placed = level.objects.map((o: { definitionId: string }) => o.definitionId);
    expect(placed).toEqual(expect.arrayContaining([pickupId, "enemy.crab"]));
    expect(placed).toHaveLength(before.length + 2);
    const gameData = JSON.parse(readFileSync(join(destination, "data/game.json"), "utf8"));
    expect(gameData.enemies.crab).toMatchObject({ actor: "enemy.crab", sheet: "anim.sheet" });
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
    await app.evaluate(({ session }) => session.defaultSession.flushStorageData());
  } finally {
    await first.app.close();
  }

  // Restart: the project reopens from Recent with both objects placed.
  const second = await launch();
  try {
    const { page } = second;
    await expect(page.getByRole("tab", { name: "Start" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Unsaved projects" })).toHaveCount(0);
    await page
      .getByRole("region", { name: "Recent projects" })
      .getByRole("button", { name: /Crab Game/ })
      .click();
    await expect(page.getByText(/Opened project 'Crab Game'/)).toBeVisible();
    const placed = (await levelObjects(page)).map((o) => o.definitionId);
    expect(placed).toEqual(expect.arrayContaining([pickupId, "enemy.crab"]));
    await page.getByRole("tab", { name: "Object Palette" }).click();
    await expect(page.getByTitle("Place Big Life", { exact: true })).toBeVisible();
    await expect(page.getByTitle("Place Crab", { exact: true })).toBeVisible();
  } finally {
    await second.app.close();
  }
});
