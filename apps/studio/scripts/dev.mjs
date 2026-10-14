import { spawn, spawnSync } from "node:child_process";

/**
 * Dev orchestrator for MMX Studio.
 *
 * Runs two watchers side by side and tears both down together:
 *  - `vite`   — the renderer dev server on :5175.
 *  - `rollup` — main + preload in watch mode; its `electron-run` plugin
 *    (re)launches Electron on each rebuild.
 *
 * The main process retries loading the dev-server URL until Vite is up, so the
 * two can start in any order.
 */
const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";

const commands = [
  { name: "vite", args: ["exec", "vite"], stdin: "ignore" },
  {
    name: "rollup",
    args: ["exec", "rollup", "-c", "--environment", "NODE_ENV:development", "--watch"],
    stdin: "inherit",
  },
];

const children = new Map();
let stopping = false;
let exitCode = 0;

for (const command of commands) {
  const child = spawn(pnpm, command.args, {
    stdio: [command.stdin, "inherit", "inherit"],
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
    // Node >= 20.12 requires shell: true to spawn .cmd files on Windows
    // (CVE-2024-27980). Safe here: the command is hardcoded, not user input.
    shell: isWindows,
  });

  children.set(command.name, child);

  child.once("error", (error) => {
    console.error(`[${command.name}] failed to start`, error);
    stop(1, command.name);
  });

  child.once("exit", (code, signal) => {
    children.delete(command.name);
    if (!stopping) {
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
      console.log(`[${command.name}] exited with ${reason}`);
      stop(code ?? 1, command.name);
    }
    finishWhenStopped();
  });
}

process.once("SIGINT", () => stop(130));
process.once("SIGTERM", () => stop(143));
process.once("SIGHUP", () => stop(129));

function stop(code, exitedName) {
  if (stopping) return;
  stopping = true;
  exitCode = code;

  for (const [name, child] of children) {
    if (name === exitedName || child.exitCode !== null || child.signalCode !== null) continue;
    terminate(child);
  }

  finishWhenStopped();
}

function terminate(child) {
  if (isWindows && child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

function finishWhenStopped() {
  if (stopping && children.size === 0) {
    process.exitCode = exitCode;
  }
}
