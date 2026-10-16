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

test("Copy two objects, switch level, paste at the pointer with new ids; Ctrl+Z removes them", async () => {
  // The fixture's level with two Metools, plus a second level `level.b` holding only the spawn.
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-copy-paste-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const readJson = (path: string) => JSON.parse(readFileSync(join(projectRoot, path), "utf8"));
  const main = readJson("levels/level.main.json");
  writeFileSync(
    join(projectRoot, "levels/level.b.json"),
    JSON.stringify({ ...main, id: "level.b", name: "Second Level" }),
  );
  main.objects.push(
    { id: "m1", definitionId: "enemy.metool", x: 96, y: 160 },
    { id: "m2", definitionId: "enemy.metool", x: 144, y: 176 },
  );
  writeFileSync(join(projectRoot, "levels/level.main.json"), JSON.stringify(main));
  const manifest = readJson("project.json");
  manifest.levels.push({ id: "level.b", path: "levels/level.b.json" });
  writeFileSync(join(projectRoot, "project.json"), JSON.stringify(manifest));

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

  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  /** The Scene tab title tracks the object + decoration count: "Scene (N)". */
  const sceneCount = async () => {
    const title = await page.getByRole("tab", { name: /Scene/ }).textContent();
    return Number(/\((\d+)\)/.exec(title ?? "")?.[1]);
  };

  // Select both Metools in the Scene panel and copy them.
  await page.getByRole("tab", { name: /Scene/ }).click();
  await page.getByTitle("m1", { exact: true }).click();
  await page.getByTitle("m2", { exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await page.keyboard.press("ControlOrMeta+c");

  // Switch to level B and paste with the pointer over the canvas.
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  const levelB = page.getByTitle("level.b", { exact: true });
  await levelB.click();
  await expect(levelB).toHaveAttribute("aria-current", "true");
  await expect.poll(sceneCount).toBe(1);
  const canvas = page.locator("#viewport-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(sceneCount).toBe(3);

  // Saved: two Metools with new ids, the same layout, the copy's top-left on the grid.
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /^Save/ }).click();
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  const level = readJson("levels/level.b.json");
  const pasted = level.objects.filter(
    (o: { definitionId: string }) => o.definitionId === "enemy.metool",
  );
  expect(pasted).toHaveLength(2);
  const [a, b] = pasted as { id: string; x: number; y: number }[];
  expect([a!.id, b!.id]).not.toContain("m1");
  expect([a!.id, b!.id]).not.toContain("m2");
  expect([b!.x - a!.x, b!.y - a!.y]).toEqual([48, 16]);
  expect(a!.x % level.gridSize).toBe(0);
  expect(a!.y % level.gridSize).toBe(0);
  expect(a!.x).toBeGreaterThanOrEqual(0);
  expect(b!.y).toBeLessThan(level.rows * level.gridSize);

  // One undo step removes the whole paste.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(sceneCount).toBe(1);

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
