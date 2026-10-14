import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

test("New enemy: create a Crab from the Metool, place it, save it, and play it", async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-new-enemy-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  // The sheet the crab is drawn from: it needs at least the idle clip enemies start in.
  const manifest = JSON.parse(readFileSync(join(projectRoot, "project.json"), "utf8"));
  const sheet = manifest.assets.find((asset: { id: string }) => asset.id === "anim.player.fixture");
  expect(Object.keys(sheet.animations)).toContain("idle");

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

  // Palette → New enemy…
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await page.getByRole("button", { name: "New enemy…" }).click();
  const dialog = page.getByRole("dialog", { name: "New enemy" });
  await dialog.getByLabel("Name").fill("Crab");
  await expect(dialog.getByText("Id: enemy.crab")).toBeVisible();
  await dialog.getByLabel("Based on").selectOption("metool");
  await dialog.getByLabel("Animation").selectOption("anim.player.fixture");
  await dialog.getByLabel("Health").fill("3");
  await dialog.getByLabel("Touch damage").fill("2");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);

  // It is an enemy in the palette, drawn from its sheet, and picked for placing.
  const row = page.getByTitle("Place Crab", { exact: true });
  await expect(row).toBeVisible();
  await expect(row.locator("img")).toHaveCount(1);
  const canvas = page.locator("#viewport-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  const gameData = JSON.parse(readFileSync(join(projectRoot, "data/game.json"), "utf8"));
  expect(gameData.actors["enemy.crab"]).toMatchObject({ id: "enemy.crab", maxHealth: 3 });
  expect(gameData.enemies.crab).toMatchObject({
    id: "crab",
    actor: "enemy.crab",
    sheet: "anim.player.fixture",
    touchDamage: 2,
    abilities: ["Patrol", "Hide", "Stun", "Death"],
  });
  expect(gameData.prefabs["enemy.crab"]).toMatchObject({
    id: "enemy.crab",
    runtime: "enemy",
    source: { kind: "enemy", ref: "crab" },
  });
  const level = JSON.parse(readFileSync(join(projectRoot, "levels/level.main.json"), "utf8"));
  expect(level.objects.map((o: { definitionId: string }) => o.definitionId)).toContain("enemy.crab");

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-enemy-kinds]")).toHaveAttribute("data-enemy-kinds", /\bcrab\b/);
  await expect(page.getByText(/Could not start Play|Play error|Fix \d+ error/)).toHaveCount(0);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});
