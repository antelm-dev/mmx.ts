import { afterEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@mmx/renderer-pixi", () => ({
  resetSheetCache: vi.fn(async () => {
    await Promise.resolve();
    calls.push("reset");
  }),
}));

vi.mock("../assets/studioAssets.js", () => {
  // The bound player animation has every clip Play needs.
  const everyClip = new Proxy({}, { get: () => ({}) });
  const fakeAssets = (name: string, player = "") => ({
    catalog: { load: async () => void calls.push(`load:${name}`) },
    project: { assets: [{ id: player, kind: "animation", animations: everyClip }] },
  });
  return {
    starterAssets: fakeAssets("starter"),
    starterGameData: { bindings: { playerAnimation: "anim.starter" } },
    buildStarterAssets: () => {
      calls.push("build:starter");
      return fakeAssets("starter");
    },
    buildStudioAssets: (
      _project: unknown,
      gameData: { bindings?: { playerAnimation?: string } },
    ) => {
      const player = gameData.bindings?.playerAnimation;
      calls.push(`build:project${player ? `:${player}` : ""}`);
      return fakeAssets("project", player);
    },
    buildStarterBasedAssets: (
      _project: unknown,
      gameData: { bindings: { playerAnimation: string } },
    ) => {
      const player = gameData.bindings.playerAnimation;
      calls.push(`build:starter-based:${player}`);
      return fakeAssets("starter-based", player);
    },
  };
});

vi.mock("@mmx/project-io", () => ({
  PROJECT_VALIDATION: {},
  levelManifestPath: (id: string) => `levels/${id}.json`,
  updateLevelDocument: (
    project: { levels: { id: string }[] },
    levelId: string,
    document: unknown,
  ) => ({
    ...project,
    levels: project.levels.map((level) => (level.id === levelId ? { ...level, document } : level)),
  }),
}));
vi.mock("@mmx/project-schema", () => ({ validateProject: () => ({ issues: [] }) }));

const { ProjectSession } = await import("./projectSession.js");
const { deleteBlocker } = await import("./objectDefinitions.js");
const { PLAYERS_OVERLAY } = await import("./mmx.test-support.js");

const project = { manifest: { assets: [] }, levels: [] };
// Opened and created projects carry the player packs (the migration adds them): the engine has none.
const playersProject = { ...project, gameData: PLAYERS_OVERLAY };
const bridge = {
  pickDirectory: async () => "/projects/b",
  load: async () => ({ ok: true, issues: [], value: { rootPath: "/projects/b", project } }),
  readPlayAssets: async () => {
    calls.push("read");
    return { ok: true, issues: [], value: { gameData: {}, urls: {} } };
  },
};

afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe("ProjectSession asset switch", () => {
  it("releases old renderers, then awaits the sheet reset, then loads the new sheets", async () => {
    vi.stubGlobal("window", { studio: { project: bridge } });
    const session = new ProjectSession();
    session.beforeSheetReset = () => calls.push("release");

    await session.openProject();
    expect(await session.getAssets()).not.toBeNull();
    expect(calls).toEqual(["release", "reset", "read", "build:project", "load:project"]);
  });

  it("reloads a fresh starter after the reset when the project closes", async () => {
    vi.stubGlobal("window", { studio: { project: bridge } });
    const session = new ProjectSession();
    session.beforeSheetReset = () => calls.push("release");

    await session.openProject();
    await session.getAssets();
    calls.length = 0;
    session.close();
    await session.getAssets();
    expect(calls).toEqual(["release", "reset", "build:starter", "load:starter"]);
  });
});

