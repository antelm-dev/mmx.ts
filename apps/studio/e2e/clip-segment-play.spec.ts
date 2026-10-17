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

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-clip-segment-"));
const projectRoot = join(scratch, "project");

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

/** Screen point of a world point once the view is fitted to the 32×16-cell level. */
async function screenAt(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator("#viewport-canvas").boundingBox())!;
  const worldW = 32 * 16;
  const worldH = 16 * 16;
  // EditorViewport.fitToDocument.
  const zoom = Math.max(0.25, Math.min(box.width / worldW, box.height / worldH) * 0.95);
  const vx = (worldW - box.width / zoom) / 2;
  const vy = (worldH - box.height / zoom) / 2;
  return { x: box.x + (wx - vx) * zoom, y: box.y + (wy - vy) * zoom };
}

type Studio = {
  getPlaytestSnapshot(): { runtime: { actors: { kind: string; abilities: string[] }[] } | null };
  playtestTogglePause(): void;
  playtestStep(): void;
};

/** The Spiky's Death state from the debugger's snapshot. */
const spikyAbilities = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as unknown as { studioEditor: Studio }).studioEditor;
    const actors = editor.getPlaytestSnapshot().runtime?.actors ?? [];
    return actors.find((a) => a.kind === "spiky")?.abilities ?? null;
  });

/**
 * The clip the running Spiky plays, read from the debugger's live scene (the snapshot
 * carries no animation): the requested name and the clip frame shown.
 */
const spikyClip = (page: Page) =>
  page.evaluate(() => {
    type Enemy = { kind: string; anim: { animation: string; frame: number } };
    const editor = (
      window as unknown as {
        studioEditor: {
          playtest: { play: { runtime: { session: { scene: { stage: { enemies: Enemy[] } } } } } };
        };
      }
    ).studioEditor;
    const enemy = editor.playtest.play.runtime.session.scene.stage.enemies.find(
      (e) => e.kind === "spiky",
    );
    return enemy ? { animation: enemy.anim.animation, frame: enemy.anim.frame } : null;
  });

test("AC-USE: an enemy's weak phase plays clip#segment in Play", async () => {
  // The fixture's animation gains a clip in three segments: standing (looping), tipping
  // over once, then lying (looping). Half a second a frame.
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const manifestPath = join(projectRoot, "project.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const anim = manifest.assets.find((a: { id: string }) => a.id === "anim.player.fixture");
  const frame = { region: [0, 0, 32, 32], duration: 30 };
  anim.animations.fall = {
    loop: false,
    speed: 60,
    frames: [frame, frame, frame],
    segments: [
      { name: "debout", start: 0, end: 0, loop: true },
      { name: "tombe", start: 1, end: 1, loop: false },
      { name: "sol", start: 2, end: 2, loop: true },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

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
  const canvas = page.locator("#viewport-canvas");
  await expect(canvas).toBeAttached({ timeout: 30_000 });
  await page.getByRole("button", { name: "OK", exact: true }).click(); // first-launch notice

  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [root] })) as never;
  }, projectRoot);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();

  // A blank enemy with Death alone, whose weak phase plays the tipping-over segment.
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await page.getByRole("button", { name: "New object…" }).click();
  const dialog = page.getByRole("dialog", { name: "New object" });
  await dialog
    .getByRole("group", { name: "Categories" })
    .getByRole("button")
    .filter({ hasText: "Enemies" })
    .click();
  await dialog.getByRole("group", { name: "Behaviour" }).getByRole("button").first().click();
  await dialog.getByLabel("Name").fill("Spiky");
  await dialog.getByLabel("Animation").selectOption("anim.player.fixture");
  const weak = dialog.getByRole("group", { name: "Weak phase" });
  await weak.getByText("Fall before exploding").click();
  await expect(weak.getByLabel("At health")).toHaveValue("1");
  // Each clip, then its segments.
  await expect(weak.getByLabel("Clip").locator("option")).toHaveText([
    "idle",
    "fall",
    "fall#debout",
    "fall#tombe",
    "fall#sol",
  ]);
  await weak.getByLabel("Clip").selectOption("fall#tombe");
  await weak.getByLabel("Seconds").fill("5");
  await expect(dialog.getByText(/Your animation has no clip for/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Open in Enemy editor" }).click();
  await expect(dialog).toHaveCount(0);
  // The enemy editor's Death field picks among the same names.
  await expect(page.getByText("Enemy · spiky")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Weak animation" })).toHaveText("fall#tombe");

  // Placed on the floor, 64 px in front of the Spawn (32, 128; floor on row 15).
  await page.getByRole("tab", { name: "Level", exact: true }).click();
  await page.keyboard.press("f");
  const spot = await screenAt(page, 96, 232);
  await page.mouse.click(spot.x, spot.y);
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Project saved.").last()).toBeVisible();
  const gameData = JSON.parse(readFileSync(join(projectRoot, "data/game.json"), "utf8"));
  expect(gameData.enemies.spiky.abilityConfig.Death).toMatchObject({
    weakHealth: 1,
    weakAnimation: "fall#tombe",
    weakDuration: 5,
  });
  // Problems: the clip and its segment exist.
  await expect(page.getByText(/Enemy 'spiky' animation .* has no clip for/)).toHaveCount(0);

  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-enemy-kinds]")).toHaveAttribute("data-enemy-kinds", /\bspiky\b/);
  await expect(page.getByText(/Could not start Play|Play error|Fix \d+ error/)).toHaveCount(0);
  await expect.poll(() => spikyAbilities(page), { timeout: 15_000 }).not.toBeNull();

  // Shoot it once (health 2 -> 1): the weak phase starts.
  await expect
    .poll(
      async () => {
        await page.keyboard.press("f");
        return spikyAbilities(page);
      },
      { timeout: 15_000, intervals: [300] },
    )
    .toContain("Death");
  // The debugger pauses Play: the Spiky plays fall#tombe, from that segment (never the
  // first, looping one), then chains on to the next segment.
  await page.evaluate(() =>
    (window as unknown as { studioEditor: Studio }).studioEditor.playtestTogglePause(),
  );
  const clip = await spikyClip(page);
  expect(clip?.animation).toBe("fall#tombe");
  expect([1, 2]).toContain(clip?.frame);
  await page.evaluate(() => {
    const editor = (window as unknown as { studioEditor: Studio }).studioEditor;
    for (let i = 0; i < 40; i++) editor.playtestStep();
  });
  expect(await spikyClip(page)).toEqual({ animation: "fall#tombe", frame: 2 });
  expect(await spikyAbilities(page)).toContain("Death");

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(canvas).toBeVisible();
});
