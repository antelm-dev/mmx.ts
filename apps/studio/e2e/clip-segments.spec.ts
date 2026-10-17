import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { encodePng } from "../src/project-io/import/png";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// A fresh profile and a scratch copy of the fixture: never the developer's projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-clip-segments-"));
const projectRoot = join(scratch, "project");
const sheetPath = join(scratch, "sheet.png");

/** 128×64 synthetic sheet: a 4×2 grid of 32×32 cells, a 20×24 figure in each. */
function writeSheet(): void {
  const width = 128;
  const height = 64;
  const px = new Uint8Array(width * height * 4);
  for (let f = 0; f < 8; f++) {
    const cx = (f % 4) * 32 + 6;
    const cy = Math.floor(f / 4) * 32 + 4;
    for (let y = cy; y < cy + 24; y++)
      for (let x = cx; x < cx + 20; x++) px.set([40, 160, 220, 255], (y * width + x) * 4);
  }
  writeFileSync(sheetPath, encodePng({ width, height, px }));
}

let app: ElectronApplication | undefined;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

async function launch(): Promise<Page> {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js"), `--user-data-dir=${join(scratch, "profile")}`],
    cwd: appRoot,
    env,
  });
  const page = await app.firstWindow();
  page.on("dialog", (dialog) => void dialog.accept());
  await expect(page.locator("#viewport-canvas")).toBeAttached({ timeout: 30_000 });
  return page;
}

async function openProject(page: Page): Promise<void> {
  await pick(projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
}

const pick = (path: string) =>
  app!.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
  }, path);

/** Undo then redo the last command, checking the state on both sides. */
async function undoRedo(page: Page, check: (undone: boolean) => Promise<void>): Promise<void> {
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await check(true);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await check(false);
}

