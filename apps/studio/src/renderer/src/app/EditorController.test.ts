import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLevelDocument } from "@mmx/content-schema";

// The controller's Pixi, Play and dock collaborators are not needed for the recovery draft.
vi.mock("../core/EditorViewport.js", () => ({ EditorViewport: class {} }));
vi.mock("./EditorPlaytestController.js", () => ({ EditorPlaytestController: class {} }));
vi.mock("./dock.js", () => ({ focusPanel: () => {}, isPanelVisible: () => false }));
vi.mock("../assets/studioAssets.js", () => {
  const assets = { catalog: { load: async () => undefined }, manifest: {} };
  return {
    starterAssets: assets,
    buildStarterAssets: () => assets,
    buildStudioAssets: () => assets,
  };
});
vi.mock("../settings/studioClientSettings.js", () => ({
  minimapVisibleAtLaunch: () => true,
  persistMinimapVisible: () => {},
}));

const V2 = "mmx-studio.recovery.v2";
const storage = new Map<string, string>();
const saveFile = vi.fn(async () => ({}));

// Stubbed before the import: the theme and settings modules read them when they load.
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});
vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {} }));
/** A project at `/p` with levels A (the entry) and B. */
const project = {
  load: async (rootPath: string) => {
    const level = (id: string, name: string) => ({
      id,
      path: `levels/${id}.json`,
      document: { ...createLevelDocument(), id, name },
    });
    const levels = [level("level.a", "A"), level("level.b", "B")];
    const manifest = {
      schemaVersion: 1,
      id: "p",
      name: "P",
      gameVersion: "0.1.0",
      compatibleRuntime: { min: "1.0.0" },
      entryLevelId: "level.a",
      assets: [],
      levels: levels.map(({ id, path }) => ({ id, path })),
    };
    return { ok: true, issues: [], value: { rootPath, project: { manifest, levels } } };
  },
  readPlayAssets: async () => ({ ok: true, issues: [], value: { gameData: {}, urls: {} } }),
  save: async (rootPath: string, saved: unknown) => ({
    ok: true,
    issues: [],
    value: { rootPath, project: saved },
  }),
  // Work projects (C-WORK): one at WORK, saved to /games/hero.
  createWorkProject: vi.fn(async (input: { initialLevel: { name: string } }) => {
    const document = { ...input.initialLevel, id: "level.main" };
    const levels = [{ id: "level.main", path: "levels/level.main.json", document }];
    const manifest = {
      schemaVersion: 1,
      id: "untitled.project",
      name: "Untitled Project",
      gameVersion: "0.1.0",
      compatibleRuntime: { min: "1.0.0" },
      entryLevelId: "level.main",
      assets: [],
      levels: [{ id: "level.main", path: "levels/level.main.json" }],
    };
    return { ok: true, issues: [], value: { rootPath: WORK, project: { manifest, levels } } };
  }),
  listWorkProjects: async () => workProjects,
  pickWorkDestination: async () => "/games/hero",
  moveWorkProject: async () => ({ ok: true, issues: [], value: { rootPath: "/games/hero" } }),
};
const WORK = "/userData/work-projects/w1";
let workProjects: { rootPath: string; name: string; modifiedAt: number }[] = [];
vi.stubGlobal("window", { studio: { files: { saveFile }, project }, confirm: () => true });
vi.stubGlobal("document", { title: "", documentElement: { dataset: {}, style: {} } });
beforeEach(() => storage.clear());

const { EditorController } = await import("./EditorController.js");
const { setRoomSettings } = await import("../core/actions.js");
const { projectSession } = await import("../core/projectSession.js");
const { readRecentProjects } = await import("../settings/recentProjects.js");
const { useUiStore } = await import("../store/uiStore.js");

