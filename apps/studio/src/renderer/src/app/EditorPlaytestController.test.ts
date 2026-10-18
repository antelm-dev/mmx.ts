import { describe, expect, it, vi } from "vitest";
import { createLevelDocument, TerrainTile, type LevelDocument } from "@mmx/content-schema";
import { createPlaytest } from "@mmx/editor-runtime";
import { documentToLevelData } from "@mmx/editor-runtime/adapters";
import { COMPILED_GAME_DATA } from "@mmx/engine/data";
import { Recorder } from "@mmx/engine";
import { EditorStore } from "../core/EditorStore.js";
import { projectGameData } from "../core/gameData.js";
import { MMX_OVERLAY } from "../core/mmx.test-support.js";
import {
  EditorPlaytestController,
  playHereDocument,
  type PlaytestCallbacks,
} from "./EditorPlaytestController.js";

vi.mock("@mmx/editor-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mmx/editor-runtime")>()),
  createPlaytest: vi.fn(() => ({
    start: async () => undefined,
    dispose: () => undefined,
    recordedRun: () => null,
    playerMoveset: [],
    enemyKinds: [],
  })),
}));
vi.mock("@mmx/browser-audio", () => ({
  SoundEffects: class {},
  GameplaySounds: class {
    unlock(): void {}
    setMasterVolume(): void {}
    async load(): Promise<void> {}
    stopMusic(): void {}
  },
}));
vi.mock("../settings/studioClientSettings.js", () => ({
  ensureStudioClientSettings: async () => ({
    snapshot: () => ({
      audio: { masterVolume: 1 },
      input: { bindings: {} },
      gameplay: { pauseOnBlur: false },
    }),
  }),
}));

const BODY = { hw: 6, hh: 14 };
const snap16 = (v: number): number => Math.round(v / 16) * 16;

/** 20×10 cells, floor on the last row, a wall at column 10 over rows 5–8; Spawn at (32, 128). */
function level(): LevelDocument {
  const doc = createLevelDocument({ cols: 20, rows: 10 });
  for (let row = 5; row <= 8; row++) doc.tiles[row * doc.cols + 10] = TerrainTile.Solid;
  return doc;
}

function spawnOf(doc: LevelDocument) {
  return doc.objects.find((o) => o.definitionId === "spawn")!;
}

/** Core + MMX Starter, X and Zero: the game data an MMX project plays. */
const MMX = projectGameData(MMX_OVERLAY).compiled;

function controller(store: EditorStore, toast = vi.fn()) {
  const getAssets = vi.fn(async () => ({
    catalog: {},
    manifest: { playerSheet: "sheet" },
    project: { assets: [] },
  }));
  const ctl = new EditorPlaytestController(store, {
    getHost: () => ({ dataset: {} }) as HTMLElement,
    getFileAccess: () => ({}),
    getGameData: () => MMX,
    getLoadoutId: () => undefined,
    getAssets,
    validate: () => ({ ok: true, errorCount: 0 }),
    toast,
    onModeChange: (mode: "play" | "edit") => store.setMode(mode),
    setViewportVisible: () => undefined,
    restoreViewAndSelection: () => undefined,
  } as unknown as PlaytestCallbacks);
  return { ctl, getAssets, toast };
}

