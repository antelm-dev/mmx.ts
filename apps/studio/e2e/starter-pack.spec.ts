import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
const pack = JSON.parse(
  readFileSync(resolve(appRoot, "../../packages/pack-mmx-starter/data/game.json"), "utf8"),
);
const STARTER = [{ id: "mmx-starter", version: 1 }];
const PACKS = [
  ...STARTER,
  { id: "mmx-player-x", version: 1 },
  { id: "mmx-player-zero", version: 1 },
];
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-starter-pack-"));
const starterRoot = join(scratch, "starter");
const oldRoot = join(scratch, "old");
const readJson = (root: string, path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

test("a starter project carries the MMX Starter pack; an old project gets it, X and Zero on open and Save writes them", async () => {
  // The minimal fixture predates packs: no `packs`, no data/game.json.
  cpSync(fixtureRoot, oldRoot, { recursive: true });
  expect(readJson(oldRoot, "project.json").packs).toBeUndefined();
  expect(existsSync(join(oldRoot, "data"))).toBe(false);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js"), `--user-data-dir=${join(scratch, "profile")}`],
    cwd: appRoot,
    env,
  });
  const page = await app.firstWindow();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  // First-launch notice: wait for it, then check it is gone, so the click never races its mount.
  await expect(page.getByTestId("fan-notice")).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByTestId("fan-notice")).toBeHidden();
  const pick = (root: string) =>
    app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, root);

  await pick(starterRoot);
  await page.evaluate(() => {
    window.prompt = () => "Pack Test";
  });
  await page.getByRole("button", { name: /New from MMX starter/ }).click();
  await expect(page.getByText(/Pack Test/).first()).toBeVisible();
  expect(readJson(starterRoot, "project.json").packs).toEqual(STARTER);
  expect(readJson(starterRoot, "data/game.json")).toEqual(pack);
  // The pack's enemies show their sprite in the palette (enemyAnimations → enemyActors): the
  // template binds their sheets, which the engine no longer knows of itself.
  await page.getByRole("tab", { name: "Object Palette" }).click();
  for (const id of ["enemy.metool", "enemy.bat"]) {
    const img = page.locator(`[title="${id}"] img`).first();
    await expect(img).toHaveAttribute("src", /^(?!.*\/undefined(?:\?|$)).+/);
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth * el.naturalHeight))
      .toBeGreaterThan(0);
  }

  await pick(oldRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  // Migrated in memory: opening writes nothing, and the Metool placed from the palette is the pack's.
  expect(readJson(oldRoot, "project.json").packs).toBeUndefined();
  expect(existsSync(join(oldRoot, "data"))).toBe(false);
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await expect(page.getByTitle("Place Metool", { exact: true })).toBeVisible();

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  expect(readJson(oldRoot, "project.json").packs).toEqual(PACKS);
  const saved = readJson(oldRoot, "data/game.json");
  expect(saved).toMatchObject(pack);
  expect(Object.keys(saved.loadouts)).toEqual(["player.x", "player.zero"]);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