test("AC-EDITOR: a clip split into intro/loop/end is edited, undone, previewed, saved and reopened", async () => {
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  writeSheet();
  let page = await launch();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.getByRole("button", { name: "OK", exact: true }).click(); // first-launch notice
  await openProject(page);

  // A sliced sheet, and a looping "walk" clip of six frames that loops from frame 1.
  await page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Assets" })
    .click();
  await pick(sheetPath);
  await page.getByRole("button", { name: "Import sprite sheet…" }).click();
  await expect(page.getByLabel("Sprite asset")).toHaveValue("sprite.sheet");
  await page.getByLabel("Mode").selectOption("grid");
  await page.getByRole("button", { name: "Apply grid" }).click();
  await page.getByRole("button", { name: "Save regions" }).click();
  await page.getByRole("button", { name: "New animation…" }).click();
  let panel = page.getByTestId("clip-editor");
  await panel.getByLabel("Sprite sheet").selectOption("sprite.sheet");
  for (const n of [1, 2, 3, 4, 5, 6])
    await panel.getByRole("button", { name: `Region ${n}`, exact: true }).click();
  await panel.getByLabel("Clip name").fill("walk");
  await panel.getByRole("button", { name: "Create clip" }).click();
  await expect(panel.getByTestId("frame-count")).toHaveText("6");
  await panel.getByLabel("Loop start").fill("1");
  await expect(panel.getByLabel("Loop start")).toHaveValue("1");

  const segment = (n: number) => panel.getByRole("group", { name: `Segment ${n}`, exact: true });
  const name = (n: number) => segment(n).getByLabel("Name");
  const lastFrame = (n: number) => segment(n).getByLabel("Last frame");
  const frames = (n: number) => segment(n).getByText(/^Frames /);
  const frameMark = (n: number) => panel.getByTestId(`frame-${n}-segment`);
  const frame = (n: number) => panel.getByRole("button", { name: `Frame ${n}`, exact: true });
  const addSegment = panel.getByRole("button", { name: "Add segment" });

  // Cut at frame 3, then at frame 6: three segments; Loop and Loop start no longer apply.
  await frame(3).click();
  await addSegment.click();
  await expect(segment(2)).toBeVisible();
  await expect(frames(1)).toHaveText("Frames 1–2");
  await expect(frames(2)).toHaveText("Frames 3–6");
  await expect(panel.getByLabel("Loop start")).toBeDisabled();
  await expect(addSegment).toBeDisabled(); // frame 3 starts a segment
  await undoRedo(page, async (undone) => {
    await expect(segment(1)).toHaveCount(undone ? 0 : 1);
    // Adding segments drops loopStart; undo brings it back.
    await expect(panel.getByLabel("Loop start")).toHaveValue(undone ? "1" : "0");
  });
  await frame(6).click();
  await addSegment.click();
  await expect(frames(3)).toHaveText("Frames 6–6");
  await expect(segment(3).getByRole("checkbox", { name: "Loop" })).toBeChecked();
  await expect(segment(2).getByRole("checkbox", { name: "Loop" })).not.toBeChecked();
  // intro plays once, loop loops, end plays once.
  await segment(2).getByRole("checkbox", { name: "Loop" }).locator("..").click();
  await segment(3).getByRole("checkbox", { name: "Loop" }).locator("..").click();
  await undoRedo(page, async (undone) => {
    await expect(segment(3).getByRole("checkbox", { name: "Loop" })).toBeChecked({
      checked: undone,
    });
  });
  await expect(segment(2).getByRole("checkbox", { name: "Loop" })).toBeChecked();

  // Rename, with validation: a taken name or one with '#' is refused.
  await name(1).fill("intro");
  await name(1).press("Enter");
  await expect(frameMark(1)).toHaveText("intro");
  await name(2).fill("intro");
  await name(2).blur();
  await expect(page.getByText("Segment “intro” already exists.")).toBeVisible();
  await expect(name(2)).toHaveValue("segment 2");
  await name(2).fill("lo#op");
  await name(2).blur();
  await expect(name(2)).toHaveValue("segment 2");
  await name(2).fill("loop");
  await name(2).press("Enter");
  await name(3).fill("end");
  await name(3).press("Enter");
  await expect(frameMark(6)).toHaveText("end");
  await undoRedo(page, async (undone) => {
    await expect(name(3)).toHaveValue(undone ? "segment 3" : "end");
  });

  // Resize: intro takes frame 3 from loop; the last segment always ends on the last frame.
  await expect(lastFrame(3)).toBeDisabled();
  await lastFrame(1).fill("3");
  await expect(frames(1)).toHaveText("Frames 1–3");
  await expect(frames(2)).toHaveText("Frames 4–5");
  await expect(frameMark(3)).toHaveText("intro");
  await undoRedo(page, async (undone) => {
    await expect(frames(2)).toHaveText(undone ? "Frames 3–5" : "Frames 4–5");
  });

  // Segments follow the frames: duplicated, moved across a boundary, removed.
  await frame(1).click();
  await panel.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(panel.getByTestId("frame-count")).toHaveText("7");
  await expect(frames(1)).toHaveText("Frames 1–4");
  await expect(frames(3)).toHaveText("Frames 7–7");
  await undoRedo(page, async (undone) => {
    await expect(frames(3)).toHaveText(undone ? "Frames 6–6" : "Frames 7–7");
  });
  // Frame 5 (loop's first) moved left ends intro; segment sizes stay.
  await frame(5).click();
  await panel.getByRole("button", { name: "Move left" }).click();
  await expect(frames(1)).toHaveText("Frames 1–4");
  await expect(frames(2)).toHaveText("Frames 5–6");
  await frame(1).click();
  await panel.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(panel.getByTestId("frame-count")).toHaveText("6");
  await expect(frames(1)).toHaveText("Frames 1–3");
  await expect(frames(3)).toHaveText("Frames 6–6");

  // Delete a segment (its frames join the previous one), then take it back.
  await segment(2).getByRole("button", { name: "Delete segment" }).click();
  await expect(frames(1)).toHaveText("Frames 1–5");
  await expect(name(2)).toHaveValue("end");
  await undoRedo(page, async (undone) => {
    await expect(name(2)).toHaveValue(undone ? "loop" : "end");
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(name(2)).toHaveValue("loop");

  // Remove all segments: a plain clip again, then undo.
  await panel.getByRole("button", { name: "Remove all segments" }).click();
  await expect(segment(1)).toHaveCount(0);
  await expect(panel.getByLabel("Loop start")).toBeEnabled();
  await expect(panel.getByRole("checkbox", { name: "Loop", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(name(3)).toHaveValue("end");

  // Preview plays the segments: intro once then loop for good; "end" stops on the last frame.
  const playing = panel.locator('[aria-current="step"]');
  await panel.getByRole("button", { name: "Preview", exact: true }).click();
  await page.waitForTimeout(1_000);
  for (let i = 0; i < 4; i++) {
    await expect(playing).toHaveAccessibleName(/^Frame [45]$/);
    await page.waitForTimeout(90);
  }
  await panel.getByLabel("Preview from").selectOption("end");
  await page.waitForTimeout(500);
  await expect(playing).toHaveAccessibleName("Frame 6");
  await panel.getByRole("button", { name: "Stop preview" }).click();

  // Save: the clip carries its segments, and no loopStart.
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /^Save/ }).click();
  await expect(page.getByText("Project saved.")).toBeVisible();
  const expected = [
    { name: "intro", start: 0, end: 2, loop: false },
    { name: "loop", start: 3, end: 4, loop: true },
    { name: "end", start: 5, end: 5, loop: false },
  ];
  const manifest = JSON.parse(readFileSync(join(projectRoot, "project.json"), "utf8"));
  const walk = manifest.assets.find((asset: { id: string }) => asset.id === "anim.sheet").animations
    .walk;
  expect(walk.segments).toEqual(expected);
  expect(walk).not.toHaveProperty("loopStart");
  expect(walk.frames).toHaveLength(6);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  // Restart and reopen the project: the segments are still there.
  await app!.evaluate(({ session }) => session.defaultSession.flushStorageData());
  await app!.close();
  app = undefined;
  page = await launch();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openProject(page);
  await page
    .getByRole("navigation", { name: "Activity bar" })
    .getByRole("button", { name: "Assets" })
    .click();
  await page.getByTestId("asset-browser").locator('[data-asset-id="anim.sheet"]').dblclick();
  panel = page.getByTestId("clip-editor");
  await panel.getByLabel("Clip", { exact: true }).selectOption("walk");
  for (const [i, entry] of expected.entries()) {
    await expect(name(i + 1)).toHaveValue(entry.name);
    await expect(frames(i + 1)).toHaveText(`Frames ${entry.start + 1}–${entry.end + 1}`);
  }
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
