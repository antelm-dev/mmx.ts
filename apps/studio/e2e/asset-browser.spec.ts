import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";
import { encodePng } from "../src/project-io/import/png";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// The fixture plus a tileset; the plain second copy is the "other project".
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-asset-browser-"));
const otherRoot = mkdtempSync(join(tmpdir(), "mmx-asset-browser-other-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });
cpSync(fixtureRoot, otherRoot, { recursive: true });
mkdirSync(join(projectRoot, "assets/tilesets"));
writeFileSync(
  join(projectRoot, "assets/tilesets/ground.png"),
  encodePng({ width: 32, height: 16, px: new Uint8Array(32 * 16 * 4).fill(200) }),
);
const manifestPath = join(projectRoot, "project.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.assets.push({
  id: "tileset.ground",
  kind: "tileset",
  path: "assets/tilesets/ground.png",
  tileSize: 16,
  collision: {},
});
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  for (const dir of [projectRoot, otherRoot]) rmSync(dir, { recursive: true, force: true });
});

test("AC-BROWSER: Assets lists the project's assets and opens each in its own document tab", async () => {
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

  const openProject = async (root: string) => {
    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, root);
    await page.getByRole("button", { name: "File menu" }).click();
    await page.getByRole("menuitem", { name: /Open Project/ }).click();
    await expect(page.getByText(/Opened project 'Fixture Project'/).last()).toBeVisible();
  };
  const showAssets = () =>
    page
      .getByRole("navigation", { name: "Activity bar" })
      .getByRole("button", { name: "Assets" })
      .click();
  const browser = page.getByTestId("asset-browser");
  const asset = (id: string) => browser.locator(`[data-asset-kind][title="${id}"]`);
  const group = (label: string) => browser.getByRole("button", { name: new RegExp(`^${label}`) });
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });
  const levelTab = tab("Level");

  // Without a project only the built-in enemies are listed.
  await showAssets();
  await expect(page.getByText("Open a project to see its assets.")).toBeVisible();
  await expect(asset("enemy.metool")).toContainText("built-in");
  await expect(browser.locator('[data-asset-kind]:not([data-asset-kind="enemy"])')).toHaveCount(0);

  await openProject(projectRoot);
  // A project enemy (as in new-enemy.spec) and a project object (a palette duplicate).
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await page.getByRole("button", { name: "New enemy…" }).click();
  const dialog = page.getByRole("dialog", { name: "New enemy" });
  await dialog.getByLabel("Name").fill("Crab");
  await dialog.getByLabel("Based on").selectOption("metool");
  await dialog.getByLabel("Animation").selectOption("anim.player.fixture");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  const platform = page.getByTitle("Place Moving Platform", { exact: true });
  await platform.hover();
  await page.getByRole("button", { name: "Duplicate Moving Platform" }).click();
  const platformCopy = page.getByTitle("Place Moving Platform copy", { exact: true });
  await expect(platformCopy).toBeVisible();

  await showAssets();
  await expect(page.getByText("Open a project to see its assets.")).toHaveCount(0);
  for (const [label, count] of [
    ["Tilesets", 1],
    ["Sprites", 1],
    ["Animations", 2],
    ["Images", 1],
    ["Sounds", 1],
    ["Objects", 1],
  ] as const) {
    await expect(group(label)).toHaveText(`${label}${count}`);
  }
  await expect(asset("enemy.crab")).not.toContainText("built-in");
  // Search filters every group; a collapsed group hides its rows.
  const search = page.getByLabel("Search assets");
  await search.fill("crab");
  await expect(browser.locator("[data-asset-kind]")).toHaveCount(1);
  await search.fill("");
  await group("Sounds").click();
  await expect(asset("sfx.jump")).toHaveCount(0);
  await group("Sounds").click();

  // Double-click an enemy: its Enemy tab covers the level.
  await asset("enemy.metool").dblclick();
  await expect(tab("Metool")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Enemy · metool")).toBeVisible();
  await expect(canvas).toBeHidden();
  // Enter opens too; several enemies stay open side by side.
  await asset("enemy.crab").focus();
  await page.keyboard.press("Enter");
  await expect(tab("Crab")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Enemy · crab")).toBeVisible();
  await expect(tab("Metool")).toHaveCount(1);
  // A tileset opens its tileset document.
  await asset("tileset.ground").dblclick();
  await expect(tab("tileset.ground")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("tileset-document")).toBeVisible();
  // An open asset surfaces its tab instead of opening another.
  await asset("enemy.metool").dblclick();
  await expect(tab("Metool")).toHaveCount(1);
  await expect(tab("Metool")).toHaveAttribute("aria-selected", "true");
  // Animations open the Clip Editor, sprites and images the Sheet Slicer, on that asset.
  await asset("anim.effect.fixture").dblclick();
  await expect(page.getByTestId("clip-editor").getByLabel("Animation asset")).toHaveValue(
    "anim.effect.fixture",
  );
  await asset("sprite.bg").dblclick();
  await expect(tab("sprite.bg")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.bg");
  // A sound has no document; an object is picked for placing.
  const tabs = await page.getByRole("tab").count();
  await asset("sfx.jump").dblclick();
  await expect(page.getByRole("tab")).toHaveCount(tabs);
  await browser.locator('[data-asset-kind="object"]').dblclick();
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await expect(platformCopy).toHaveAttribute("aria-current", "true");

  // Play brings the level tab back to draw into.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(levelTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();

  // Another project has neither the Crab nor the tileset: their tabs say so.
  await openProject(otherRoot);
  await tab("Crab").click();
  await expect(page.getByText("Enemy 'enemy.crab' is not in the open project.")).toBeVisible();
  await tab("tileset.ground").click();
  await expect(
    page.getByText("Tileset “tileset.ground” is not in the open project."),
  ).toBeVisible();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
