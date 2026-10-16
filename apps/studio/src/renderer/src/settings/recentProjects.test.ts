import { describe, expect, it } from "vitest";
import {
  addRecentProject,
  MAX_RECENT_PROJECTS,
  readRecentProjects,
  RECENT_PROJECTS_KEY,
  removeRecentProject,
} from "./recentProjects.js";

function memoryStorage() {
  const memory = new Map<string, string>();
  return {
    memory,
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
  };
}

describe("recent projects", () => {
  it("lists the most recently opened first without duplicate paths", () => {
    const storage = memoryStorage();
    addRecentProject({ rootPath: "C:/a", name: "A" }, storage, 1);
    addRecentProject({ rootPath: "C:/b", name: "B" }, storage, 2);
    addRecentProject({ rootPath: "C:/a", name: "A renamed" }, storage, 3);
    expect(readRecentProjects(storage)).toEqual([
      { rootPath: "C:/a", name: "A renamed", openedAt: 3 },
      { rootPath: "C:/b", name: "B", openedAt: 2 },
    ]);
  });

  it(`keeps at most ${MAX_RECENT_PROJECTS} entries, dropping the oldest`, () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_RECENT_PROJECTS + 2; i++) {
      addRecentProject({ rootPath: `C:/p${i}`, name: `P${i}` }, storage, i);
    }
    const list = readRecentProjects(storage);
    expect(list).toHaveLength(MAX_RECENT_PROJECTS);
    expect(list[0]?.rootPath).toBe(`C:/p${MAX_RECENT_PROJECTS + 1}`);
    expect(list.some((p) => p.rootPath === "C:/p0" || p.rootPath === "C:/p1")).toBe(false);
  });

  it("removes an entry by path", () => {
    const storage = memoryStorage();
    addRecentProject({ rootPath: "C:/a", name: "A" }, storage, 1);
    addRecentProject({ rootPath: "C:/b", name: "B" }, storage, 2);
    expect(removeRecentProject("C:/b", storage).map((p) => p.rootPath)).toEqual(["C:/a"]);
    expect(readRecentProjects(storage).map((p) => p.rootPath)).toEqual(["C:/a"]);
  });

  it("reads corrupt or malformed storage as an empty list and recovers on the next add", () => {
    const storage = memoryStorage();
    storage.memory.set(RECENT_PROJECTS_KEY, "{not json");
    expect(readRecentProjects(storage)).toEqual([]);
    storage.memory.set(RECENT_PROJECTS_KEY, JSON.stringify([{ rootPath: 1 }, "x", null]));
    expect(readRecentProjects(storage)).toEqual([]);
    addRecentProject({ rootPath: "C:/a", name: "A" }, storage, 1);
    expect(readRecentProjects(storage)).toHaveLength(1);
  });

  it("does not throw when storage is unavailable", () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readRecentProjects(broken)).toEqual([]);
    expect(addRecentProject({ rootPath: "C:/a", name: "A" }, broken, 1)).toHaveLength(1);
    expect(removeRecentProject("C:/a", broken)).toEqual([]);
  });
});
