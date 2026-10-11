import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import electronPath from "electron";
import { encodePng } from "../src/project-io/import/png";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// Import and save write into the project, so work on a scratch copy of the fixture.
const projectRoot = mkdtempSync(join(tmpdir(), "mmx-clip-editor-"));
cpSync(fixtureRoot, projectRoot, { recursive: true });
const sheetDir = mkdtempSync(join(tmpdir(), "mmx-clip-png-"));
const sheetPath = join(sheetDir, "sheet.png");

/** 128×64 synthetic sheet: a 4×2 grid of 32×32 cells, a 20×24 figure standing in each (feet at y 28). */
function writeSheet(): void {
  const width = 128;
  const height = 64;
  const px = new Uint8Array(width * height * 4);
  for (let f = 0; f < 8; f++) {
    const cx = (f % 4) * 32 + 6;
    const cy = Math.floor(f / 4) * 32 + 4;
    for (let y = cy; y < cy + 24; y++) for (let x = cx; x < cx + 20; x++) px.set([40, 160, 220, 255], (y * width + x) * 4);
  }
  writeFileSync(sheetPath, encodePng({ width, height, px }));
}

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(sheetDir, { recursive: true, force: true });
});

/** Undo then redo the last command, checking the state on both sides. */
async function undoRedo(page: Page, check: (undone: boolean) => Promise<void>): Promise<void> {
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await check(true);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await check(false);
}

