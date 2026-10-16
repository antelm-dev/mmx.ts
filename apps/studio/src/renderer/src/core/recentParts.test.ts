import { describe, expect, it } from "vitest";
import { createLevelDocument } from "@mmx/content-schema";
import { EditorStore } from "./EditorStore.js";
import {
  MAX_RECENT_PARTS,
  availableParts,
  partName,
  placingLabel,
  placingPart,
  pushRecentPart,
  trackRecentParts,
  type RecentPart,
} from "./recentParts.js";

const obj = (id: string) => ({ kind: "object" as const, id });
const deco = (id: string) => ({ kind: "decoration" as const, id });

describe("pushRecentPart", () => {
  it("puts the newest part first and moves a repeat to the front", () => {
    let list = pushRecentPart([], obj("a"));
    list = pushRecentPart(list, deco("b"));
    list = pushRecentPart(list, obj("a"));
    expect(list).toEqual([obj("a"), deco("b")]);
  });

  it("tells an object from a decoration with the same id", () => {
    expect(pushRecentPart([obj("x")], deco("x"))).toEqual([deco("x"), obj("x")]);
  });

  it("keeps the list when the part already leads", () => {
    const list = [obj("a"), obj("b")];
    expect(pushRecentPart(list, obj("a"))).toBe(list);
  });

  it(`keeps at most ${MAX_RECENT_PARTS}, dropping the oldest`, () => {
    let list = pushRecentPart([], obj("p0"));
    for (let i = 1; i <= MAX_RECENT_PARTS; i++) list = pushRecentPart(list, obj(`p${i}`));
    expect(list).toHaveLength(MAX_RECENT_PARTS);
    expect(list[0]).toEqual(obj(`p${MAX_RECENT_PARTS}`));
    expect(list).not.toContainEqual(obj("p0"));
  });
});

describe("partName", () => {
  it("names known parts and leaves out missing ones", () => {
    expect(partName(obj("enemy.metool"))).toBe("Metool");
    expect(partName(deco("bg.cloud"))).toBe("Soft Cloud");
    expect(partName(obj("obj.gone"))).toBeUndefined();
    expect(partName(deco("obj.gone"))).toBeUndefined();
    expect(availableParts([obj("obj.gone"), obj("enemy.metool")])).toEqual([obj("enemy.metool")]);
  });
});

describe("placingPart", () => {
  it("reads the place tools only", () => {
    expect(placingPart({ activeTool: "place", placingDefinitionId: "spawn" })).toEqual(
      obj("spawn"),
    );
    expect(placingPart({ activeTool: "placeDecoration", placingAssetId: "bg.cloud" })).toEqual(
      deco("bg.cloud"),
    );
    expect(placingPart({ activeTool: "select" })).toBeUndefined();
    expect(placingLabel({ activeTool: "place", placingDefinitionId: "enemy.metool" })).toBe(
      "Place: Metool",
    );
  });
});

describe("trackRecentParts", () => {
  it("records tools picked elsewhere; a pick from the bar keeps the bar's order", () => {
    const store = new EditorStore(createLevelDocument());
    let list: RecentPart[] = [];
    const pickFromBar = trackRecentParts(store, (part) => (list = pushRecentPart(list, part)));
    store.setTool("place", "enemy.metool");
    store.setTool("placeDecoration", "bg.cloud");
    store.setTool("select");
    expect(list).toEqual([deco("bg.cloud"), obj("enemy.metool")]);

    // Slot 2 twice stays slot 2: the tool changes, the order does not.
    pickFromBar(list[1]!);
    expect(store.get()).toMatchObject({ activeTool: "place", placingDefinitionId: "enemy.metool" });
    pickFromBar(list[1]!);
    // Other "ui" emissions (grid, save) while that part is active do not bump it either.
    store.toggleGrid();
    store.markSaved();
    expect(list).toEqual([deco("bg.cloud"), obj("enemy.metool")]);

    // Later picks from the palette or wheel still reorder it.
    store.setTool("placeDecoration", "bg.cloud");
    store.setTool("place", "enemy.metool");
    expect(list).toEqual([obj("enemy.metool"), deco("bg.cloud")]);

    // Leaving the place tool and picking the same part again from the palette bumps it.
    pickFromBar(list[1]!);
    store.setTool("select");
    store.setTool("placeDecoration", "bg.cloud");
    expect(list).toEqual([deco("bg.cloud"), obj("enemy.metool")]);
  });
});
