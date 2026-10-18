import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-player-packs-"));
const root = join(scratch, "project");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

test("a packs: [mmx-starter] project opens, plays X, and Save writes the X and Zero packs", async () => {
  // A project made since packs, before the players were packs: the Starter's records only.
  cpSync(fixtureRoot, root, { recursive: true });
  writeFileSync(
    join(root, "project.json"),
    JSON.stringify({ ...readJson("project.json"), packs: STARTER }),
  );
  mkdirSync(join(root, "data"));
  writeFileSync(join(root, "data/game.json"), JSON.stringify(pack));

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

  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
  }, root);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  // Migrated in memory: opening writes nothing.
  expect(readJson("project.json").packs).toEqual(STARTER);
  expect(readJson("data/game.json")).toEqual(pack);

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  const host = page.locator("[data-player-loadout]");
  await expect(host).toHaveAttribute("data-player-loadout", "player.x");
  await expect(host).toHaveAttribute("data-player-moveset", /\bShot\b/);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  expect(readJson("project.json").packs).toEqual([
    ...STARTER,
    { id: "mmx-player-x", version: 1 },
    { id: "mmx-player-zero", version: 1 },
  ]);
  const saved = readJson("data/game.json");
  expect(saved).toMatchObject(pack);
  expect(Object.keys(saved.loadouts)).toEqual(["player.x", "player.zero"]);
  expect(Object.keys(saved.weapons)).toEqual(["buster", "dark_arrow"]);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
