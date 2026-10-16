import { cpSync, mkdtempSync, rmSync } from "node:fs";
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

test("recent parts bar: placed parts show, 1 to 8 pick them, Q opens the part wheel", async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-recent-parts-"));
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
  const canvas = page.locator("#viewport-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  const bar = page.getByRole("toolbar", { name: "Recent parts" });
  const slots = bar.getByRole("button");
  const wheel = page.getByRole("menu", { name: "Part categories" });
  const toolCard = (label: string) => page.getByText(label, { exact: true });
  // Nothing placed yet: no bar.
  await expect(bar).toHaveCount(0);
  await expect(toolCard("Select / move")).toBeVisible();

  // Place a Metool from the palette; the tool card names it.
  const box = (await canvas.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const activity = page.getByRole("navigation", { name: "Activity bar" });
  await activity.getByRole("button", { name: "Objects" }).click();
  await page.getByTitle("Place Metool", { exact: true }).click();
  await expect(toolCard("Place: Metool")).toBeVisible();
  await expect(slots).toHaveCount(1);

  // Hidden in Play (before anything is placed: the fixture binds no enemy sprites), back after Stop.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(bar).toHaveCount(0);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();
  await expect(slots).toHaveCount(1);
  await page.keyboard.press("1");
  await expect(toolCard("Place: Metool")).toBeVisible();
  await page.mouse.click(centre.x - 64, centre.y);

  // Q opens the wheel at the pointer; arrows and Enter pick a decoration from it.
  await page.mouse.move(centre.x, centre.y);
  await page.keyboard.press("q");
  await expect(wheel).toBeVisible();
  await expect(wheel.getByRole("menuitem", { name: "Enemies" })).toBeVisible();
  const close = (await wheel.getByRole("menuitem", { name: "Close part wheel" }).boundingBox())!;
  expect(Math.abs(close.x + close.width / 2 - centre.x)).toBeLessThan(2);
  expect(Math.abs(close.y + close.height / 2 - centre.y)).toBeLessThan(2);
  // From the first category, Left reaches the centre button, then the last category.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(wheel.getByRole("menuitem", { name: "Decorations" })).toBeFocused();
  await page.keyboard.press("Enter");
  const decorations = page.getByRole("menu", { name: "Decorations parts" });
  await expect(decorations.getByRole("menuitem", { name: "Place Life Capsule" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(decorations).toHaveCount(0);
  await expect(toolCard("Place: Life Capsule")).toBeVisible();
  await page.mouse.click(centre.x + 64, centre.y);

  // Newest first; 1 and 2 pick the slots, the active one is marked.
  await expect(slots).toHaveCount(2);
  await expect(slots.nth(0)).toHaveAccessibleName("Place Life Capsule");
  await expect(slots.nth(1)).toHaveAccessibleName("Place Metool");
  await page.keyboard.press("Escape");
  await expect(toolCard("Select / move")).toBeVisible();
  await page.keyboard.press("1");
  await expect(toolCard("Place: Life Capsule")).toBeVisible();
  await expect(slots.nth(0)).toHaveAttribute("aria-pressed", "true");
  // Picking from the bar keeps its order: 2 twice is still the second part.
  await page.keyboard.press("2");
  await expect(toolCard("Place: Metool")).toBeVisible();
  // Nor does another "ui" change (the grid) while that part is active.
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await page.keyboard.press("2");
  await expect(toolCard("Place: Metool")).toBeVisible();
  await expect(slots.nth(0)).toHaveAccessibleName("Place Life Capsule");
  await expect(slots.nth(1)).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "Place Life Capsule" }).click();
  await expect(toolCard("Place: Life Capsule")).toBeVisible();
  await expect(slots.nth(0)).toHaveAccessibleName("Place Life Capsule");

  // Escape closes the wheel without changing the tool; so does a click outside it.
  await page.keyboard.press("q");
  await expect(wheel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(wheel).toHaveCount(0);
  await expect(toolCard("Place: Life Capsule")).toBeVisible();
  await page.keyboard.press("q");
  await page.mouse.click(box.x + 8, box.y + box.height - 8);
  await expect(wheel).toHaveCount(0);

  // Mouse path: a category, then a part.
  await page.mouse.move(centre.x, centre.y);
  await page.keyboard.press("q");
  await wheel.getByRole("menuitem", { name: "Enemies" }).click();
  await page.getByRole("menu", { name: "Enemies parts" }).getByLabel("Place Metool").click();
  await expect(toolCard("Place: Metool")).toBeVisible();
  // A pick from the wheel reorders the bar.
  await expect(slots.nth(0)).toHaveAccessibleName("Place Metool");

  // Text fields keep Q and digits.
  const search = page.getByLabel("Search objects");
  await search.fill("");
  await search.press("q");
  await search.press("1");
  await expect(search).toHaveValue("q1");
  await expect(wheel).toHaveCount(0);
  await expect(toolCard("Place: Metool")).toBeVisible();

  // A new enemy leads the bar; undoing its creation (a game-data-only edit) drops its slot,
  // and key 1 picks what slot 1 shows.
  await search.fill("");
  await page.getByRole("button", { name: "New object…" }).click();
  const dialog = page.getByRole("dialog", { name: "New object" });
  await dialog.getByRole("button", { name: "Enemies" }).click();
  await dialog.getByRole("button", { name: "Metool" }).click();
  await dialog.getByLabel("Name").fill("Crab");
  await dialog.getByLabel("Animation").selectOption("anim.player.fixture");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toolCard("Place: Crab")).toBeVisible();
  await expect(slots).toHaveCount(3);
  await expect(slots.nth(0)).toHaveAccessibleName("Place Crab");
  // Ctrl+Z from the palette undoes the definition edit.
  await search.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTitle("Place Crab", { exact: true })).toHaveCount(0);
  await expect(slots).toHaveCount(2);
  await expect(slots.nth(0)).toHaveAccessibleName("Place Metool");
  await search.blur();
  await page.keyboard.press("1");
  await expect(toolCard("Place: Metool")).toBeVisible();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
