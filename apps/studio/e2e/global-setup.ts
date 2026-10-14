import { resolve } from "node:path";
import { _electron as electron, type Page } from "@playwright/test";
import electronPath from "electron";

export const NOTICE_SEEN_KEY = "mmx.studio-notice-seen.v1";
// Same process as globalTeardown: env carries the developer's value across. "null" = key was absent.
const PREVIOUS_ENV = "MMX_E2E_NOTICE_SEEN_PREVIOUS";

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
 * Marks the first-launch notice as seen so its modal never covers the editor in the specs;
 * fan-notice.spec.ts uses its own fresh profile instead. globalTeardown puts the value back.
 */
export default async function globalSetup(): Promise<void> {
  const previous = await withRealProfile((page) =>
    page.evaluate((key) => {
      const value = localStorage.getItem(key);
      localStorage.setItem(key, "1");
      return value;
    }, NOTICE_SEEN_KEY),
  );
  process.env[PREVIOUS_ENV] = JSON.stringify(previous);
}

export async function restoreNoticeSeen(): Promise<void> {
  const raw = process.env[PREVIOUS_ENV];
  if (raw === undefined) return; // setup never recorded a value: leave the profile alone
  const previous = JSON.parse(raw) as string | null;
  await withRealProfile((page) =>
    page.evaluate(
      ([key, value]) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      },
      [NOTICE_SEEN_KEY, previous] as const,
    ),
  );
}
