import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type Page } from "@playwright/test";
import electronPath from "electron";
import { RECENT_PROJECTS_KEY } from "./global-setup.js";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// A fresh profile, unlike most specs: the start page shows by default and recents start empty.
const profile = mkdtempSync(join(tmpdir(), "mmx-studio-start-"));

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
  page.on("dialog", (dialog) => void dialog.accept());
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  return { app, page };
}

const startTab = (page: Page) => page.getByRole("tab", { name: "Start" });
const recents = (page: Page) => page.getByRole("region", { name: "Recent projects" });

/** Distinct colours in a screenshot of the viewport canvas (a cleared canvas has one). */
async function canvasColors(page: Page): Promise<number> {
  const png = await page.locator("#viewport-canvas").screenshot();
  return page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4)
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return seen.size;
    },
    [...png],
  );
}

test.afterAll(() => rmSync(profile, { recursive: true, force: true }));

test("first launch shows the Start tab; Blank level closes it and the canvas responds", async () => {
  const { app, page } = await launch();
  try {
    await page.getByRole("button", { name: "OK", exact: true }).click(); // first-launch notice
    await expect(startTab(page)).toHaveAttribute("aria-selected", "true");
    await expect(recents(page)).toContainText("No recent projects yet.");
    await expect(page.locator("#viewport-canvas")).toBeHidden();

    await page.getByRole("button", { name: "Blank level" }).click();
    await expect(startTab(page)).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Level" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#viewport-canvas")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "New level created." })).toBeVisible();
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(1);
  } finally {
    await app.close();
  }
});

test("a project opened from Start reopens from Recent after a restart", async () => {
  const first = await launch();
  try {
    await expect(startTab(first.page)).toBeVisible();
    await first.app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, fixtureRoot);
    await first.page.getByRole("button", { name: "Open project…" }).click();
    await expect(first.page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
    await expect(startTab(first.page)).toHaveCount(0);
  } finally {
    await first.app.close();
  }

  const second = await launch();
  const { page } = second;
  try {
    await page.getByRole("tab", { name: "Start" }).click();
    await recents(page)
      .getByRole("button", { name: /Fixture Project/ })
      .click();
    await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
    await expect(startTab(page)).toHaveCount(0);

    // A recent project whose folder is gone shows the error and can be removed.
    const missing = join(profile, "missing-project");
    await page.evaluate(
      ([key, rootPath]) => {
        const list = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
        const entry = { rootPath, name: "Missing Project", openedAt: Date.now() };
        localStorage.setItem(key, JSON.stringify([entry, ...list]));
      },
      [RECENT_PROJECTS_KEY, missing] as const,
    );
    await page.getByRole("button", { name: "Help menu" }).click();
    await page.getByRole("menuitem", { name: "Start Page" }).click();
    await expect(startTab(page)).toHaveAttribute("aria-selected", "true");
    await recents(page)
      .getByRole("button", { name: /Missing Project/ })
      .click();
    const alert = recents(page).getByRole("alert");
    await expect(alert).toContainText("Project manifest not found");
    await expect(startTab(page)).toBeVisible();
    // The failed open leaves Fixture Project open (Export needs an open project).
    await page.getByRole("button", { name: "File menu" }).click();
    await expect(page.getByRole("menuitem", { name: /Export Project/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("Escape");
    await alert.getByRole("button", { name: "Remove from list" }).click();
    await expect(recents(page).getByRole("button", { name: /Missing Project/ })).toHaveCount(0);
    await expect(alert).toHaveCount(0);
    await expect(recents(page).getByRole("button", { name: /Fixture Project/ })).toBeVisible();

    const showAtLaunch = page.getByRole("checkbox", { name: "Show at launch" });
    await expect(showAtLaunch).toBeChecked();
    await showAtLaunch.locator("..").click();
    await expect(showAtLaunch).not.toBeChecked();
  } finally {
    await second.app.close();
  }

  const third = await launch();
  try {
    await expect(third.page.locator("#viewport-canvas")).toBeVisible();
    await expect(startTab(third.page)).toHaveCount(0);
  } finally {
    await third.app.close();
  }
});