describe("EditorPlaytestController", () => {
  it("refuses to start Play while the project's game data has errors", async () => {
    const store = new EditorStore(createLevelDocument());
    const toast = vi.fn();
    const getAssets = vi.fn(async () => null);
    const controller = new EditorPlaytestController(store, {
      getHost: () => ({}) as HTMLElement,
      getGameData: () => null,
      getAssets,
      toast,
    } as Partial<PlaytestCallbacks> as PlaytestCallbacks);

    controller.togglePlay();
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/data\/game\.json/));
    expect(getAssets).not.toHaveBeenCalled();
    expect(store.get().mode).toBe("edit");
  });

  it("refuses to start Play when the project's data has no loadout for its player", async () => {
    const store = new EditorStore(level());
    const toast = vi.fn();
    const getAssets = vi.fn(async () => null);
    const controller = new EditorPlaytestController(store, {
      getHost: () => ({}) as HTMLElement,
      // The engine's core alone: no player since X and Zero left it for their packs.
      getGameData: () => COMPILED_GAME_DATA,
      getLoadoutId: () => undefined,
      getAssets,
      toast,
    } as Partial<PlaytestCallbacks> as PlaytestCallbacks);

    controller.togglePlay();
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/no loadout 'player\.x'/));
    expect(getAssets).not.toHaveBeenCalled();
    expect(store.get().mode).toBe("edit");
  });

  it("plays a copy with the Spawn moved, and Stop leaves the level untouched", async () => {
    const store = new EditorStore(level());
    const before = structuredClone(store.get().document);
    const { ctl } = controller(store);

    ctl.playFromHere(100, 100);
    await vi.waitFor(() => expect(createPlaytest).toHaveBeenCalled());
    const played = vi.mocked(createPlaytest).mock.calls.at(-1)![0];
    expect(played.id).toBe(`${before.id}@here`);
    expect(spawnOf(played)).toMatchObject({ x: 96, y: 96 });
    expect(store.get().mode).toBe("play");
    expect(ctl.playingFromHere).toBe(true);

    ctl.stopPlay();
    expect(ctl.playingFromHere).toBe(false);
    expect(store.get().document).toEqual(before);
    expect(store.canUndo).toBe(false);
    expect(store.isDirty).toBe(false);
  });

  /** The next Play records `frames` idle frames of the level it is given (tainted on request). */
  function recordNextPlay(frames: number, tainted = false): void {
    vi.mocked(createPlaytest).mockImplementationOnce((played) => {
      const scene = { level: documentToLevelData(played), gameData: MMX };
      const recorder = new Recorder(scene);
      for (let i = 0; i < frames; i++) recorder.step(0);
      if (tainted) recorder.markTainted();
      return {
        start: async () => undefined,
        dispose: () => undefined,
        recordedRun: () => ({ replay: recorder.toReplay(), scene }),
        playerMoveset: [],
        enemyKinds: [],
      } as unknown as ReturnType<typeof createPlaytest>;
    });
  }

  it("Stop traces the run as played (a from-here copy) and shows it on the level", async () => {
    const store = new EditorStore(level());
    const { ctl } = controller(store);
    recordNextPlay(120);

    ctl.playFromHere(100, 100);
    await vi.waitFor(() => expect(store.get().mode).toBe("play"));
    store.toggleTrail();
    ctl.stopPlay();
    await vi.waitFor(() => expect(store.get().trail).not.toBeNull());
    // Started from the chosen point (the copy's Spawn at x 96), not the level's Spawn at x 32.
    expect(store.get().trail!.end).toMatchObject({ x: 96 });
    expect(store.get().trailVisible).toBe(true);
    // Another level drops it.
    store.open(createLevelDocument());
    expect(store.get().trail).toBeNull();
  });

  it("does not trace a run tainted by a debug cheat, and clears the last trail", async () => {
    const store = new EditorStore(level());
    const { ctl, toast } = controller(store);
    recordNextPlay(120);
    ctl.togglePlay();
    await vi.waitFor(() => expect(store.get().mode).toBe("play"));
    ctl.stopPlay();
    await vi.waitFor(() => expect(store.get().trail).not.toBeNull());

    // Invulnerability is not in the replay: re-simulated, the run would take hits it ignored.
    recordNextPlay(120, true);
    ctl.togglePlay();
    await vi.waitFor(() => expect(store.get().mode).toBe("play"));
    ctl.stopPlay();
    expect(store.get().trail).toBeNull();
    expect(toast).toHaveBeenCalledWith("Trail unavailable: the run used a debug cheat.");
  });

  it("drops a trace once another document opens, even one with the same level id", async () => {
    const store = new EditorStore(level());
    const { ctl } = controller(store);
    recordNextPlay(600);
    ctl.togglePlay();
    await vi.waitFor(() => expect(store.get().mode).toBe("play"));
    ctl.stopPlay();
    store.open({ ...level(), id: store.get().document.id });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(store.get().trail).toBeNull();
  });

  it("refuses Play from inside a wall with a toast, before loading anything", async () => {
    const store = new EditorStore(level());
    const before = structuredClone(store.get().document);
    const { ctl, getAssets, toast } = controller(store);

    ctl.playFromHere(168, 120);
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/wall/)));
    expect(getAssets).not.toHaveBeenCalled();
    expect(store.get().mode).toBe("edit");
    expect(store.get().document).toEqual(before);
  });
});

describe("EditorPlaytestController Play from here, edited while loading", () => {
  it("builds the copy from the level as it is after the loads", async () => {
    const store = new EditorStore(level());
    const { ctl, getAssets, toast } = controller(store);
    vi.mocked(createPlaytest).mockClear();
    // A wall lands on the chosen point while Play's assets load.
    const walled = level();
    walled.tiles[6 * walled.cols + 6] = TerrainTile.Solid;
    getAssets.mockImplementationOnce(async () => {
      store.open(walled);
      return { catalog: {}, manifest: { playerSheet: "sheet" }, project: { assets: [] } };
    });

    ctl.playFromHere(100, 100);
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/wall/)));
    expect(createPlaytest).not.toHaveBeenCalled();
    expect(store.get().mode).toBe("edit");
  });
});

describe("playHereDocument", () => {
  it("centres and snaps the Spawn like a placed one, on a suffixed copy", () => {
    const doc = level();
    const before = structuredClone(doc);
    const here = playHereDocument(doc, 100, 100, BODY, snap16);
    if (typeof here === "string") throw new Error(here);
    expect(here.id).toBe(`${doc.id}@here`);
    expect(spawnOf(here)).toMatchObject({ id: spawnOf(doc).id, x: 96, y: 96 });
    expect(here.tiles).toEqual(doc.tiles);
    expect(doc).toEqual(before);
  });

  it("refuses a point in a wall or off the level", () => {
    // Centre (160, 112): the player's box overlaps the wall column.
    expect(playHereDocument(level(), 168, 120, BODY, snap16)).toMatch(/wall/);
    // Past the side edges the engine's world is solid too.
    expect(playHereDocument(level(), -40, 100, BODY, snap16)).toMatch(/wall/);
    expect(playHereDocument(level(), 100, -40, BODY, snap16)).toMatch(/inside the level/);
    expect(playHereDocument(level(), 100, 400, BODY, snap16)).toMatch(/inside the level/);
  });

  it("records replays that a normal Play of the level refuses", () => {
    const doc = level();
    const here = playHereDocument(doc, 100, 100, BODY, snap16) as LevelDocument;
    const recorder = new Recorder({ level: documentToLevelData(here), gameData: MMX });
    for (let i = 0; i < 10; i++) recorder.step(0);
    const replay = recorder.toReplay();

    expect(() =>
      new Recorder({ level: documentToLevelData(doc), gameData: MMX }).load(replay),
    ).toThrow(/recorded on level/);
    expect(
      new Recorder({ level: documentToLevelData(here), gameData: MMX }).load(replay).frame,
    ).toBe(10);
  });
});
