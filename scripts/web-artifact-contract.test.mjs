import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.join(root, "apps", "web", "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("root build script excludes production web artifacts", () => {
  assert.match(packageJson.scripts.build, /--filter=!@mmx\/web/);
  assert.match(packageJson.scripts.build, /@mmx\/web run typecheck/);
  assert.equal(packageJson.scripts["build:web"], "turbo run build --filter=@mmx/web");
});

test("pnpm build:web without MMX_PROJECT fails instead of emitting web-dist", () => {
  const marker = path.join(webDist, ".contract-marker");
  fs.mkdirSync(webDist, { recursive: true });
  fs.writeFileSync(marker, "pre-existing");

  const env = { ...process.env };
  delete env.MMX_PROJECT;

  const result = spawnSync(
    "pnpm",
    ["--filter", "@mmx/web", "exec", "vite", "build", "--outDir", "dist"],
    {
      cwd: root,
      env,
      encoding: "utf8",
      shell: true,
    },
  );

  assert.notEqual(result.status, 0);
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.match(combined, /MMX_PROJECT/);
  assert.equal(fs.existsSync(marker), true);
});
