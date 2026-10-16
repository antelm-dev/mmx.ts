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

test("problems show as canvas badges that select and frame their object, hidden in Play", async () => {
  // The minimal fixture plus a Metool wholly past the right edge (an error), one far off any
  // view, and a platform overhanging the edge (a warning, which does not block Play).
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-badges-"));
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const levelPath = join(projectRoot, "levels/level.main.json");
  const level = JSON.parse(readFileSync(levelPath, "utf8"));
  const worldW = level.cols * level.gridSize;
  level.objects.push(
    { id: "metool.oob", definitionId: "enemy.metool", x: worldW + 40, y: 96 },
    { id: "metool.far", definitionId: "enemy.metool", x: worldW + 5000, y: 96 },
    {
      id: "platform.edge",
      definitionId: "platform.moving",
      x: worldW - 8,
      y: 160,
      width: 48,
      height: 8,
    },
  );
  writeFileSync(levelPath, JSON.stringify(level, null, 2));
  // The fixture binds no enemy sheet; reuse its one animation so the Metool can be drawn in Play.
  const dataPath = join(projectRoot, "game/data.json");
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  data.bindings.enemyAnimations = { metool: "anim.player.fixture" };
  writeFileSync(dataPath, JSON.stringify(data, null, 2));

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

  const badges = page.getByTestId("problem-badge");
  const errorBadge = page.locator('[data-anchor="object:metool.oob"]');
  const farBadge = page.locator('[data-anchor="object:metool.far"]');
  const warningBadge = page.locator('[data-testid="problem-badge"][data-severity="warning"]');
  await expect(page.locator('[data-testid="problem-badge"][data-severity="error"]')).toHaveCount(2);
  await expect(warningBadge).toHaveCount(1);
  await expect(errorBadge).toHaveAccessibleName(/outside the level bounds/);

  // A badge off the view leaves the Tab order, and focusing it scrolls nothing: badges stay
  // aligned with the canvas.
  await expect(farBadge).toHaveAttribute("tabindex", "-1");
  const scrolled = await farBadge.evaluate((badge) => {
    badge.focus();
    const host = document.getElementById("viewport-canvas")!.parentElement!;
    const offsets: number[] = [];
    for (let el = badge.parentElement; el && el !== host.parentElement; el = el.parentElement)
      offsets.push(el.scrollLeft, el.scrollTop);
    return offsets;
  });
  expect(scrolled.length).toBeGreaterThan(0);
  expect(scrolled.every((offset) => offset === 0)).toBe(true);

  // Zoom out so the badge past the level's edge is on screen (a clipped badge cannot be
  // scrolled into view), then hover it for its messages.
  for (let i = 0; i < 3; i++) await page.keyboard.press("Control+Minus");
  await errorBadge.hover();
  await expect(page.getByRole("tooltip")).toContainText("outside the level bounds");

  // Clicking the badge selects the Metool and centres the view on it.
  await errorBadge.click();
  await page.getByRole("tab", { name: "Inspector" }).click();
  const x = page.getByLabel("X", { exact: true });
  await expect(x).toHaveValue(String(worldW + 40));
  const view = (await canvas.boundingBox())!;
  const badge = (await errorBadge.boundingBox())!;
  expect(Math.abs(badge.x + badge.width / 2 - (view.x + view.width / 2))).toBeLessThan(40);
  expect(Math.abs(badge.y + badge.height / 2 - (view.y + view.height / 2))).toBeLessThan(40);

  // Moving it back inside clears its badge; the platform's warning stays.
  await x.fill("200");
  await x.press("Tab");
  await expect(errorBadge).toHaveCount(0);
  await expect(farBadge).toHaveCount(1);
  await expect(warningBadge).toHaveCount(1);

  // Badges are hidden in Play and back after Stop (the far Metool must come in first).
  await farBadge.evaluate((badge: HTMLElement) => badge.click());
  await expect(x).toHaveValue(String(worldW + 5000));
  await x.fill("100");
  await x.press("Tab");
  await expect(farBadge).toHaveCount(0);
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(badges).toHaveCount(0);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();
  await expect(warningBadge).toHaveCount(1);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