describe("EditorController recovery draft", () => {
  const crash = { ...createLevelDocument(), id: "level.crash", name: "Crash" };
  const draft = JSON.stringify({ rootPath: "/projects/x", document: crash });

  it("keeps a crash draft when a level opens, and offers it", () => {
    storage.set(V2, draft);
    const editor = new EditorController();
    expect(editor.hasRecoveryDraft()).toBe(true);
    editor.store.open({ ...createLevelDocument(), id: "level.other", name: "Other" });
    expect(storage.get(V2)).toBe(draft);
    expect(editor.hasRecoveryDraft()).toBe(true);
  });

  it("writes the draft on an edit and clears it on save", async () => {
    storage.set(V2, draft);
    const editor = new EditorController();
    const doc = editor.store.get().document;
    const { gridSize, cols } = doc;
    editor.store.execute(setRoomSettings(doc, { name: "Edited", gridSize, cols, rows: 20 }));
    expect(JSON.parse(storage.get(V2)!)).toMatchObject({
      rootPath: null,
      document: { name: "Edited", rows: 20 },
    });
    expect(editor.hasRecoveryDraft()).toBe(false);

    editor.save();
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalled());
    await vi.waitFor(() => expect(storage.has(V2)).toBe(false));
    expect(editor.hasRecoveryDraft()).toBe(false);
  });

  it("keeps a crash draft through a save with no edit this session", async () => {
    storage.set(V2, draft);
    const editor = new EditorController();
    const saved = vi.spyOn(editor.store, "markSaved");
    editor.save();
    await vi.waitFor(() => expect(saved).toHaveBeenCalled());
    expect(storage.get(V2)).toBe(draft);
    expect(editor.hasRecoveryDraft()).toBe(true);
  });

  it("does not offer this project's draft on another level once it matches its own level", async () => {
    const editor = new EditorController();
    expect(await editor.openProject("/p")).toEqual({ opened: true });
    const doc = editor.store.get().document;
    const { gridSize, cols } = doc;
    editor.store.execute(setRoomSettings(doc, { name: "A2", gridSize, cols, rows: 20 }));
    expect(JSON.parse(storage.get(V2)!)).toMatchObject({
      rootPath: "/p",
      document: { id: "level.a" },
    });

    editor.openProjectLevel("level.b");
    expect(editor.store.get().document.id).toBe("level.b");
    expect(editor.hasRecoveryDraft()).toBe(false);
  });
});

describe("EditorController work project (C-WORK)", () => {
  it("ensureProject keeps the current level as the entry level of an untitled project", async () => {
    projectSession.close();
    const editor = new EditorController();
    const doc = editor.store.get().document;
    const { gridSize, cols } = doc;
    editor.store.execute(setRoomSettings(doc, { name: "Mine", gridSize, cols, rows: 20 }));

    const [first, second] = await Promise.all([editor.ensureProject(), editor.ensureProject()]);
    expect([first, second]).toEqual([true, true]);
    expect(project.createWorkProject).toHaveBeenCalledTimes(1);
    expect(editor.store.get().document).toMatchObject({ id: "level.main", name: "Mine", rows: 20 });
    expect(projectSession.getSnapshot()).toMatchObject({ rootPath: WORK, untitled: true });
    // The level's draft is in the work folder now, so it is not offered back.
    expect(storage.has(V2)).toBe(false);
    expect(editor.hasRecoveryDraft()).toBe(false);
    expect(await editor.ensureProject()).toBe(true);
    expect(project.createWorkProject).toHaveBeenCalledTimes(1);
    expect(readRecentProjects()).toEqual([]);
    await projectSession.getAssets();
  });

  it("restores a leftover work project with its draft, which then follows the project on Save", async () => {
    projectSession.close();
    workProjects = [{ rootPath: WORK, name: "Untitled Project", modifiedAt: 1 }];
    const edited = { ...createLevelDocument(), id: "level.a", name: "A", rows: 20 };
    storage.set(V2, JSON.stringify({ rootPath: WORK, document: edited }));
    const editor = new EditorController();
    // Offered by the Start tab's Restore, not on its own.
    await vi.waitFor(() => expect(projectSession.leftoverWorkProjects()).toHaveLength(1));
    expect(editor.hasRecoveryDraft()).toBe(false);

    expect(await editor.restoreWorkProject(WORK)).toEqual({ opened: true });
    expect(editor.store.get().document).toMatchObject({ id: "level.a", rows: 20 });
    expect(projectSession.getSnapshot()).toMatchObject({ untitled: true, dirty: true });
    expect(editor.hasRecoveryDraft()).toBe(false);
    expect(readRecentProjects()).toEqual([]);

    editor.save();
    expect(useUiStore.getState().saveProjectOpen).toBe(true);
    await editor.saveUntitledProject("Hero");
    expect(projectSession.getSnapshot()).toMatchObject({
      rootPath: "/games/hero",
      untitled: false,
    });
    expect(JSON.parse(storage.get(V2)!)).toMatchObject({ rootPath: "/games/hero" });
    expect(readRecentProjects()).toMatchObject([{ rootPath: "/games/hero", name: "Hero" }]);
    workProjects = [];
    await projectSession.getAssets();
  });
});
