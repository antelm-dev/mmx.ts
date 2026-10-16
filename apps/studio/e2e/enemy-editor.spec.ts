import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

let app: ElectronApplication;
let projectRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
});

const readGameData = () => JSON.parse(readFileSync(join(projectRoot, "data/game.json"), "utf8"));

async function save(page: Page): Promise<void> {
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
}

test("Enemy editor: compose a project enemy's abilities and tuning; built-ins are read-only and duplicable", async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-enemy-editor-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });

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

  // A Crab from the Metool, as in new-enemy.spec.
  await page.getByRole("tab", { name: "Object Palette" }).click();
  const newEnemy = page.getByRole("button", { name: "New object…" });
  await newEnemy.click();
  const dialog = page.getByRole("dialog", { name: "New object" });
  await dialog.getByRole("button", { name: "Enemies" }).click();
  await dialog.getByRole("button", { name: "Metool" }).click();
  await dialog.getByLabel("Name").fill("Crab");
  await dialog.getByLabel("Animation").selectOption("anim.player.fixture");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);

  // Palette → Edit Crab opens the Enemy editor on it, in a tab beside Level.
  await page.getByRole("button", { name: "Edit Crab" }).click();
  await expect(page.getByText("Enemy · crab")).toBeVisible();
  const patrol = page.getByRole("group", { name: "Patrol" });
  await patrol.getByLabel("Travel speed").fill("40");
  await patrol.getByLabel("Travel speed").press("Enter");
  await page.getByRole("checkbox", { name: "Hide" }).locator("..").click();
  await expect(page.getByRole("group", { name: "Hide" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Recoil" }).locator("..").click();
  await expect(page.getByRole("group", { name: "Recoil" }).getByLabel("Duration")).toHaveValue(
    "0.7",
  );

  // A compile error shows by its field and blocks creating enemies until fixed.
  const hurtboxWidth = page.getByRole("group", { name: "Hurtbox" }).getByLabel("Half width");
  await hurtboxWidth.fill("0");
  await hurtboxWidth.press("Enter");
  await expect(
    page.getByRole("group", { name: "Hurtbox" }).getByText("enemies.crab.hurtbox.hw must be > 0."),
  ).toBeVisible();
  await expect(newEnemy).toBeDisabled();
  await expect(page.getByRole("button", { name: "Duplicate", exact: true })).toBeDisabled();
  await hurtboxWidth.fill("9");
  await hurtboxWidth.press("Enter");
  await expect(newEnemy).toBeEnabled();

  await save(page);
  const crab = readGameData().enemies.crab;
  expect(crab.abilities).toEqual(["Patrol", "Stun", "Death", "Recoil"]);
  expect(crab.abilityConfig.Patrol).toMatchObject({ travelSpeed: 40, conflicts: ["Stun"] });
  expect(crab.abilityConfig.Hide).toBeUndefined();
  expect(crab.abilityConfig.Recoil).toEqual({ speed: 200, duration: 0.7 });
  expect(crab.reactions).toEqual({ idle: ["Patrol"], guard_break: ["Stun"] });
  expect(crab.hurtbox.hw).toBe(9);

  // A built-in enemy is read-only; Duplicate copies it into the project and edits the copy.
  // Each enemy is its own document tab: Crab's stays open beside Metool's.
  await page.getByRole("button", { name: "Edit Metool" }).click();
  await expect(page.getByRole("tab", { name: "Metool", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: "Crab", exact: true })).toHaveCount(1);
  await expect(page.getByText("Built-in enemy, read-only.", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Patrol" }).getByLabel("Travel speed"),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByText("Enemy · metool-copy")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Patrol" }).getByLabel("Travel speed"),
  ).toBeEnabled();
  await expect(page.getByTitle("Place Metool copy", { exact: true })).toBeVisible();

  await save(page);
  const gameData = readGameData();
  expect(gameData.enemies["metool-copy"]).toMatchObject({
    actor: "enemy.metool-copy",
    abilities: ["Patrol", "Hide", "Stun", "Death"],
  });
  expect(gameData.prefabs["enemy.metool-copy"].source).toEqual({
    kind: "enemy",
    ref: "metool-copy",
  });
  expect(gameData.enemies.metool).toBeUndefined();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
