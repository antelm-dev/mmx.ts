// Outside ClientSettings like the notice flag: that schema is shared with the engine and drops unknown keys.
export const RECENT_PROJECTS_KEY = "mmx.studio-recent-projects.v1";
export const MAX_RECENT_PROJECTS = 10;

export interface RecentProject {
  rootPath: string;
  name: string;
  /** Epoch milliseconds of the last successful open. */
  openedAt: number;
}

type RecentStorage = Pick<Storage, "getItem" | "setItem">;

function isRecent(value: unknown): value is RecentProject {
  const v = value as RecentProject | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.rootPath === "string" &&
    typeof v.name === "string" &&
    typeof v.openedAt === "number"
  );
}

/** Most recent first; an unreadable or corrupt entry reads as an empty list. */
export function readRecentProjects(
  storage: Pick<Storage, "getItem"> = localStorage,
): RecentProject[] {
  try {
    const parsed = JSON.parse(storage.getItem(RECENT_PROJECTS_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, MAX_RECENT_PROJECTS) : [];
  } catch {
    return [];
  }
}

function write(list: RecentProject[], storage: RecentStorage): RecentProject[] {
  try {
    storage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the list just isn't remembered */
  }
  return list;
}

/** Move (or add) the project to the top of the list, keeping at most {@link MAX_RECENT_PROJECTS}. */
export function addRecentProject(
  project: Omit<RecentProject, "openedAt">,
  storage: RecentStorage = localStorage,
  now = Date.now(),
): RecentProject[] {
  const rest = readRecentProjects(storage).filter((p) => p.rootPath !== project.rootPath);
  return write([{ ...project, openedAt: now }, ...rest].slice(0, MAX_RECENT_PROJECTS), storage);
}

export function removeRecentProject(
  rootPath: string,
  storage: RecentStorage = localStorage,
): RecentProject[] {
  return write(
    readRecentProjects(storage).filter((p) => p.rootPath !== rootPath),
    storage,
  );
}
