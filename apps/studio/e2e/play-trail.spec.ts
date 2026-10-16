import { cpSync, mkdtempSync, rmSync } from "node:fs";
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

/** The Play inspector's player position, "x, y". */
function playerPosition(page: Page) {
  return page
    .getByText("position", { exact: true })
    .locator("xpath=following-sibling::*[1]")
    .textContent();
}

/** The player's position once it has stopped changing (inspector updates are throttled). */
async function settledPosition(page: Page): Promise<string> {
  let last = "";
  await expect
    .poll(
      async () => {
        const now = (await playerPosition(page)) ?? "";
        const settled = now === last;
        last = now;
        return settled;
      },
      { timeout: 10_000, intervals: [300] },
    )
    .toBe(true);
  return last;
}

test("Stop draws the last run's trail on the level; H hides it; the next run replaces it", async () => {
  // The minimal fixture: Spawn at 32,128 over a floor on row 15 of a 32×16-cell level.
  projectRoot = mkdtempSync(join(tmpdir(), "mmx-play-trail-"));
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
  await page.keyboard.press("f");

  const canvas = page.locator("#viewport-canvas");
  const undo = page.getByRole("button", { name: "Undo" });
  // No run yet: nothing drawn.
  await expect(canvas).toHaveAttribute("data-trail-points", "0");

  // Play, land, walk right for a while, Stop.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => playerPosition(page), { timeout: 10_000 }).toBe("32, 226");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1_500);
  await page.keyboard.up("ArrowRight");
  const walked = await settledPosition(page);
  expect(Number(walked.split(",")[0])).toBeGreaterThan(64);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();

  // The re-simulated trail ends exactly where Play left the player.
  await expect(canvas).toHaveAttribute("data-trail-end", walked);
  const points = Number(await canvas.getAttribute("data-trail-points"));
  expect(points).toBeGreaterThan(10);
  await page.screenshot({ path: test.info().outputPath("trail.png") });
  // Never part of the level: nothing to undo.
  await expect(undo).toBeDisabled();

  // H hides it, H shows it again; editing keeps it.
  await page.keyboard.press("h");
  await expect(canvas).toHaveAttribute("data-trail-points", "0");
  await page.keyboard.press("h");
  await expect(canvas).toHaveAttribute("data-trail-points", String(points));
  await page.keyboard.press("g");
  await expect(canvas).toHaveAttribute("data-trail-end", walked);

  // A Play from here (the copy actually played) replaces it: it ends where that run did.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.getByText("from here", { exact: true })).toBeVisible({ timeout: 30_000 });
  const here = await settledPosition(page);
  expect(here).not.toBe(walked);
  await page.keyboard.press("Escape");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-trail-end", here);

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
