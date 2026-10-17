import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-palette-base-"));
const projectRoot = join(scratch, "project");

/** The project's data adds a platform of its own: it belongs under Platforms, not Base. */
const OVERLAY = {
  environments: {
    lift: {
      id: "lift",
      behavior: "environment.moving-platform",
      defaults: { travel: 64, speed: 48 },
    },
  },
  prefabs: {
    "platform.lift": {
      id: "platform.lift",
      runtime: "environment",
      source: { kind: "environment", ref: "lift" },
      fields: [{ name: "Speed", type: "number", default: 48, min: 0 }],
    },
  },
};

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

test("AC-BASE: the palette lists the primitives under Base and the project's data apart", async () => {
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  mkdirSync(join(projectRoot, "data"), { recursive: true });
  writeFileSync(join(projectRoot, "data/game.json"), JSON.stringify(OVERLAY, null, 2));
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
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  await page.getByRole("button", { name: "OK", exact: true }).click(); // first-launch notice

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  await page.getByRole("tab", { name: "Object Palette" }).click();

  const search = page.getByLabel("Search objects");
  /** The palette's rendered rows in order: "# Section" headers, then object names. */
  const outline = () =>
    search.evaluate((input) => {
      let panel = input.parentElement!;
      while (!panel.querySelector('[title^="Place "]')) panel = panel.parentElement!;
      return [...panel.querySelectorAll('[role="heading"], [title^="Place "]')].map((el) =>
        el.getAttribute("role") === "heading"
          ? `# ${el.textContent}`
          : el.getAttribute("title")!.slice("Place ".length),
      );
    });

  await expect(page.getByRole("heading", { name: "Base", exact: true })).toBeVisible();
  expect((await outline())[0]).toBe("# Base");
  await page.screenshot({ path: test.info().outputPath("palette.png") });

  // Searched one by one, so the virtualized list never hides one below the fold.
  for (const name of ["Spawn", "Hazard", "Camera Zone", "Slope"]) {
    await search.fill(name);
    await expect.poll(outline).toEqual(["# Base", name]);
  }
  await search.fill("Lift");
  await expect.poll(outline).toEqual(["# Platforms", "Lift"]);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");

  expect(pageErrors).toEqual([]);
});
