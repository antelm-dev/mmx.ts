import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-player-missing-"));
const projectRoot = join(scratch, "project");

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

test("AC-PART: a spawn whose loadout is not defined is a player.missing warning in Problems", async () => {
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  // The spawn prefab plays a loadout no pack defines: the data compiles, with a warning.
  const spawn = {
    id: "spawn",
    name: "Spawn",
    runtime: "spawn.player",
    source: { kind: "loadout", ref: "player.nobody" },
    fields: [],
  };
  mkdirSync(join(projectRoot, "data"));
  writeFileSync(
    join(projectRoot, "data/game.json"),
    JSON.stringify({ schemaVersion: 1, prefabs: { spawn } }, null, 2),
  );

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
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  // First-launch notice: wait for it, then check it is gone, so the click never races its mount.
  await expect(page.getByTestId("fan-notice")).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByTestId("fan-notice")).toBeHidden();

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  await page.getByRole("tab", { name: /^Problems/ }).click();
  const row = page.getByRole("row").filter({ hasText: "game-data.player.missing" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("loadout 'player.nobody'");
  // A warning, not an error: the project's objects stay available.
  await expect(page.getByRole("tab", { name: /^Problems/ })).toContainText(/warning/);
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await expect(page.getByTitle("Place Metool", { exact: true })).toBeVisible();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
