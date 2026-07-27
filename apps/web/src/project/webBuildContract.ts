export type WebViteCommand = "build" | "serve";

export type WebProjectPluginMode = "load-project" | "dev-stub" | "production-required";

export const PRODUCTION_PROJECT_REQUIRED_MESSAGE =
  "Production web builds require MMX_PROJECT to point at a Studio project export directory. " +
  "Set MMX_PROJECT (or use `pnpm factory:dev -- --project <dir>` for local play). " +
  "For repository/library validation without a game project, run `pnpm build` " +
  "(packages and non-web apps only) — do not upload apps/web/dist as web-dist.";

export function resolveWebProjectPluginMode(options: {
  command: WebViteCommand;
  projectDir: string | undefined;
}): WebProjectPluginMode {
  if (options.projectDir) return "load-project";
  if (options.command === "build") return "production-required";
  return "dev-stub";
}

export function assertWebProductionProjectAvailable(options: {
  command: WebViteCommand;
  projectDir: string | undefined;
}): void {
  if (resolveWebProjectPluginMode(options) === "production-required") {
    throw new Error(PRODUCTION_PROJECT_REQUIRED_MESSAGE);
  }
}
