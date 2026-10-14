import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import electronPath from "electron";

const appRoot = resolve(__dirname, "..");
const fixtureRoot = resolve(appRoot, "tests/project-io/fixtures/minimal-project");

/** A solid-colour RGBA PNG: same size as the fixture's player sheet, different bytes. */
function solidPng(width: number, height: number, rgba: number[]): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.from([0, ...Array.from({ length: width }, () => rgba).flat()]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let app: ElectronApplication;
let copyRoot: string;

test.afterAll(async () => {
  await app?.close();
  if (copyRoot) rmSync(copyRoot, { recursive: true, force: true });
});

test("a second project reusing a sheet id with new pixels plays without a restart", async () => {
  copyRoot = mkdtempSync(join(tmpdir(), "mmx-project-b-"));
  cpSync(fixtureRoot, copyRoot, { recursive: true });
  writeFileSync(join(copyRoot, "assets/sprites/player.png"), solidPng(32, 32, [255, 0, 255, 255]));

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

  const openProject = async (root: string): Promise<void> => {
    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never;
    }, root);
    await page.getByRole("button", { name: "File menu" }).click();
    await page.getByRole("menuitem", { name: /Open Project/ }).click();
  };

  await openProject(fixtureRoot);
  await expect(page.getByText(/Opened project 'Fixture Project'/)).toBeVisible();
  // Play in A loads its player sheet into the renderer cache.
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();

  // Open B while A's sheets are loaded: same id `sprite.player.fixture`, different bytes.
  await openProject(copyRoot);
  await expect(page.getByText(/Opened project 'Fixture Project'/).last()).toBeVisible();
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#play-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-player-sheet]")).toHaveAttribute(
    "data-player-sheet",
    "sprite.player.fixture",
  );
  await expect(page.getByText(/Fix the project's asset bindings/)).toHaveCount(0);
  await expect(page.getByText(/Could not start Play/)).toHaveCount(0);
  await expect(page.getByText(/refusing to overwrite|play-assets\./)).toHaveCount(0);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await page.getByRole("button", { name: /^Stop$/ }).click();
  await expect(page.locator("#viewport-canvas")).toBeVisible();
});