describe("ProjectSession without game/data.json", () => {
  // Main seeds game/data.json (and the starter assets it binds) on the first player binding.
  const seededProject = { ...playersProject, manifest: { assets: [{ id: "sprite.hud.x-bar" }] } };
  let onDisk: { bindings: { playerAnimation: string } } | null = null;
  const noData = {
    ...bridge,
    load: async () => ({
      ok: true,
      issues: [],
      value: { rootPath: "/projects/b", project: playersProject },
    }),
    readPlayAssets: async () => {
      calls.push("read");
      return { ok: true, issues: [], value: { gameData: onDisk, urls: {} } };
    },
    save: async () => ({
      ok: true,
      issues: [],
      value: { rootPath: "/projects/b", project: playersProject },
    }),
    writePlayerAnimation: async (_root: string, id: string) => {
      onDisk = { bindings: { playerAnimation: id } };
      return { ok: true, issues: [], value: seededProject };
    },
  };
  afterEach(() => (onDisk = null));

  it("plays with the starter's game data and reports no issue, as a new project has none yet", async () => {
    vi.stubGlobal("window", { studio: { project: noData } });
    const session = new ProjectSession();

    await session.openProject();
    expect(await session.getAssets()).not.toBeNull();
    expect(calls).toEqual([
      "reset",
      "read",
      "build:starter-based:anim.starter",
      "load:starter-based",
    ]);
    expect(session.getSnapshot().issues).toEqual([]);
  });

  it("plays a bound player animation, then adopts the project seeded on Save and reads it", async () => {
    vi.stubGlobal("window", { studio: { project: noData } });
    const session = new ProjectSession();
    await session.openProject();
    await session.getAssets();
    calls.length = 0;

    session.setPlayerAnimation("anim.mine");
    expect(await session.getAssets()).not.toBeNull();
    expect(calls).toEqual(["build:starter-based:anim.mine", "load:starter-based"]);
    expect(session.getSnapshot().issues).toEqual([]);
    calls.length = 0;

    // Its own game/data.json now: read from disk, drawn from the project's assets alone.
    await session.saveProject();
    expect(session.getSnapshot().project).toBe(seededProject);
    expect(calls).toEqual(["reset", "read", "build:project:anim.mine", "load:project"]);
    expect(session.playerAnimation()).toBe("anim.mine");
    expect(session.getSnapshot().issues).toEqual([]);
  });
});

describe("ProjectSession failed open", () => {
  it("keeps the open project when another folder fails to load", async () => {
    const missing = { severity: "error", code: "project.missing", path: "/", message: "gone" };
    const load = vi.fn(async (root: string) =>
      root === "/projects/b"
        ? { ok: true, issues: [], value: { rootPath: "/projects/b", project } }
        : { ok: false, issues: [missing] },
    );
    vi.stubGlobal("window", { studio: { project: { ...bridge, load } } });
    const session = new ProjectSession();
    await session.openProject();
    const opened = session.getSnapshot();

    expect(await session.openProject("/projects/moved")).toEqual([missing]);
    const after = session.getSnapshot();
    expect(after).toEqual({ ...opened, issues: [missing] });
    expect(after.project).toBe(opened.project);
    expect(after.open).toBe(true);
    expect(after.rootPath).toBe("/projects/b");
  });

  it("reports the failed load's issues when no project was open", async () => {
    const missing = { severity: "error", code: "project.missing", path: "/", message: "gone" };
    const load = async () => ({ ok: false, issues: [missing] });
    vi.stubGlobal("window", { studio: { project: { ...bridge, load } } });
    const session = new ProjectSession();

    expect(await session.openProject("/projects/moved")).toEqual([missing]);
    expect(session.getSnapshot()).toMatchObject({ open: false, project: null, issues: [missing] });
  });
});

describe("ProjectSession player animation binding", () => {
  it("plays the unsaved binding without reading the disk again, and writes it after the manifest on save", async () => {
    const writes: string[] = [];
    const withData = {
      ...bridge,
      readPlayAssets: async () => {
        calls.push("read");
        return {
          ok: true,
          issues: [],
          value: { gameData: { bindings: { playerAnimation: "anim.a" } }, urls: {} },
        };
      },
      save: async () => {
        writes.push("save");
        return { ok: true, issues: [], value: { rootPath: "/projects/b", project } };
      },
      writePlayerAnimation: async (_root: string, id: string) => {
        writes.push(`data.json:${id}`);
        return { ok: true, issues: [], value: null };
      },
    };
    vi.stubGlobal("window", { studio: { project: withData } });
    const session = new ProjectSession();
    await session.openProject();
    await session.getAssets();
    expect(session.playerAnimation()).toBe("anim.a");
    calls.length = 0;

    session.setPlayerAnimation("anim.b");
    await session.getAssets();
    expect(calls).toEqual(["build:project:anim.b", "load:project"]);
    expect(session.getSnapshot().dirty).toBe(true);

    await session.saveProject();
    expect(writes).toEqual(["save", "data.json:anim.b"]);
    expect(session.getSnapshot().playerAnimation).toBeUndefined();
    expect(session.playerAnimation()).toBe("anim.b");
  });
});

