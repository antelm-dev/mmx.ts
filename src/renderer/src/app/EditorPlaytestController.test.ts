import { describe, expect, it, vi } from "vitest";
import { createLevelDocument } from "@mmx/content-schema";
import { EditorStore } from "../core/EditorStore.js";
import { EditorPlaytestController, type PlaytestCallbacks } from "./EditorPlaytestController.js";

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
});
