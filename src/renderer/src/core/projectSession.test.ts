import { afterEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@mmx/renderer-pixi", () => ({
  resetSheetCache: vi.fn(async () => {
    await Promise.resolve();
    calls.push("reset");
  }),
}));

vi.mock("../assets/studioAssets.js", () => {
  const fakeAssets = (name: string) => ({
    catalog: { load: async () => void calls.push(`load:${name}`) },
  });
  return {
    starterAssets: fakeAssets("starter"),
    buildStarterAssets: () => {
      calls.push("build:starter");
      return fakeAssets("starter");
    },
    buildStudioAssets: (_project: unknown, gameData: { bindings?: { playerAnimation?: string } }) => {
      calls.push(`build:project${gameData.bindings?.playerAnimation ? `:${gameData.bindings.playerAnimation}` : ""}`);
      return fakeAssets("project");
    },
  };
});

vi.mock("@mmx/project-io", () => ({ PROJECT_VALIDATION: {}, updateLevelDocument: vi.fn() }));
vi.mock("@mmx/project-schema", () => ({ validateProject: () => ({ issues: [] }) }));

const { ProjectSession } = await import("./projectSession.js");

const project = { manifest: { assets: [] }, levels: [] };
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

describe("ProjectSession player animation binding", () => {
  it("plays the unsaved binding without reading the disk again, and writes it after the manifest on save", async () => {
    const writes: string[] = [];
    const withData = {
      ...bridge,
      readPlayAssets: async () => {
        calls.push("read");
        return { ok: true, issues: [], value: { gameData: { bindings: { playerAnimation: "anim.a" } }, urls: {} } };
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
    const fast = { id: "obj.fast", name: "Fast", base: "platform.moving", values: { Speed: 120 } };
    const withObjects = { ...project, manifest: { ...project.manifest, objects: [fast] } };
    vi.stubGlobal("window", {
      studio: {
        project: {
          ...bridge,
          load: async () => ({ ok: true, issues: [], value: { rootPath: "/p", project: withObjects } }),
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