describe("ProjectSession object definitions", () => {
  it("registers the project's definitions on open and on every edit, and clears them on close", async () => {
    const { getDefinition } = await import("@mmx/content-schema");
    const { MMX_OVERLAY } = await import("./mmx.test-support.js");
    const fast = { id: "obj.fast", name: "Fast", base: "platform.moving", values: { Speed: 120 } };
    // A project made from the template: its moving platform comes with the MMX Starter pack.
    const withObjects = {
      ...project,
      manifest: { ...project.manifest, objects: [fast] },
      gameData: MMX_OVERLAY,
    };
    vi.stubGlobal("window", {
      studio: {
        project: {
          ...bridge,
          load: async () => ({
            ok: true,
            issues: [],
            value: { rootPath: "/p", project: withObjects },
          }),
        },
      },
    });
    const session = new ProjectSession();
    await session.openProject();
    expect(getDefinition("obj.fast")?.baseId).toBe("platform.moving");

    session.setObjects([{ ...fast, base: "nope" }]);
    expect(getDefinition("obj.fast")).toBeUndefined();
    expect(session.getSnapshot().dirty).toBe(true);
    expect(session.getSnapshot().issues).toContainEqual(
      expect.objectContaining({ code: "object.base", path: "/objects/0/base" }),
    );

    session.setObjects([fast]);
    expect(getDefinition("obj.fast")).toBeDefined();
    session.close();
    expect(getDefinition("obj.fast")).toBeUndefined();
  });
});

describe("ProjectSession game data", () => {
  it("compiles data/game.json, registers its enemies before the project's objects, and reports a bad overlay", async () => {
    const { getDefinition } = await import("@mmx/content-schema");
    const { MMX_GAME_DATA, MMX_OVERLAY } = await import("./mmx.test-support.js");
    const { addEnemy } = await import("./gameData.js");
    // The crab copies the Metool of the MMX Starter pack the project carries.
    const { overlay } = addEnemy(MMX_OVERLAY, MMX_GAME_DATA, {
      name: "Crab",
      base: "metool",
      sheet: "anim.crab",
      health: 3,
      touchDamage: 2,
    });
    const right = {
      id: "obj.crab.right",
      name: "Crab (right)",
      base: "enemy.crab",
      values: { FacesRight: true },
    };
    const crabProject = {
      ...project,
      manifest: { ...project.manifest, objects: [right] },
      gameData: overlay,
    };
    vi.stubGlobal("window", {
      studio: {
        project: {
          ...bridge,
          load: async () => ({
            ok: true,
            issues: [],
            value: { rootPath: "/p", project: crabProject },
          }),
        },
      },
    });
    const session = new ProjectSession();
    await session.openProject();
    expect(getDefinition("enemy.crab")?.fields).toEqual({ Kind: "crab" });
    expect(getDefinition("obj.crab.right")?.baseId).toBe("enemy.crab");
    expect(session.getSnapshot().issues).toEqual([]);
    expect(session.gameData().compiled.enemies.has("crab")).toBe(true);

    // An unsupported category: reported, the crab is gone, and Play is refused (issues).
    session.setGameData({ ...overlay, physics: {} } as never);
    expect(session.getSnapshot().dirty).toBe(true);
    expect(session.getSnapshot().issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "game-data.overlay.category",
        path: "/data/game.json",
      }),
    );
    expect(session.gameData().issues).not.toEqual([]);
    expect(session.gameData().compiled.enemies.has("crab")).toBe(false);
    expect(getDefinition("enemy.crab")).toBeUndefined();

    session.setGameData(overlay);
    expect(session.getSnapshot().issues).toEqual([]);
    expect(getDefinition("obj.crab.right")).toBeDefined();
    session.close();
    expect(getDefinition("enemy.crab")).toBeUndefined();
    await session.getAssets();
  });

  it("warns about the clips a project enemy's animation lacks, once its data compiles", async () => {
    const { MMX_GAME_DATA, MMX_OVERLAY } = await import("./mmx.test-support.js");
    const { addEnemy } = await import("./gameData.js");
    // The crab copies the Metool of the MMX Starter pack the project carries.
    const { overlay } = addEnemy(MMX_OVERLAY, MMX_GAME_DATA, {
      name: "Crab",
      base: "metool",
      sheet: "anim.crab",
      health: 3,
      touchDamage: 2,
    });
    const sheet = { id: "anim.crab", kind: "animation", animations: { idle: {}, walk: {} } };
    const crabProject = {
      ...project,
      manifest: { ...project.manifest, assets: [sheet] },
      gameData: overlay,
    };
    vi.stubGlobal("window", {
      studio: {
        project: {
          ...bridge,
          load: async () => ({
            ok: true,
            issues: [],
            value: { rootPath: "/p", project: crabProject },
          }),
        },
      },
    });
    const session = new ProjectSession();
    await session.openProject();
    const clipIssues = () => session.getSnapshot().issues.filter((i) => i.code === "enemy.clips");
    expect(clipIssues()).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: "Enemy 'crab' animation 'anim.crab' has no clip for: defense, open, stun.",
      }),
    ]);
    // A hand-edited ability is a compile error, never a crash of this check.
    const crab = overlay.enemies!.crab!;
    session.setGameData({ ...overlay, enemies: { crab: { ...crab, abilities: ["constructor"] } } });
    expect(clipIssues()).toEqual([]);
    expect(session.getSnapshot().issues.some((i) => i.severity === "error")).toBe(true);
    session.close();
    await session.getAssets();
  });
});

