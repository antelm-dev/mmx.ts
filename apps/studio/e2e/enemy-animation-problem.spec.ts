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

test("a placed enemy without an animation is a Problem on open, and Play refuses", async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-enemy-anim-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  // The fixture binds no enemy animations: a Metool placed on disk has none.
  const levelPath = join(projectRoot, "levels/level.main.json");
  const level = JSON.parse(readFileSync(levelPath, "utf8"));
  level.objects.push({ id: "metool.1", definitionId: "enemy.metool", x: 96, y: 128 });
  writeFileSync(levelPath, JSON.stringify(level, null, 2));

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
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  // Flagged once the project's Play assets load, without any edit.
  await page.getByRole("tab", { name: /^Problems/ }).click();
  await expect(page.getByRole("cell", { name: "enemy.animation" })).toBeVisible();

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.getByText(/Fix 1 error before playing/)).toBeVisible();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
