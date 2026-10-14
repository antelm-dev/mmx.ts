import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

let app: ElectronApplication;
let projectRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
});

test("an out-of-bounds enemy is a Problem that blocks Play without freezing the Studio", async () => {
  // The minimal fixture plus a Metool 200px past the right edge of the level.
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-oob-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const levelPath = join(projectRoot, "levels/level.main.json");
  const level = JSON.parse(readFileSync(levelPath, "utf8"));
  level.objects.push({
    id: "metool.oob",
    definitionId: "enemy.metool",
    x: level.cols * level.gridSize + 200,
    y: 200,
  });
  writeFileSync(levelPath, JSON.stringify(level, null, 2));
  // The fixture binds no enemy sheet; reuse its one animation so the Metool can be drawn in Play.
  const dataPath = join(projectRoot, "game/data.json");
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  data.bindings.enemyAnimations = { metool: "anim.player.fixture" };
  writeFileSync(dataPath, JSON.stringify(data, null, 2));

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

  const problem = page.getByRole("cell", { name: "object.out-of-bounds" });
  await expect(problem).toBeVisible();

  // The Play click used to hang the renderer here (Problems re-rendered forever).
  await page.getByRole("button", { name: /^Play$/ }).click({ timeout: 5_000 });
  await expect(page.getByText("Fix 1 error before playing.")).toBeVisible();
  await expect(page.locator("#play-canvas")).toHaveCount(0);

  // Select the enemy from its Problem and move it back inside the level.
  await problem.click({ timeout: 5_000 });
  await page.getByRole("tab", { name: "Inspector" }).click();
  const x = page.getByLabel("X", { exact: true });
  await x.fill("200");
  await x.press("Tab");
  await expect(problem).toHaveCount(0);

  await page.getByRole("button", { name: /^Play$/ }).click({ timeout: 5_000 });
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});
