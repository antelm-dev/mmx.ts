import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  containWorkRoot,
  deleteWorkProject,
  listWorkProjects,
  moveWorkProject,
  newWorkRoot,
} from "../../src/main/workProjects.js";

let scratch: string;
let base: string;

async function setup() {
  scratch = await realpath(await mkdtemp(join(tmpdir(), "mmx-work-")));
  base = join(scratch, "userData", "work-projects");
}
afterEach(() => rm(scratch, { recursive: true, force: true }));

/** A work project with a level, a sprite, data/ and game/, like one built in Studio. */
async function workProject(name = "Untitled Project"): Promise<string> {
  const root = await newWorkRoot(base);
  const files: Record<string, string> = {
    "project.json": JSON.stringify({ name }),
    "levels/level.main.json": "{}",
    "assets/sprites/hero.png": "png-bytes",
    "data/game.json": '{"schemaVersion":1}',
    "game/data.json": '{"bindings":{}}',
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

test("work roots are uuid folders directly under the work folder", async () => {
  await setup();
  const root = await newWorkRoot(base);
  assert.equal(await containWorkRoot(base, root), root);
  await assert.rejects(containWorkRoot(base, base), /Not an unsaved project folder/);
  await assert.rejects(containWorkRoot(base, join(root, "levels")), /Not an unsaved/);
  await assert.rejects(containWorkRoot(base, join(root, "..", "..")), /Not an unsaved/);
  await assert.rejects(containWorkRoot(base, scratch), /Not an unsaved/);
  await assert.rejects(containWorkRoot(base, join(base, "missing")), /Not an unsaved/);
});

test("a link under the work folder to a folder outside it is refused", async (t) => {
  await setup();
  await newWorkRoot(base);
  const outside = join(scratch, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "project.json"), JSON.stringify({ name: "Outside" }));
  try {
    await symlink(outside, join(base, "linked"), "junction");
  } catch {
    t.skip("cannot create links here");
    return;
  }
  await assert.rejects(containWorkRoot(base, join(base, "linked")), /Not an unsaved/);
  await assert.rejects(deleteWorkProject(base, join(base, "linked")), /Not an unsaved/);
  assert.deepEqual(await listWorkProjects(base), []);
  assert.ok((await readdir(outside)).includes("project.json"));
});

test("lists work projects with a manifest, last modified first", async () => {
  await setup();
  assert.deepEqual(await listWorkProjects(base), []);
  const a = await workProject("A");
  await newWorkRoot(base); // half-created: no manifest, not listed
  await new Promise((resolve) => setTimeout(resolve, 20));
  const b = await workProject("B");
  const list = await listWorkProjects(base);
  assert.deepEqual(
    list.map(({ rootPath, name }) => ({ rootPath, name })),
    [
      { rootPath: b, name: "B" },
      { rootPath: a, name: "A" },
    ],
  );
});

test("moves the whole project to an absent folder and deletes the work folder", async () => {
  await setup();
  const root = await workProject();
  const destination = join(scratch, "My Game");
  const moved = await moveWorkProject(base, root, destination);
  assert.deepEqual(moved, { rootPath: destination });
  assert.equal(await readFile(join(destination, "assets/sprites/hero.png"), "utf8"), "png-bytes");
  assert.equal(await readFile(join(destination, "data/game.json"), "utf8"), '{"schemaVersion":1}');
  assert.equal(await readFile(join(destination, "game/data.json"), "utf8"), '{"bindings":{}}');
  assert.equal(await readFile(join(destination, "levels/level.main.json"), "utf8"), "{}");
  assert.deepEqual(await readdir(base), []);
});

test("moves into an empty folder; refuses a non-empty one, a file and the work folder", async () => {
  await setup();
  const root = await workProject();
  const empty = join(scratch, "empty");
  await mkdir(empty);
  const taken = join(scratch, "taken");
  await mkdir(taken);
  await writeFile(join(taken, "project.json"), "{}");
  const file = join(scratch, "file.txt");
  await writeFile(file, "x");

  await assert.rejects(moveWorkProject(base, root, taken), /empty folder/);
  await assert.rejects(moveWorkProject(base, root, file), /not a folder/);
  await assert.rejects(moveWorkProject(base, root, join(base, "inside")), /outside/);
  await assert.rejects(moveWorkProject(base, root, join(root, "inside")), /outside/);
  await assert.rejects(moveWorkProject(base, root, "relative/dir"), /Choose a folder/);
  await assert.rejects(moveWorkProject(base, scratch, empty), /Not an unsaved/);
  assert.equal(await readFile(join(taken, "project.json"), "utf8"), "{}");
  assert.equal((await listWorkProjects(base)).length, 1);

  assert.deepEqual(await moveWorkProject(base, root, empty), { rootPath: empty });
  assert.ok((await readdir(empty)).includes("project.json"));
});

test("a failed copy keeps the work project and removes what it wrote", async () => {
  await setup();
  const root = await workProject();
  const failing = async (_from: string, to: string) => {
    await mkdir(join(to, "levels"), { recursive: true });
    await writeFile(join(to, "levels", "level.main.json"), "{}");
    throw new Error("disk full");
  };
  const absent = join(scratch, "absent");
  await assert.rejects(moveWorkProject(base, root, absent, failing as never), /disk full/);
  await assert.rejects(readdir(absent), /ENOENT/);
  const empty = join(scratch, "empty");
  await mkdir(empty);
  await assert.rejects(moveWorkProject(base, root, empty, failing as never), /disk full/);
  assert.deepEqual(await readdir(empty), []);

  assert.equal(await readFile(join(root, "assets/sprites/hero.png"), "utf8"), "png-bytes");
  assert.equal(await readFile(join(root, "data/game.json"), "utf8"), '{"schemaVersion":1}');
  assert.deepEqual(
    (await listWorkProjects(base)).map((entry) => entry.rootPath),
    [root],
  );
});

test("deletes only a contained work project", async () => {
  await setup();
  const root = await workProject();
  await assert.rejects(deleteWorkProject(base, scratch), /Not an unsaved/);
  await deleteWorkProject(base, root);
  assert.deepEqual(await readdir(base), []);
});