describe("ProjectSession definition history", () => {
  it("undoes and redoes object and game-data edits, re-registering the catalog, until the project changes", async () => {
    const { getDefinition } = await import("@mmx/content-schema");
    const { GAME_DATA } = await import("@mmx/engine/data");
    const { MMX_GAME_DATA, MMX_OVERLAY } = await import("./mmx.test-support.js");
    const { addEnemy } = await import("./gameData.js");
    const { renameEnemy } = await import("./enemyEditor.js");
    vi.stubGlobal("window", { studio: { project: bridge } });
    const session = new ProjectSession();
    await session.openProject();
    expect(session.undoDefinitions()).toBe(false);

    const { overlay } = addEnemy(MMX_OVERLAY, MMX_GAME_DATA, {
      name: "Crab",
      base: "metool",
      sheet: "anim.crab",
      health: 3,
      touchDamage: 2,
    });
    session.setGameData(overlay);
    session.setGameData(renameEnemy(overlay, "enemy.crab", "Spiky Crab"));
    const right = { id: "obj.enemy.crab.1", name: "Crab (right)", base: "enemy.crab" };
    session.setObjects([right]);
    expect(getDefinition("enemy.crab")?.name).toBe("Spiky Crab");
    expect(getDefinition(right.id)?.baseId).toBe("enemy.crab");

    expect(session.undoDefinitions()).toBe(true);
    expect(getDefinition(right.id)).toBeUndefined();
    expect(session.undoDefinitions()).toBe(true);
    expect(getDefinition("enemy.crab")?.name).toBe("Crab");
    expect(session.getSnapshot().dirty).toBe(true);
    expect(session.redoDefinitions()).toBe(true);
    expect(getDefinition("enemy.crab")?.name).toBe("Spiky Crab");

    // Back to before the first enemy: an empty overlay, so a save would clear data/game.json.
    session.undoDefinitions();
    session.undoDefinitions();
    expect(getDefinition("enemy.crab")).toBeUndefined();
    expect(session.getSnapshot().project?.gameData).toEqual({
      schemaVersion: GAME_DATA.schemaVersion,
    });
    expect(session.getSnapshot().project?.manifest.objects).toBeUndefined();
    expect(session.undoDefinitions()).toBe(false);

    // A new edit drops the redo branch.
    session.redoDefinitions();
    expect(session.canRedoDefinitions).toBe(true);
    session.setObjects([]);
    expect(session.canRedoDefinitions).toBe(false);
    expect(session.canUndoDefinitions).toBe(true);

    // A commit that changes nothing records nothing.
    while (session.undoDefinitions());
    session.setGameData(structuredClone(overlay));
    session.setGameData(structuredClone(overlay));
    session.undoDefinitions();
    expect(session.canUndoDefinitions).toBe(false);

    session.close();
    expect(session.canUndoDefinitions).toBe(false);
    await session.getAssets();
  });
});

