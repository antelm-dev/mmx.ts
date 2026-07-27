import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";

export const SKIP_BROWSER_E2E_ENV = "MMX_SKIP_BROWSER_E2E";

export function shouldSkipBrowserE2E(env = process.env) {
  return env[SKIP_BROWSER_E2E_ENV] === "1";
}

export function allocatePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate an ephemeral TCP port."));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export async function waitForPort(port, options = {}) {
  const host = options.host ?? "127.0.0.1";
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollMs = options.pollMs ?? 250;
  const getDiagnostics = options.getDiagnostics ?? (() => "");
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const reachable = await new Promise((resolve) => {
      const socket = net.connect({ host, port }, () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (reachable) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  const diagnostics = getDiagnostics();
  throw new Error([`Timed out waiting for port ${port}.`, diagnostics].filter(Boolean).join("\n"));
}

export function terminateProcessTree(child) {
  if (!child?.pid || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // already exited
    }
  }
}

function appendChunk(buffer, chunk) {
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  buffer.push(text);
}

export async function withDevServer(options, runTest) {
  const { coreRoot, exportDir, port, host = "127.0.0.1", timeoutMs = 120_000 } = options;
  const cli = path.join(coreRoot, "packages/build-tools/dist/cli/mmx-build.js");
  const stdoutChunks = [];
  const stderrChunks = [];
  const getDiagnostics = () =>
    [
      "--- dev-server stdout ---",
      stdoutChunks.join("") || "(empty)",
      "--- dev-server stderr ---",
      stderrChunks.join("") || "(empty)",
    ].join("\n");

  const child = spawn(
    process.execPath,
    [cli, "dev", "--project", exportDir, "--port", String(port)],
    {
      cwd: coreRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    },
  );

  child.stdout.on("data", (chunk) => appendChunk(stdoutChunks, chunk));
  child.stderr.on("data", (chunk) => appendChunk(stderrChunks, chunk));

  let settled = false;
  const earlyExit = new Promise((_, reject) => {
    child.once("exit", (code, signal) => {
      if (settled) return;
      reject(
        new Error(
          [`Dev server exited early (code=${code}, signal=${signal}).`, getDiagnostics()].join(
            "\n",
          ),
        ),
      );
    });
    child.once("error", (error) => {
      if (settled) return;
      reject(
        new Error([`Dev server failed to start: ${error.message}`, getDiagnostics()].join("\n")),
      );
    });
  });

  const cleanup = () => {
    settled = true;
    terminateProcessTree(child);
  };

  const onSignal = () => {
    cleanup();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  if (process.platform === "win32") {
    process.on("SIGHUP", onSignal);
  }

  try {
    await Promise.race([waitForPort(port, { host, timeoutMs, getDiagnostics }), earlyExit]);
    await runTest({
      port,
      host,
      url: `http://${host}:${port}/`,
      getDiagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("dev-server stdout")) {
      throw new Error([message, getDiagnostics()].join("\n"));
    }
    throw error;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    if (process.platform === "win32") {
      process.off("SIGHUP", onSignal);
    }
    cleanup();
    await new Promise((resolve) => {
      if (child.exitCode != null || child.signalCode != null) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, 2_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

export async function requirePlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Playwright is required for cross-repo browser boot. Run \`pnpm playwright:install\` after install. (${detail})`,
    );
  }
}
