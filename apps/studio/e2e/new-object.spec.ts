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

test("AC-NEWOBJ: New object… makes an object of every category, picked for placing and undoable", async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-new-object-"));
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
  const canvas = page.locator("#viewport-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  await page.getByRole("tab", { name: "Object Palette" }).click();
  const newObject = page.getByRole("button", { name: "New object…" });
  const dialog = page.getByRole("dialog", { name: "New object" });
  const categories = dialog.getByRole("group", { name: "Categories" }).getByRole("button");
  const bases = dialog.getByRole("group", { name: "Behaviour" }).getByRole("button");
  const row = (name: string) => page.getByTitle(`Place ${name}`, { exact: true });
  const box = (await canvas.boundingBox())!;
  let placed = 0;
  /** Create through the dialog's last step, then place one where nothing is yet. */
  const createAndPlace = async (name: string) => {
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(name)).toHaveAttribute("aria-current", "true");
    await canvas.click({ position: { x: box.width / 2 - 160 + 64 * placed++, y: box.height / 2 } });
  };

  // Every catalog category but spawns (one per level) and missing objects; Escape closes it.
  await newObject.click();
  await expect(categories).toHaveText([
    "Enemies",
    "Pickups",
    "Platforms",
    "Conveyors",
    "Hazards",
    "Slopes",
    "Camera Zones",
  ]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // By keyboard alone: a pickup, which has no values (a renamed copy).
  await newObject.click();
  await expect(categories.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  // The Behaviour step: each choice with what it does.
  await expect(dialog.getByText("Pickups · Behaviour")).toBeVisible();
  await expect(bases).toHaveText([
    /^Life Capsule \(Small\)Restores a little life/,
    /^Life Capsule \(Large\)/,
    /^Weapon Capsule \(Small\)/,
    /^Weapon Capsule \(Large\)/,
  ]);
  await expect(bases.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await page.keyboard.type("Big Life");
  await expect(dialog.getByText("Id: obj.pickup.life.small.1")).toBeVisible();
  await dialog.getByRole("button", { name: "Create" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(row("Big Life")).toHaveAttribute("aria-current", "true");
  await canvas.click({ position: { x: box.width / 2 - 160 + 64 * placed++, y: box.height / 2 } });

  // A moving platform with its own values, Travel fixed for every instance.
  await newObject.click();
  await categories.filter({ hasText: "Platforms" }).click();
  await bases.filter({ hasText: "Moving Platform" }).click();
  await dialog.getByLabel("Name").fill("Fast Platform");
  await dialog.getByLabel("Speed", { exact: true }).fill("120");
  await dialog.getByLabel("Speed", { exact: true }).press("Enter");
  await dialog.getByRole("combobox", { name: "Axis" }).click();
  await page.getByRole("option", { name: "vertical" }).click();
  await dialog.getByText("Editable per instance").first().click();
  await createAndPlace("Fast Platform");

  // With several behaviours, Back returns to the previous step.
  await newObject.click();
  await categories.filter({ hasText: "Platforms" }).click();
  await bases.filter({ hasText: "Falling Platform" }).click();
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(bases).toHaveCount(2);
  await expect(bases.first()).toBeFocused();
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(categories.first()).toBeFocused();

  // A category with a single behaviour skips that step, and Back from its values
  // returns to the categories.
  await categories.filter({ hasText: "Conveyors" }).click();
  await expect(bases).toHaveCount(0);
  await expect(dialog.getByText("Conveyors · Conveyor")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(categories.first()).toBeFocused();
  await categories.filter({ hasText: "Conveyors" }).click();
  await dialog.getByLabel("Name").fill("Slow Belt");
  await dialog.getByLabel("Speed", { exact: true }).fill("20");
  await dialog.getByLabel("Speed", { exact: true }).press("Enter");
  await createAndPlace("Slow Belt");

  await newObject.click();
  await categories.filter({ hasText: "Hazards" }).click();
  await expect(dialog.getByText("Hazards · Hazard")).toBeVisible();
  await dialog.getByLabel("Name").fill("Spikes");
  await createAndPlace("Spikes");

  await newObject.click();
  await categories.filter({ hasText: "Slopes" }).click();
  await dialog.getByLabel("Name").fill("Ramp");
  await createAndPlace("Ramp");

  await newObject.click();
  await categories.filter({ hasText: "Camera Zones" }).click();
  await dialog.getByLabel("Name").fill("Lock Y");
  await dialog.getByText("Bind X", { exact: true }).click();
  await createAndPlace("Lock Y");

  // Ctrl+Z right after creating one removes it from the palette.
  await newObject.click();
  await categories.filter({ hasText: "Hazards" }).click();
  await dialog.getByLabel("Name").fill("Doomed");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row("Doomed")).toBeVisible();
  await expect(newObject).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(row("Doomed")).toHaveCount(0);

  // The Assets header opens it too: an enemy goes through the enemy form.
  await page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Assets" })
    .click();
  const browser = page.getByTestId("asset-browser");
  await browser.getByRole("button", { name: "New object…" }).click();
  await categories.filter({ hasText: "Enemies" }).click();
  await expect(dialog.getByRole("group", { name: "Templates" }).getByRole("button")).toHaveText([
    "Metool",
    "Bat",
    "Pantheon Hunter",
  ]);
  await bases.filter({ hasText: "Bat" }).click();
  await dialog.getByLabel("Name").fill("Night Bat");
  await expect(dialog.getByText("Id: enemy.night-bat")).toBeVisible();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(browser.locator('[data-asset-id="enemy.night-bat"]')).toBeVisible();
  await expect(browser.locator('[data-asset-id="obj.camera-zone.1"]')).toBeVisible();
  await expect(browser.locator('[data-asset-id="obj.hazard.2"]')).toHaveCount(0);

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  const manifest = JSON.parse(readFileSync(join(projectRoot, "project.json"), "utf8"));
  // Saved sorted by id.
  expect(manifest.objects).toEqual([
    {
      id: "obj.camera-zone.1",
      name: "Lock Y",
      base: "camera-zone",
      values: { BindX: false, BindY: true },
    },
    { id: "obj.conveyor.1", name: "Slow Belt", base: "conveyor", values: { Speed: 20 } },
    { id: "obj.hazard.1", name: "Spikes", base: "hazard" },
    { id: "obj.pickup.life.small.1", name: "Big Life", base: "pickup.life.small" },
    {
      id: "obj.platform.moving.1",
      name: "Fast Platform",
      base: "platform.moving",
      values: { Travel: 96, Speed: 120, Axis: "vertical" },
      exposed: ["Speed", "Axis"],
    },
    { id: "obj.slope.1", name: "Ramp", base: "slope", values: { Dir: "UpRight" } },
  ]);
  const gameData = JSON.parse(readFileSync(join(projectRoot, "data/game.json"), "utf8"));
  expect(gameData.enemies["night-bat"]).toMatchObject({ id: "night-bat" });
  const level = JSON.parse(readFileSync(join(projectRoot, "levels/level.main.json"), "utf8"));
  const ids = level.objects.map((o: { definitionId: string }) => o.definitionId);
  expect(ids).toEqual(expect.arrayContaining(manifest.objects.map((o: { id: string }) => o.id)));
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