test("clips assembled from a sliced sheet play as the player animation (AC-CLIP)", async () => {
  writeSheet();
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

  const pick = (path: string) =>
    app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, path);
  const menu = async (item: RegExp) => {
    await page.getByRole("button", { name: "File menu" }).click();
    await page.getByRole("menuitem", { name: item }).click();
  };

  await pick(projectRoot);
  await menu(/Open Project/);
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  // Slice the fixture sheet on its 32×32 grid.
  await menu(/Slice Sheet/);
  await pick(sheetPath);
  await page.getByRole("button", { name: /Import sheet/ }).click();
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.sheet");
  await page.getByLabel("Mode").selectOption("grid");
  await page.getByRole("button", { name: "Apply grid" }).click();
  await page.getByRole("button", { name: "Save regions" }).click();

  await menu(/Clip Editor/);
  const panel = page.getByTestId("clip-editor");
  await panel.getByLabel("Sprite sheet").selectOption("sprite.sheet");
  await expect(panel.getByLabel("Animation asset")).toHaveValue("anim.sheet");
  const frames = panel.getByTestId("frame-count");
  const clipSelect = panel.getByLabel("Clip", { exact: true });

  // idle: one frame.
  await panel.getByRole("button", { name: "Region 1", exact: true }).click();
  await panel.getByLabel("Clip name").fill("idle");
  await panel.getByRole("button", { name: "Create clip" }).click();
  await expect(clipSelect).toHaveValue("idle");
  await expect(frames).toHaveText("1");
  // Feet aligned by default: bottom-centre of the opaque box.
  await panel.getByRole("button", { name: "Frame 1", exact: true }).click();
  await expect(panel.getByTestId("frame-anchor")).toHaveText("16, 28");
  await undoRedo(page, async (undone) => {
    if (undone) await expect(panel.getByLabel("Animation asset")).toContainText("(new)");
    else await expect(clipSelect).toHaveValue("idle");
  });

  // walk: four frames, 6/60 s each, looping from frame 1.
  for (const n of [1, 2, 3, 4]) await panel.getByRole("button", { name: `Region ${n}`, exact: true }).click();
  await panel.getByLabel("Clip name").fill("walk");
  await panel.getByRole("button", { name: "Create clip" }).click();
  await expect(clipSelect).toHaveValue("walk");
  await expect(frames).toHaveText("4");
  for (const n of [1, 2, 3, 4]) await panel.getByLabel(`Frame ${n} duration`).fill("6");
  await expect(panel.getByLabel("Frame 4 duration")).toHaveValue("6");
  await undoRedo(page, async (undone) => {
    await expect(panel.getByLabel("Frame 4 duration")).toHaveValue(undone ? "4" : "6");
  });
  await expect(panel.getByRole("checkbox", { name: "Loop" })).toBeChecked();
  await panel.getByLabel("Loop start").fill("1");
  await undoRedo(page, async (undone) => {
    await expect(panel.getByLabel("Loop start")).toHaveValue(undone ? "0" : "1");
  });

  // Reorder the last two frames, then put them back.
  await panel.getByRole("button", { name: "Frame 4", exact: true }).click();
  await panel.getByRole("button", { name: "Move left" }).click();
  await undoRedo(page, async () => {
    await expect(frames).toHaveText("4");
  });
  await panel.getByRole("button", { name: "Frame 3", exact: true }).click();
  await panel.getByRole("button", { name: "Move right" }).click();

  // Anchor: click the preview on frame 2's feet.
  await panel.getByRole("button", { name: "Frame 2", exact: true }).click();
  await panel.getByTestId("clip-preview").click({ position: { x: 15 * 3 + 1, y: 29 * 3 + 1 } });
  await expect(panel.getByTestId("frame-anchor")).toHaveText("15, 29");
  await undoRedo(page, async (undone) => {
    await expect(panel.getByTestId("frame-anchor")).toHaveText(undone ? "16, 28" : "15, 29");
  });

  // Bind the asset as the player's animation.
  await panel.getByRole("button", { name: "Use as player animation" }).click();
  await expect(panel.getByRole("button", { name: "Player animation" })).toBeDisabled();
  await undoRedo(page, async (undone) => {
    await expect(panel.getByRole("button", { name: undone ? "Use as player animation" : "Player animation" })).toBeVisible();
  });

  // The bound asset keeps its last clip: deleting idle leaves walk undeletable.
  await clipSelect.selectOption("idle");
  await panel.getByRole("button", { name: "Delete clip" }).click();
  await clipSelect.selectOption("walk");
  await expect(panel.getByRole("button", { name: "Delete clip" })).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Delete clip" })).toBeEnabled();

  // Play starts on the fixture sheet, before any save.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Could not start Play|Fix the project/)).toHaveCount(0);
  await expect(page.locator("[data-player-sheet]")).toHaveAttribute("data-player-sheet", "sprite.sheet");
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();

  // Problems lists the clips the X loadout still misses.
  await page.getByRole("tab", { name: /^Problems/ }).click();
  await expect(page.getByRole("cell", { name: "player.clips" })).toBeVisible();

  await menu(/^Save/);
  await expect(page.getByText("Project saved.")).toBeVisible();
  const manifest = JSON.parse(readFileSync(join(projectRoot, "project.json"), "utf8"));
  const anim = manifest.assets.find((asset: { id: string }) => asset.id === "anim.sheet");
  expect(anim.sheetAssetId).toBe("sprite.sheet");
  expect(anim.animations.idle).toEqual({
    loop: true,
    speed: 60,
    frames: [{ region: [0, 0, 32, 32], duration: 4, anchor: [16, 28] }],
  });
  const walk = anim.animations.walk;
  expect(walk).toMatchObject({ loop: true, loopStart: 1, speed: 60 });
  expect(walk.frames.map((f: { region: number[] }) => f.region[0])).toEqual([0, 32, 64, 96]);
  expect(walk.frames.map((f: { duration: number }) => f.duration)).toEqual([6, 6, 6, 6]);
  expect(walk.frames[1].anchor).toEqual([15, 29]);
  // The fixture's own animation is untouched: still no anchor.
  const fixture = manifest.assets.find((asset: { id: string }) => asset.id === "anim.player.fixture");
  expect(fixture.animations.idle.frames[0]).not.toHaveProperty("anchor");
  const data = JSON.parse(readFileSync(join(projectRoot, "game/data.json"), "utf8"));
  expect(data.bindings.playerAnimation).toBe("anim.sheet");
  expect(data.bindings.shotAnimations).toEqual({ lemon: "anim.effect.fixture" });
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
