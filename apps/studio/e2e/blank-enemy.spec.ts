import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-blank-enemy-"));
const projectRoot = join(scratch, "project");

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

test("AC-BLANK-ENEMY: a blank enemy composed from abilities is placed, undone and played", async () => {
  cpSync(fixtureRoot, projectRoot, { recursive: true });
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
  const canvas = page.locator("#viewport-canvas");
  // A fresh profile opens on the Start page, over the level.
  await expect(canvas).toBeAttached({ timeout: 30_000 });
  await page.getByRole("button", { name: "OK", exact: true }).click(); // first-launch notice

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  await page.getByRole("tab", { name: "Object Palette" }).click();
  const newObject = page.getByRole("button", { name: "New object…" });
  const dialog = page.getByRole("dialog", { name: "New object" });
  const row = (name: string) => page.getByTitle(`Place ${name}`, { exact: true });
  const toEnemies = async () => {
    await newObject.click();
    await dialog
      .getByRole("group", { name: "Categories" })
      .getByRole("button")
      .filter({ hasText: "Enemies" })
      .click();
  };

  // Blank enemy first, then the enemies as templates.
  await toEnemies();
  await expect(dialog.getByText("Enemies · Behaviour")).toBeVisible();
  const behaviour = dialog.getByRole("group", { name: "Behaviour" }).getByRole("button");
  await expect(behaviour.first()).toHaveText(/^Blank enemy/);
  await expect(behaviour.first()).toBeFocused();
  const templates = dialog.getByRole("group", { name: "Templates" });
  await expect(templates).toContainText("Templates");
  await expect(templates.getByRole("button")).toHaveText(["Metool", "Bat", "Pantheon Hunter"]);

  // The form: Death on by default, abilities in order, conflicts among those owned.
  const fillBlob = async () => {
    await behaviour.first().click();
    await expect(dialog.getByText("Enemies · Blank enemy")).toBeVisible();
    await expect(dialog.getByLabel("Name")).toBeFocused();
    await dialog.getByLabel("Name").fill("Blob");
    await expect(dialog.getByText("Id: enemy.blob")).toBeVisible();
    await dialog.getByLabel("Animation").selectOption("anim.player.fixture");
    await expect(dialog.getByLabel("Movement")).toHaveValue("ground");
    const abilities = dialog.getByRole("group", { name: "Abilities" });
    await expect(abilities.getByRole("button", { pressed: true })).toHaveText(["Death"]);
    // Only what the movement allows: a flier has no Patrol, and Hover is for fliers.
    await expect(abilities.getByRole("button", { name: "Hover" })).toHaveCount(0);
    await dialog.getByLabel("Movement").selectOption("flying");
    await expect(abilities.getByRole("button", { name: "Patrol" })).toHaveCount(0);
    await dialog.getByLabel("Movement").selectOption("ground");
    const deathNote = dialog.getByText("Without Death, the enemy stays on stage at zero health.");
    await expect(deathNote).toHaveCount(0);
    await abilities.getByRole("button", { name: "Death" }).click();
    await expect(deathNote).toBeVisible();
    await abilities.getByRole("button", { name: "Death" }).click();
    await expect(deathNote).toHaveCount(0);
    await abilities.getByRole("button", { name: "Patrol" }).click();
    // The fixture animation has idle alone.
    await expect(dialog.getByText("Your animation has no clip for: walk")).toBeVisible();
    const order = dialog.getByRole("group", { name: "Order" });
    await expect(order).toContainText("1. Death");
    await order.getByRole("button", { name: "Move Patrol up" }).click();
    await expect(order).toContainText("1. Patrol");
    const conflicts = order
      .getByRole("group", { name: "Patrol" })
      .getByRole("group", { name: "Conflicts with" });
    await expect(conflicts.getByRole("button")).toHaveText(["Death"]);
    await conflicts.getByRole("button", { name: "Death" }).click();
    await expect(conflicts.getByRole("button", { name: "Death" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  };
  await fillBlob();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row("Blob")).toHaveAttribute("aria-current", "true");

  // Ctrl+Z right after removes it.
  await expect(newObject).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(row("Blob")).toHaveCount(0);

  // Open in Enemy editor creates it and opens its tab, still picked for placing.
  await toEnemies();
  await fillBlob();
  await dialog.getByRole("button", { name: "Open in Enemy editor" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Blob", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Enemy · blob")).toBeVisible();
  await expect(row("Blob")).toHaveAttribute("aria-current", "true");
  await page.getByRole("tab", { name: "Level", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  // Problems says which clips its animation lacks; Play still runs.
  await expect(
    page.getByText("Enemy 'blob' animation 'anim.player.fixture' has no clip for: walk."),
  ).toBeVisible();

  // A template still goes through the enemy form, as before.
  await toEnemies();
  await templates.getByRole("button", { name: "Metool" }).click();
  await expect(dialog.getByText("Enemies · based on Metool")).toBeVisible();
  await dialog.getByLabel("Name").fill("Crab");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row("Crab")).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  const gameData = JSON.parse(readFileSync(join(projectRoot, "data/game.json"), "utf8"));
  expect(gameData.actors["enemy.blob"]).toEqual({
    id: "enemy.blob",
    body: { hw: 8, hh: 8 },
    maxHealth: 2,
  });
  expect(gameData.enemies.blob).toMatchObject({
    sheet: "anim.player.fixture",
    touchDamage: 2,
    movement: "ground",
    abilities: ["Patrol", "Death"],
    abilityConfig: { Patrol: { conflicts: ["Death"] }, Death: { explosionDuration: 0 } },
    reactions: { idle: ["Patrol"] },
    initialAnimation: "idle",
  });
  expect(gameData.enemies.crab.abilities).toEqual(["Patrol", "Hide", "Stun", "Death"]);

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-enemy-kinds]")).toHaveAttribute("data-enemy-kinds", /\bblob\b/);
  await expect(page.getByText(/Could not start Play|Play error|Fix \d+ error/)).toHaveCount(0);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();
});
