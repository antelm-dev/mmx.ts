import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-starter-play-"));
const projectRoot = join(scratch, "project");

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

test("a project made from the MMX starter plays with the player standing on ground", async () => {
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
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  await page.getByRole("button", { name: "OK", exact: true }).click(); // first-launch notice

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  // Electron has no window.prompt: answer the project name the way a user would.
  await page.evaluate(() => {
    window.prompt = () => "Starter Test";
  });
  await page.getByRole("button", { name: /New from MMX starter/ }).click();
  await expect(page.getByText(/Starter Test/).first()).toBeVisible();

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play|Play error/)).toHaveCount(0);

  // Lands on the starter's floor and stays there instead of falling out of the level.
  const player = () =>
    page.evaluate(() => {
      const editor = (
        window as unknown as {
          studioEditor: {
            getPlaytestSnapshot(): {
              frame: number;
              runtime: {
                player: { bounds: { y: number; h: number }; velocity: { y: number } };
              } | null;
            };
          };
        }
      ).studioEditor;
      const snapshot = editor.getPlaytestSnapshot();
      return { frame: snapshot.frame, player: snapshot.runtime?.player ?? null };
    });
  await expect.poll(async () => (await player()).frame, { timeout: 15_000 }).toBeGreaterThan(180);
  const { player: landed } = await player();
  expect(landed).not.toBeNull();
  expect(landed!.velocity.y).toBe(0);
  // Rows are 16 px and the starter level has 24 of them.
  expect(landed!.bounds.y + landed!.bounds.h).toBeLessThanOrEqual(24 * 16);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});