describe("ProjectSession levels", () => {
  const twoLevels = () => {
    const level = (id: string, name: string) => ({
      id,
      path: `levels/${id}.json`,
      // Level A places one instance of the project object `obj.crab`.
      document: { id, name, objects: id === "level.a" ? [{ definitionId: "obj.crab" }] : [] },
    });
    return {
      manifest: {
        assets: [],
        entryLevelId: "level.a",
        levels: [
          { id: "level.a", path: "levels/level.a.json" },
          { id: "level.b", path: "levels/level.b.json" },
        ],
      },
      levels: [level("level.a", "A"), level("level.b", "B")],
    };
  };
  const open = async () => {
    const load = async () => ({
      ok: true,
      issues: [],
      value: { rootPath: "/projects/b", project: twoLevels() },
    });
    vi.stubGlobal("window", { studio: { project: { ...bridge, load } } });
    const session = new ProjectSession();
    await session.openProject();
    return session;
  };
  const ids = (session: InstanceType<typeof ProjectSession>) => {
    const p = session.getSnapshot().project!;
    const refs = p.manifest.levels.map((level) => level.id);
    // The loaded levels follow the manifest's order.
    expect(p.levels.map((level) => level.id)).toEqual(refs);
    return refs;
  };

  it("starts on the entry level and marks the project unsaved only when a level changes", async () => {
    const session = await open();
    expect(session.getSnapshot().currentLevelId).toBe("level.a");
    const a = session.getCurrentLevelDocument()!;
    session.syncLevel("level.a", a);
    expect(session.getSnapshot().dirty).toBeFalsy();

    session.syncLevel("level.a", { ...a, name: "A2" });
    session.setCurrentLevel("level.b");
    expect(session.getSnapshot()).toMatchObject({ currentLevelId: "level.b", dirty: true });
    // The level left keeps its edit; the entry level stays the entry.
    expect(session.getSnapshot().project!.levels[0]!.document.name).toBe("A2");
    expect(session.getSnapshot().project!.manifest.entryLevelId).toBe("level.a");
    await session.getAssets();
  });

  it("adds levels with unique ids and moves, renames and sets the entry", async () => {
    const session = await open();
    expect(session.addLevel("Level 3")).toBe("level.3");
    expect(session.addLevel("Level 3")).toBe("level.3.2");
    expect(session.addLevel("B")).toBe("level.b.2");
    expect(session.getSnapshot().dirty).toBe(true);
    const added = session.getSnapshot().project!.levels[2]!;
    expect(added).toMatchObject({
      path: "levels/level.3.json",
      document: { id: "level.3", name: "Level 3" },
    });

    session.moveLevel("level.3", 0);
    expect(ids(session)).toEqual(["level.3", "level.a", "level.b", "level.3.2", "level.b.2"]);
    session.moveLevel("level.a", 4);
    expect(ids(session)).toEqual(["level.3", "level.b", "level.3.2", "level.b.2", "level.a"]);
    session.moveLevel("level.a", 5);
    expect(ids(session)).toEqual(["level.3", "level.b", "level.3.2", "level.b.2", "level.a"]);

    session.renameLevel("level.b", "Boss");
    const b = session.getSnapshot().project!.levels.find((level) => level.id === "level.b")!;
    expect(b).toMatchObject({
      path: "levels/level.b.json",
      document: { id: "level.b", name: "Boss" },
    });

    session.setEntryLevel("level.b");
    expect(session.getSnapshot().project!.manifest.entryLevelId).toBe("level.b");
    await session.getAssets();
  });

  it("refuses to delete the entry or the last level and leaves a deleted current level", async () => {
    const session = await open();
    expect(session.deleteLevel("level.a")).toBe(false);
    expect(session.getSnapshot().dirty).toBeFalsy();

    session.setCurrentLevel("level.b");
    expect(session.deleteLevel("level.b")).toBe(true);
    expect(ids(session)).toEqual(["level.a"]);
    expect(session.getSnapshot()).toMatchObject({ currentLevelId: "level.a", dirty: true });
    expect(session.deleteLevel("level.a")).toBe(false);
    await session.getAssets();
  });

  it("counts a level you left when a definition delete is checked", async () => {
    const session = await open();
    session.setCurrentLevel("level.b");
    const live = session.getCurrentLevelDocument()!;
    const docs = session.levelDocuments(live);
    expect(docs).toHaveLength(2);
    expect(docs).toContain(live);
    expect(deleteBlocker("obj.crab", docs as never, [])).toMatch(/Used by 1 placed object/);
    await session.getAssets();
  });

  it("restores a recovery draft from this project into its own level", async () => {
    const session = await open();
    const draftB = { ...session.getSnapshot().project!.levels[1]!.document, name: "B draft" };
    const draft = { document: draftB as never, rootPath: "/projects/b" };
    expect(session.recoveryTarget(draft)).toMatchObject({ id: "level.b", name: "B" });
    expect(session.recoverLevel(draft)).toBe(draftB);
    expect(session.getSnapshot().currentLevelId).toBe("level.b");
    expect(ids(session)).toEqual(["level.a", "level.b"]);
    await session.getAssets();
  });

  it.each([
    ["another project", "/projects/x"],
    ["no project", null],
    ["an unknown project (v1 draft)", undefined],
  ])("adds a recovery draft from %s as a new level, never over its id", async (_, rootPath) => {
    const session = await open();
    const draftA = { ...session.getSnapshot().project!.levels[0]!.document, name: "Main" };
    const draft = { document: draftA as never, rootPath };
    expect(session.recoveryTarget(draft)).toBeNull();
    const opened = session.recoverLevel(draft)!;
    expect(opened).toMatchObject({ id: "level.main.recovered", name: "Main (recovered)" });
    expect(session.getSnapshot().currentLevelId).toBe("level.main.recovered");
    expect(ids(session)).toEqual(["level.a", "level.b", "level.main.recovered"]);
    expect(session.getSnapshot().project!.levels[0]!.document.name).toBe("A");
    // Restored twice: the taken id gets a suffix.
    expect(session.recoverLevel(draft)).toMatchObject({ id: "level.main.recovered.2" });
    await session.getAssets();
  });

  it("adds a draft from this project whose level is gone as a new level", async () => {
    const session = await open();
    const stray = { ...session.getSnapshot().project!.levels[1]!.document, id: "level.x" };
    const opened = session.recoverLevel({ document: stray as never, rootPath: "/projects/b" })!;
    expect(opened).toMatchObject({ id: "level.b.recovered", name: "B (recovered)" });
    await session.getAssets();
  });

  it("returns null without a project", () => {
    const session = new ProjectSession();
    const draft = { document: { id: "level.a", name: "A" } as never, rootPath: null };
    expect(session.recoveryTarget(draft)).toBeNull();
    expect(session.recoverLevel(draft)).toBeNull();
  });

  it("never reuses the id (and file) of a level deleted this session", async () => {
    const session = await open();
    expect(session.deleteLevel("level.b")).toBe(true);
    expect(session.addLevel("B")).toBe("level.b.2");
    await session.getAssets();
  });
});

