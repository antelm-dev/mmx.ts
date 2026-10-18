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
const templateRoot = resolve(appRoot, "templates/mmx-starter");
// A fresh profile: never the developer's recent projects or work projects.
const scratch = mkdtempSync(join(tmpdir(), "mmx-pickup-sheet-"));
const oldRoot = join(scratch, "old");
const hugeRoot = join(scratch, "huge");

const readJson = (root: string, path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const writeJson = (root: string, path: string, value: unknown) =>
  writeFileSync(join(root, path), JSON.stringify(value, null, 2));

/** A copy of the MMX starter with `definitionIds` placed on its floor, next to the spawn. */
function starterCopy(root: string, definitionIds: string[]): void {
  cpSync(templateRoot, root, { recursive: true });
  const level = readJson(root, "levels/level.starter.json");
  definitionIds.forEach((definitionId, i) =>
    level.objects.push({ id: `capsule.${i}`, definitionId, x: 128 + 32 * i, y: 256 }),
  );
  writeJson(root, "levels/level.starter.json", level);
}

let app: ElectronApplication;

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

async function open(page: Page, root: string): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
  }, root);
  await page.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: /Open Project/ }).click();
  await expect(page.getByText(/Opened project 'MMX Starter'/).last()).toBeVisible();
}

/** Each pickup shows its sprite in the palette (a loaded image, not the colour fallback). */
async function expectPaletteSprites(page: Page, ids: string[]): Promise<void> {
  await page.getByRole("tab", { name: "Object Palette" }).click();
  await page.getByLabel("Search objects").fill("pickup"); // the category: every pickup, nothing else
  for (const id of ids) {
    const img = page.locator(`[title="${id}"] img`).first();
    await expect(img).toHaveAttribute("src", /^(?!.*\/undefined(?:\?|$)).+/);
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth * el.naturalHeight))
      .toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Clear search" }).click();
}

/** Play builds the capsules (their clips load by sheet, or Play fails) and runs. */
async function expectPlays(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  const frame = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            studioEditor: { getPlaytestSnapshot(): { frame: number } };
          }
        ).studioEditor.getPlaytestSnapshot().frame,
    );
  await expect.poll(frame, { timeout: 15_000 }).toBeGreaterThan(60);
  await expect(page.getByText(/Could not start Play|Play error/)).toHaveCount(0);
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
}

test("AC-SHEET: an old project's small/large pickup keys and an overlay's life.huge both render", async () => {
  const capsules = [
    "pickup.life.small",
    "pickup.life.large",
    "pickup.weapon.small",
    "pickup.weapon.large",
  ];
  // An old project: game/data.json keys life capsules by their Kind, as before sheets.
  starterCopy(oldRoot, capsules);
  const old = readJson(oldRoot, "game/data.json");
  old.bindings.pickupAnimations = {
    large: "anim.pickup.large",
    small: "anim.pickup.small",
    ammo: "anim.pickup.ammo",
    sammo: "anim.pickup.sammo",
  };
  writeJson(oldRoot, "game/data.json", old);

  // A project whose data adds life.huge, drawn from an animation asset of its own (no binding).
  starterCopy(hugeRoot, ["pickup.life.huge"]);
  const manifest = readJson(hugeRoot, "project.json");
  const large = manifest.assets.find((asset: { id: string }) => asset.id === "anim.pickup.large");
  manifest.assets.push({ ...large, id: "anim.pickup.huge" });
  writeJson(hugeRoot, "project.json", manifest);
  const data = readJson(hugeRoot, "data/game.json");
  data.pickups["life.huge"] = {
    id: "life.huge",
    behavior: "pickup.life",
    sheet: "anim.pickup.huge",
    amount: 16,
  };
  data.prefabs["pickup.life.huge"] = {
    ...data.prefabs["pickup.life.large"],
    id: "pickup.life.huge",
    source: { kind: "pickup", ref: "life.huge" },
  };
  writeJson(hugeRoot, "data/game.json", data);
  expect(readJson(hugeRoot, "game/data.json").bindings.pickupAnimations["anim.pickup.huge"]).toBe(
    undefined,
  );

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
  // First-launch notice: wait for it, then check it is gone, so the click never races its mount.
  await expect(page.getByTestId("fan-notice")).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByTestId("fan-notice")).toBeHidden();

  await open(page, oldRoot);
  await expectPaletteSprites(page, capsules);
  await expectPlays(page);

  await open(page, hugeRoot);
  await expectPaletteSprites(page, ["pickup.life.huge"]);
  await expectPlays(page);

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
