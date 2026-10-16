import { resolve } from "node:path";
import { _electron as electron, type Page } from "@playwright/test";
import electronPath from "electron";

export const NOTICE_SEEN_KEY = "mmx.studio-notice-seen.v1";
export const SHOW_START_PAGE_KEY = "mmx.studio-show-start-page.v1";
export const RECENT_PROJECTS_KEY = "mmx.studio-recent-projects.v1";
/** Profile keys the specs run with; `null` leaves the value as is (specs opening projects add recents). */
const SPEC_VALUES: Record<string, string | null> = {
  [NOTICE_SEEN_KEY]: "1",
  [SHOW_START_PAGE_KEY]: "false",
  [RECENT_PROJECTS_KEY]: null,
};
// Same process as globalTeardown: env carries the developer's values across. null = key was absent.
const PREVIOUS_ENV = "MMX_E2E_PROFILE_PREVIOUS";

/** Runs `fn` against a window of the built app on the real Studio profile the specs share. */
export async function withRealProfile<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const appRoot = resolve(__dirname, "..");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [resolve(appRoot, "out/main/index.js")],
    cwd: appRoot,
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    const result = await fn(page);
    // localStorage commits lazily; without this a quick close can drop the write.
    await app.evaluate(({ session }) => session.defaultSession.flushStorageData());
    return result;
  } finally {
    await app.close();
  }
}

/**
 * Marks the first-launch notice as seen and turns the start page off so neither covers the
 * editor in the specs; fan-notice.spec.ts and start-page.spec.ts use their own fresh profile
 * instead. globalTeardown puts the developer's values back, recent projects included.
 */
export default async function globalSetup(): Promise<void> {
  const previous = await withRealProfile((page) =>
    page.evaluate((values) => {
      const before: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(values)) {
        before[key] = localStorage.getItem(key);
        if (value !== null) localStorage.setItem(key, value);
      }
      return before;
    }, SPEC_VALUES),
  );
  process.env[PREVIOUS_ENV] = JSON.stringify(previous);
}

export async function restoreProfile(): Promise<void> {
  const raw = process.env[PREVIOUS_ENV];
  if (raw === undefined) return; // setup never recorded the values: leave the profile alone
  const previous = JSON.parse(raw) as Record<string, string | null>;
  await withRealProfile((page) =>
    page.evaluate((values) => {
      for (const [key, value] of Object.entries(values)) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
    }, previous),
  );
}
