import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
const xPack = resolve(appRoot, "../../packages/pack-mmx-player-x/data/game.json");

let app: ElectronApplication;
let projectRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
});

test("a loadout the project's data/game.json adds is offered by the picker and played", async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-overlay-loadout-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  // X's loadout under a new id, picked in project.json.
  const x = JSON.parse(readFileSync(xPack, "utf8")).loadouts["player.x"];
  mkdirSync(join(projectRoot, "data"), { recursive: true });
  writeFileSync(
    join(projectRoot, "data/game.json"),
    JSON.stringify({
      schemaVersion: 1,
      loadouts: { "player.speedy": { ...x, id: "player.speedy" } },
    }),
  );
  const manifestPath = join(projectRoot, "project.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...manifest, player: { loadout: "player.speedy" } }),
  );

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

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  await page.getByRole("tab", { name: "Inspector" }).click();
  const loadout = page.getByRole("combobox", { name: "Player loadout" });
  await expect(loadout).toHaveText("Speedy");
  await loadout.click();
  for (const name of ["X", "Zero", "Speedy"]) {
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  const host = page.locator("[data-player-loadout]");
  await expect(host).toHaveAttribute("data-player-loadout", "player.speedy");
  await expect(host).toHaveAttribute("data-player-moveset", /\bShot\b/);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});
