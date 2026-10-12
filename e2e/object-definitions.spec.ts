import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

let app: ElectronApplication;
let projectRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
});

async function saveManifest(page: Page) {
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  await expect(page.getByText("Project saved.")).toHaveCount(0, { timeout: 15_000 });
  return JSON.parse(readFileSync(join(projectRoot, "project.json"), "utf8"));
}

test("project objects: create from an instance, edit, save, and delete once unused", async () => {
  // Fixture plus a built-in moving platform and an instance of a project object.
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-object-defs-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const manifestPath = join(projectRoot, "project.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.objects = [
    { id: "obj.fast", name: "Fast Platform", base: "platform.moving", values: { Speed: 120 }, exposed: ["Travel"] },
  ];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const levelPath = join(projectRoot, "levels/level.main.json");
  const level = JSON.parse(readFileSync(levelPath, "utf8"));
  level.objects.push(
    { id: "plat.e2e", definitionId: "platform.moving", x: 96, y: 96, width: 48, height: 8 },
    { id: "fast.e2e", definitionId: "obj.fast", x: 160, y: 96, width: 48, height: 8 },
  );
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
  page.on("dialog", (dialog) => void dialog.accept());
  await expect(page.locator("#viewport-canvas")).toBeVisible({ timeout: 30_000 });

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  const select = async (id: string) => {
    await page.getByRole("tab", { name: /Scene/ }).click();
    await page.getByTitle(id, { exact: true }).click();
    await page.getByRole("tab", { name: "Inspector" }).click();
  };
  const palette = async () => page.getByRole("tab", { name: "Object Palette" }).click();

  // The project object is in the palette, and in use, so it cannot be deleted.
  await palette();
  await expect(page.getByTitle("Place Fast Platform", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Fast Platform" })).toBeDisabled();

  // Its instance edits only the exposed property; the definition section edits the rest.
  await select("fast.e2e");
  await expect(page.getByText("Object · Fast Platform")).toBeVisible();
  const travelFields = page.getByLabel("Travel", { exact: true });
  await expect(travelFields).toHaveCount(2); // instance + definition
  await expect(page.getByLabel("Speed", { exact: true })).toHaveCount(1); // definition only
  await page.getByLabel("Speed", { exact: true }).fill("150");
  await page.getByLabel("Speed", { exact: true }).press("Enter");
  await page.getByLabel("Name", { exact: true }).fill("Rapid Platform");
  await page.getByLabel("Name", { exact: true }).press("Enter");
  await expect(page.getByText("Object · Rapid Platform")).toBeVisible();

  // Exposing Speed gives the instance a Speed control too.
  const perInstance = page.getByRole("checkbox", { name: "Editable per instance" });
  await expect(perInstance.nth(1)).not.toBeChecked();
  await page.getByText("Editable per instance", { exact: true }).nth(1).click();
  await expect(perInstance.nth(1)).toBeChecked();
  await expect(page.getByLabel("Speed", { exact: true })).toHaveCount(2);

  let saved = await saveManifest(page);
  expect(saved.objects).toEqual([
    {
      id: "obj.fast",
      name: "Rapid Platform",
      base: "platform.moving",
      values: { Speed: 150 },
      exposed: ["Travel", "Speed"],
    },
  ]);

  // A built-in instance becomes a new project object with its current values.
  await select("plat.e2e");
  await page.getByRole("button", { name: "New object from this" }).click();
  await palette();
  const copy = page.getByTitle("Place Moving Platform copy", { exact: true });
  await expect(copy).toBeVisible();
  await page.getByRole("button", { name: "Delete Moving Platform copy" }).click();
  await expect(copy).toHaveCount(0);

  saved = await saveManifest(page);
  expect(saved.objects.map((o: { id: string }) => o.id)).toEqual(["obj.fast"]);
  expect(pageErrors).toEqual([]);
});

test("a level instance of a removed project object shows as missing instead of crashing", async () => {
  // Reuses the app and project of the first test: undo a placement of a deleted object.
  const page = await app.firstWindow();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // Create an object, place it, delete the instance, then delete the object.
  await page.getByRole("tab", { name: /Scene/ }).click();
  await page.getByTitle("plat.e2e", { exact: true }).click();
  await page.getByRole("tab", { name: "Inspector" }).click();
  await page.getByRole("button", { name: "New object from this" }).click();
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await page.getByTitle("Place Moving Platform copy", { exact: true }).click();
  const canvas = page.locator("#viewport-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.keyboard.press("Delete");
  const del = page.getByRole("button", { name: "Delete Moving Platform copy" });
  await expect(del).toBeEnabled();
  await del.click();
  await expect(page.getByTitle("Place Moving Platform copy", { exact: true })).toHaveCount(0);

  // Undo brings the instance back; it renders as a missing object and blocks Play.
  await page.keyboard.press("Control+z");
  await page.getByRole("tab", { name: /Scene/ }).click();
  await expect(page.getByText("Missing Objects")).toBeVisible();
  await page.getByRole("tab", { name: /^Problems/ }).click();
  await expect(page.getByText(/Unknown object definition 'obj\.platform\.moving\.\d+'/).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});