describe("ProjectSession work project (C-WORK)", () => {
  const work = "/userData/work-projects/w1";
  const workProject = {
    manifest: { id: "untitled.project", name: "Untitled Project", assets: [] },
    levels: [],
    gameData: PLAYERS_OVERLAY,
  };
  const workBridge = (overrides: Record<string, unknown> = {}) => {
    const calls = {
      created: [] as unknown[],
      saved: [] as { rootPath: string; name: string }[],
      moved: [] as unknown[],
    };
    const stub = {
      ...bridge,
      createWorkProject: async (input: unknown) => {
        calls.created.push(input);
        return { ok: true, issues: [], value: { rootPath: work, project: workProject } };
      },
      pickWorkDestination: async () => "/games/hero",
      save: async (rootPath: string, saved: typeof workProject) => {
        calls.saved.push({ rootPath, name: saved.manifest.name });
        return { ok: true, issues: [], value: { rootPath, project: saved } };
      },
      moveWorkProject: async (input: unknown) => {
        calls.moved.push(input);
        return { ok: true, issues: [], value: { rootPath: "/games/hero" } };
      },
      listWorkProjects: async () => [
        { rootPath: work, name: "Untitled Project", modifiedAt: 2 },
        { rootPath: "/userData/work-projects/w0", name: "Older", modifiedAt: 1 },
      ],
      ...overrides,
    };
    vi.stubGlobal("window", { studio: { project: stub } });
    return calls;
  };

  it("opens the current level as an untitled, unsaved project", async () => {
    const calls = workBridge();
    const session = new ProjectSession();
    const level = { id: "level.x", name: "Mine" } as never;
    expect(await session.createWorkProject(level)).toEqual([]);
    expect(calls.created).toEqual([{ name: "Untitled Project", initialLevel: level }]);
    expect(session.getSnapshot()).toMatchObject({
      open: true,
      rootPath: work,
      untitled: true,
      dirty: true,
    });
    // The open one is never offered for restore or delete.
    await session.listWorkProjects();
    expect(session.leftoverWorkProjects().map((entry) => entry.name)).toEqual(["Older"]);
    await session.getAssets();
  });

  it("stays closed when the work project cannot be created", async () => {
    const failed = { severity: "error", code: "work-project.create", path: "/", message: "no" };
    workBridge({ createWorkProject: async () => ({ ok: false, issues: [failed] }) });
    const session = new ProjectSession();
    expect(await session.createWorkProject({} as never)).toEqual([failed]);
    expect(session.getSnapshot()).toMatchObject({ open: false, untitled: false });
  });

  it("first Save: names the project, saves it in the work folder, then moves it", async () => {
    const calls = workBridge();
    const session = new ProjectSession();
    await session.createWorkProject({} as never);
    expect(await session.saveUntitled("Hero Game")).toEqual([]);
    expect(calls.saved).toEqual([{ rootPath: work, name: "Hero Game" }]);
    expect(calls.moved).toEqual([{ workRoot: work, destination: "/games/hero" }]);
    expect(session.getSnapshot()).toMatchObject({
      rootPath: "/games/hero",
      untitled: false,
      dirty: false,
      project: { manifest: { id: "hero.game.project", name: "Hero Game" } },
    });
    await session.getAssets();
  });

  it("a cancelled folder pick changes nothing", async () => {
    const calls = workBridge({ pickWorkDestination: async () => null });
    const session = new ProjectSession();
    await session.createWorkProject({} as never);
    const before = session.getSnapshot();
    expect(await session.saveUntitled("Hero Game")).toBeNull();
    expect(session.getSnapshot()).toBe(before);
    expect(calls.saved).toEqual([]);
    await session.getAssets();
  });

  it("a failed move leaves the project untitled in the work folder", async () => {
    const failed = { severity: "error", code: "work-project.move", path: "/", message: "full" };
    workBridge({ moveWorkProject: async () => ({ ok: false, issues: [failed] }) });
    const session = new ProjectSession();
    await session.createWorkProject({} as never);
    expect(await session.saveUntitled("Hero Game")).toEqual([failed]);
    // Written to the work folder only: it still reads as unsaved.
    expect(session.getSnapshot()).toMatchObject({ rootPath: work, untitled: true, dirty: true });
    await session.getAssets();
  });
});
