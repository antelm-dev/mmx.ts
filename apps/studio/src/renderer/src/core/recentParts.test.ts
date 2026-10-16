import { describe, expect, it } from "vitest";
import {
  MAX_RECENT_PARTS,
  availableParts,
  partName,
  placingLabel,
  placingPart,
  pushRecentPart,
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
