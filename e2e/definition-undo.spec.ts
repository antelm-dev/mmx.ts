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

test("Definition undo: rename, duplicate and delete an enemy, undo and redo them; level undo stays the level's", async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-definition-undo-"));
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

  await page.getByRole("tab", { name: "Object Palette" }).click();
  await page.getByRole("button", { name: "New enemy…" }).click();
  const dialog = page.getByRole("dialog", { name: "New enemy" });
  await dialog.getByLabel("Name").fill("Crab");
  await dialog.getByLabel("Based on").selectOption("metool");
  await dialog.getByLabel("Animation").selectOption("anim.player.fixture");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);

  const row = (name: string) => page.getByTitle(`Place ${name}`, { exact: true });
  await page.getByRole("button", { name: "Edit Crab" }).click();
  const panel = page.locator('[data-undo-scope="definitions"]').filter({ hasText: "Enemy · crab" });
  const name = panel.getByLabel("Name", { exact: true });

  // Rename: the display name changes, the id does not.
  await name.fill("Spiky Crab");
  await name.press("Enter");
  await expect(row("Spiky Crab")).toBeVisible();
  await expect(panel.getByText("Enemy · crab")).toBeVisible();

  // Ctrl+Z after an edit in the Enemy panel undoes the definition edit; Ctrl+Y redoes it.
  await page.keyboard.press("Control+z");
  await expect(page.getByText("Undid object edit.").last()).toBeVisible();
  await expect(row("Crab")).toBeVisible();
  await expect(row("Spiky Crab")).toHaveCount(0);
  await expect(name).toHaveValue("Crab");
  await page.keyboard.press("Control+y");
  await expect(row("Spiky Crab")).toBeVisible();
  await expect(name).toHaveValue("Spiky Crab");

  // Duplicate, delete the copy, undo the delete.
  await panel.getByRole("button", { name: "Duplicate" }).click();
  const copyPanel = page.locator('[data-undo-scope="definitions"]').filter({ hasText: "Enemy · spiky-crab-copy" });
  await expect(copyPanel).toBeVisible();
  await expect(row("Spiky Crab copy")).toBeVisible();
  await copyPanel.getByRole("button", { name: "Delete" }).click();
  await expect(row("Spiky Crab copy")).toHaveCount(0);
  await expect(page.getByText("'enemy.spiky-crab-copy' was deleted.")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(row("Spiky Crab copy")).toBeVisible();
  await expect(copyPanel.getByLabel("Name", { exact: true })).toHaveValue("Spiky Crab copy");

  // Palette → Duplicate on a built-in makes a project object from it; undo from the palette removes it.
  await row("Moving Platform").hover();
  await page.getByRole("button", { name: "Duplicate Moving Platform" }).click();
  await expect(row("Moving Platform copy")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(row("Moving Platform copy")).toHaveCount(0);

  // A placed Spiky Crab blocks its deletion; Ctrl+Z after clicking the viewport undoes the placement instead.
  await page.getByRole("button", { name: "Edit Spiky Crab", exact: true }).click();
  if ((await row("Spiky Crab").getAttribute("aria-current")) !== "true") await row("Spiky Crab").click();
  const canvas = page.locator("#viewport-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(panel.getByRole("button", { name: "Delete" })).toBeDisabled();
  await page.keyboard.press("Control+z");
  await expect(panel.getByRole("button", { name: "Delete" })).toBeEnabled();
  await expect(row("Spiky Crab")).toBeVisible();

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  const gameData = JSON.parse(readFileSync(join(projectRoot, "data/game.json"), "utf8"));
  expect(gameData.prefabs["enemy.crab"]).toMatchObject({ id: "enemy.crab", name: "Spiky Crab", source: { ref: "crab" } });
  expect(gameData.prefabs["enemy.spiky-crab-copy"]).toMatchObject({ name: "Spiky Crab copy" });
  expect(Object.keys(gameData.enemies).sort()).toEqual(["crab", "spiky-crab-copy"]);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
