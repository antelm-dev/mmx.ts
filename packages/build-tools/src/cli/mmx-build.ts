#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildProjectToDisk, requireProject } from "../index.js";

type Command = "build" | "dev";

type ParsedArgs = {
  command: Command;
  project?: string;
  out?: string;
  port?: number;
  watch?: boolean;
  help?: boolean;
};

function printHelp(): void {
  process.stdout.write(`mmx-build ÔÇö core build factory for Studio exports

Usage:
  mmx-build build --project <dir> [--out <dir>]
  mmx-build dev --project <dir> [--port <number>]

Options:
  --project   Path to a Studio project export directory (required)
  --out       Output directory for build artifacts (default: dist-project)
  --port      Dev server port (default: 5173, strict)
  --watch     Rebuild when project files change (build command only)
  --help      Show this help

Dev:
  Sets MMX_PROJECT and starts apps/web via Vite. The mmx-project plugin is owned
  by apps/web/vite.config.ts and registered once (emit dir: <project>/.mmx-assets).
  Equivalent: MMX_PROJECT=<dir> pnpm --filter @mmx/web dev
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const parsed: ParsedArgs = { command: "build" };
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    parsed.help = true;
    return parsed;
  }
  const command = args[0];
  if (command === "build" || command === "dev") parsed.command = command;
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--project") parsed.project = args[++i];
    else if (arg === "--out") parsed.out = args[++i];
    else if (arg === "--port") {
      const raw = args[++i];
      const port = Number(raw);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`Invalid --port value: ${raw}`);
      }
      parsed.port = port;
    } else if (arg === "--watch") parsed.watch = true;
  }
  return parsed;
}

async function runBuild(projectDir: string, outDir: string): Promise<void> {
  const project = await requireProject(projectDir);
  const report = await buildProjectToDisk(project, outDir);
  process.stdout.write(
    `Built project '${report.bundle.meta.id}' ÔåÆ ${path.resolve(outDir)}\n` +
      `  assets: ${report.assetFiles.length}\n` +
      `  levels: ${report.bundle.levels.length}\n`,
  );
}

async function watchBuild(projectDir: string, outDir: string): Promise<void> {
  const { watch } = await import("node:fs");
  let running = false;
  let pending = false;

  const tick = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await runBuild(projectDir, outDir);
    } catch (error) {
      console.error(error);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        void tick();
      }
    }
  };

  await tick();
  const watcher = watch(projectDir, { recursive: true }, () => {
    void tick();
  });
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}

async function runDev(projectDir: string, port = 5173): Promise<void> {
  process.env.MMX_PROJECT = path.resolve(projectDir);
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const webRoot = path.resolve(packageRoot, "../../../apps/web");
  const { createServer } = await import("vite");
  const { createMmxWebDevInlineConfig } = await import("../vite/plugin.js");
  const server = await createServer({
    ...createMmxWebDevInlineConfig({ webRoot }),
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      open: false,
    },
  });
  await server.listen();
  server.printUrls();
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printHelp();
    return;
  }
  if (!parsed.project) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const projectDir = path.resolve(invocationRoot, parsed.project);
  const outDir = path.resolve(invocationRoot, parsed.out ?? "dist-project");
  if (parsed.command === "dev") {
    await runDev(projectDir, parsed.port);
    return;
  }
  if (parsed.watch) {
    await watchBuild(projectDir, outDir);
    return;
  }
  await runBuild(projectDir, outDir);
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
