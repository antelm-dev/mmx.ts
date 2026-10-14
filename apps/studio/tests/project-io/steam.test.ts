import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { findSteamGame, parseLibraryFolders, steamLibraries } from "../../src/project-io/node.js";

import { oracle } from "./oracle.js";

const vdf = (paths: string[]) => `"libraryfolders"
{
${paths
  .map(
    (p, i) => `\t"${i}"
\t{
\t\t"path"\t\t"${p.replace(/\\/g, "\\\\")}"
\t\t"label"\t\t""
\t\t"apps"
\t\t{
\t\t\t"743890"\t\t"1234"
\t\t}
\t}`,
  )
  .join("\n")}
}
`;

test("parseLibraryFolders reads every path and unescapes backslashes", () => {
  assert.deepEqual(parseLibraryFolders(vdf(["C:\\Program Files (x86)\\Steam", "D:\\SteamLibrary"])), [
    "C:\\Program Files (x86)\\Steam",
    "D:\\SteamLibrary",
  ]);
  assert.deepEqual(parseLibraryFolders('"libraryfolders"\r\n{\r\n}\r\n'), []);
});

test("findSteamGame locates both collections through libraryfolders.vdf", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "mmx-steam-"));
  try {
    const steam = join(tmp, "Steam");
    const lib = join(tmp, "Lib");
    await mkdir(join(steam, "steamapps"), { recursive: true });
    await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), vdf([steam, lib]));
    const mmx = join(steam, "steamapps", "common", "Mega Man X Legacy Collection");
    const mmz = join(lib, "steamapps", "common", "MZZXLC");
    await mkdir(mmx, { recursive: true });
    await writeFile(join(mmx, "RXC1.exe"), "");
    await mkdir(join(mmz, "nativePCx64"), { recursive: true });

    const opts = { env: {}, steamRoots: [steam, join(tmp, "Missing")] };
    assert.deepEqual(await steamLibraries(opts.steamRoots), [join(steam, "steamapps", "common"), join(lib, "steamapps", "common")]);
    assert.deepEqual(await findSteamGame("mmxlc", opts), { ok: true, root: mmx });
    assert.deepEqual(await findSteamGame("mzzxlc", opts), { ok: true, root: mmz });

    // env override wins, and is validated
    assert.deepEqual(await findSteamGame("mmxlc", { ...opts, env: { MMXLC_DIR: mmx } }), { ok: true, root: mmx });
    const bad = await findSteamGame("mzzxlc", { ...opts, env: { MZZXLC_DIR: tmp } });
    assert.equal(bad.ok, false);
    assert.match(!bad.ok ? bad.error : "", /MZZXLC_DIR=.* has no nativePCx64/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("findSteamGame reports a missing install clearly", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "mmx-steam-"));
  try {
    const result = await findSteamGame("mmxlc", { env: {}, steamRoots: [tmp] });
    assert.deepEqual(result, {
      ok: false,
      error: "Mega Man X Legacy Collection is not installed in your Steam libraries. Install it from Steam, or set MMXLC_DIR to its folder.",
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("oracle: both collections are installed and located", async (t) => {
  const mmx = await oracle(t, "mmxlc");
  const mmz = mmx && (await oracle(t, "mzzxlc"));
  if (!mmx || !mmz) return;
  assert.match(mmx.install, /Mega Man X Legacy Collection$/);
  assert.match(mmz.install, /MZZXLC$/);
});
