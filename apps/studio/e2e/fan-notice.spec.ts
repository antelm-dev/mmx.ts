import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
// A fresh profile, unlike the other specs: this one must see a real first launch.
const profile = mkdtempSync(join(tmpdir(), "mmx-studio-notice-"));

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js"), `--user-data-dir=${profile}`],
    cwd: appRoot,
    env,
  });
  const page = await app.firstWindow();
  // Attached, not visible: a fresh profile opens the Start tab over the level.
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  return { app, page };
}

test.afterAll(() => rmSync(profile, { recursive: true, force: true }));

test("fan notice shows on first launch only, and stays in Help → About", async () => {
  const first = await launch();
  try {
    const notice = first.page.getByTestId("fan-notice");
    await expect(notice).toContainText("© Capcom");
    await expect(notice).toContainText("not affiliated");
    await expect(notice).toContainText("takedown");
    await first.page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(notice).toBeHidden();
  } finally {
    await first.app.close();
  }

  const second = await launch();
  try {
    const notice = second.page.getByTestId("fan-notice");
    await expect(notice).toBeHidden();
    await second.page.getByRole("button", { name: "Help menu" }).click();
    await second.page.getByRole("menuitem", { name: "About MMX Studio" }).click();
    await expect(notice).toContainText("© Capcom");
    await second.page.keyboard.press("Escape");
    await expect(notice).toBeHidden();
  } finally {
    await second.app.close();
  }
});
