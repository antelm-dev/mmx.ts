import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Locator } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

let app: ElectronApplication;
let projectRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
});

/** The control's border colour equals the theme's danger colour. */
const hasDangerBorder = (input: Locator) =>
  input.evaluate((el) => {
    const probe = document.createElement("div");
    probe.style.color = "var(--studio-danger-fg)";
    document.body.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(el).borderTopColor === danger;
  });

test("Inspector fields, checkbox and select commit, validate and undo", async () => {
  // Minimal fixture plus a slope (resizable, enum) and a camera zone (booleans).
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-inspector-forms-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const levelPath = join(projectRoot, "levels/level.main.json");
  const level = JSON.parse(readFileSync(levelPath, "utf8"));
  level.objects.push(
    { id: "slope.e2e", definitionId: "slope", x: 96, y: 160, width: 32, height: 32 },
    { id: "zone.e2e", definitionId: "camera-zone", x: 0, y: 0, width: 398, height: 224 },
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
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
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
  const undo = () => page.keyboard.press("Control+z");

  await select("slope.e2e");
  const x = page.getByLabel("X", { exact: true });
  const y = page.getByLabel("Y", { exact: true });
  const width = page.getByLabel("Width", { exact: true });
  await expect(x).toHaveValue("96");

  // Typing in a field never reaches editor shortcuts (Backspace would delete the object).
  const grid = page.getByRole("button", { name: "Grid", exact: true });
  const gridPressed = await grid.getAttribute("aria-pressed");
  await x.focus();
  await page.keyboard.press("g");
  await page.keyboard.press("Backspace");
  await expect(grid).toHaveAttribute("aria-pressed", gridPressed!);
  await expect(x).toBeVisible();

  // Enter commits (and leaves the field); blur commits.
  await x.fill("48");
  await x.press("Enter");
  await expect(x).not.toBeFocused();
  await expect(x).toHaveValue("48");
  await y.fill("64");
  await y.blur();
  await expect(y).toHaveValue("64");

  // A rejected value shows the invalid outline until it is undone.
  await expect(width).not.toHaveAttribute("aria-invalid", "true");
  expect(await hasDangerBorder(width)).toBe(false);
  await width.fill("0");
  await width.press("Enter");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  expect(await hasDangerBorder(width)).toBe(true);

  // Each commit is one history entry.
  await undo();
  await expect(width).toHaveValue("32");
  await expect(width).not.toHaveAttribute("aria-invalid", "true");
  await undo();
  await expect(y).toHaveValue("160");
  await expect(x).toHaveValue("48");
  await undo();
  await expect(x).toHaveValue("96");

  // The select list is portalled above Dockview and commits the chosen option.
  const direction = page.getByRole("combobox", { name: "Direction" });
  await expect(direction).toHaveText("UpRight");
  await direction.click();
  const upLeft = page.getByRole("option", { name: "UpLeft" });
  await expect(upLeft).toBeVisible();
  expect(
    await upLeft.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }),
  ).toBe(true);
  await upLeft.click();
  await expect(direction).toHaveText("UpLeft");
  await undo();
  await expect(direction).toHaveText("UpRight");

  // Keyboard selection in the open list does not nudge the selected object.
  await direction.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(upLeft).toBeHidden();
  await expect(direction).toHaveText("UpLeft");
  await expect(x).toHaveValue("96");
  await expect(y).toHaveValue("160");
  // Escape closes the list without clearing the selection.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(upLeft).toBeHidden();
  await expect(x).toHaveValue("96");

  // Checkbox toggles the property and undo restores it.
  await select("zone.e2e");
  const bindX = page.getByRole("checkbox", { name: "Bind X" });
  await expect(bindX).toBeChecked();
  await page.getByText("Bind X", { exact: true }).click();
  await expect(bindX).not.toBeChecked();
  await undo();
  await expect(bindX).toBeChecked();

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
