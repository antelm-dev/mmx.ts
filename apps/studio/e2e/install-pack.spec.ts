import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const appRoot = resolve(__dirname, "..");
const packRoot = resolve(appRoot, "../../packages/pack-mmx-starter");
const packAssets: { id: string; path: string }[] = JSON.parse(
  readFileSync(join(packRoot, "assets.json"), "utf8"),
).assets;
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-install-pack-"));
const projectRoot = join(scratch, "blank");
const readJson = (path: string) => JSON.parse(readFileSync(join(projectRoot, path), "utf8"));

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

/** File → Install / update MMX Starter pack…; returns the dialogs it showed, all accepted. */
async function install(page: Page, dialogs: string[]): Promise<string[]> {
  const before = dialogs.length;
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Install \/ update MMX Starter pack/ }).click();
  await expect
    .poll(() => dialogs.slice(before).some((m) => /installed|up to date/.test(m)))
    .toBe(true);
  return dialogs.slice(before);
}

test("AC-INSTALL: a blank project gets the pack's art from File → Install; a second run adds nothing", async () => {
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
  const dialogs: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  await page.getByRole("button", { name: "OK", exact: true }).click(); // first-launch notice

  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
  }, projectRoot);
  await page.evaluate(() => {
    window.prompt = () => "Blank";
  });
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /New Project/ }).click();
  await expect(page.getByText(/Project 'Blank' created/)).toBeVisible();
  expect(readJson("project.json").assets).toEqual([]);

  // A Metool and a capsule on the floor: Install reopens the project, so Play sees them.
  const levelPath = readJson("project.json").levels[0].path;
  const level = readJson(levelPath);
  level.objects.push(
    { id: "metool.1", definitionId: "enemy.metool", x: 224, y: 336 },
    { id: "capsule.1", definitionId: "pickup.life.large", x: 128, y: 336 },
  );
  writeFileSync(join(projectRoot, levelPath), JSON.stringify(level, null, 2));

  const first = await install(page, dialogs);
  expect(first[0]).toMatch(/^Install \/ update the MMX Starter pack\?/);
  expect(first[0]).toContain("Undo cannot revert it");
  expect(first.at(-1)).toMatch(/^MMX Starter pack installed\./);
  expect(first.at(-1)).toContain("12 assets");
  expect(first.at(-1)).toContain("6 files");
  const assets = readJson("project.json").assets.map((asset: { id: string }) => asset.id);
  expect(assets.sort()).toEqual(packAssets.map((asset) => asset.id).sort());
  for (const { path } of packAssets) {
    expect(readFileSync(join(projectRoot, path)).equals(readFileSync(join(packRoot, path)))).toBe(
      true,
    );
  }

  await page.getByRole("tab", { name: "Object Palette" }).click();
  for (const id of ["enemy.metool", "pickup.life.large"]) {
    const img = page.locator(`[title="${id}"] img`).first();
    await expect(img).toHaveAttribute("src", /^(?!.*\/undefined(?:\?|$)).+/);
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth * el.naturalHeight))
      .toBeGreaterThan(0);
  }

  // Play builds the Metool and the capsule from their clips (it fails without them) and runs.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  const frame = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { studioEditor: { getPlaytestSnapshot(): { frame: number } } }
        ).studioEditor.getPlaytestSnapshot().frame,
    );
  await expect.poll(frame, { timeout: 15_000 }).toBeGreaterThan(60);
  await expect(page.getByText(/Could not start Play|Play error/)).toHaveCount(0);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();

  const manifest = readFileSync(join(projectRoot, "project.json"), "utf8");
  const data = readFileSync(join(projectRoot, "data/game.json"), "utf8");
  const second = await install(page, dialogs);
  expect(second).toHaveLength(1);
  expect(second[0]).toMatch(/up to date: nothing to add/);
  expect(readFileSync(join(projectRoot, "project.json"), "utf8")).toBe(manifest);
  expect(readFileSync(join(projectRoot, "data/game.json"), "utf8")).toBe(data);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
