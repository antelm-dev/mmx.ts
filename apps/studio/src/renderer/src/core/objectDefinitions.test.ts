import { describe, expect, it } from "vitest";
import { OBJECT_DEFINITIONS, createLevelDocument, getDefinition } from "@mmx/content-schema";
import { addObject, deleteBlocker, duplicateObject, newObjectBases } from "./objectDefinitions.js";

const fast = {
  id: "obj.platform.moving.1",
  name: "Fast",
  base: "platform.moving",
  values: { Speed: 120 },
};
const slow = { id: "obj.platform.moving.2", name: "Slow", base: "platform.moving" };

describe("project object definitions", () => {
  it("duplicates an object under a unique id, right after it, keeping its values", () => {
    const once = duplicateObject([fast, slow], fast.id);
    expect(once.map((o) => o.id)).toEqual([fast.id, "obj.platform.moving.3", slow.id]);
    expect(once[1]).toEqual({ ...fast, id: "obj.platform.moving.3", name: "Fast copy" });
    const twice = duplicateObject(once, fast.id);
    expect(new Set(twice.map((o) => o.id)).size).toBe(4);
  });

  it("blocks deleting a definition while an instance or a project object uses it", () => {
    const doc = createLevelDocument();
    const placed = {
      ...doc,
      objects: [...doc.objects, { ...doc.objects[0]!, id: "o1", definitionId: "enemy.crab" }],
    };
    const right = { id: "obj.enemy.crab.1", name: "Crab (right)", base: "enemy.crab" };
    expect(deleteBlocker("enemy.crab", [doc, placed], [])).toBe(
      "Used by 1 placed object; delete them first",
    );
    expect(deleteBlocker("enemy.crab", [doc], [right])).toBe(
      "Base of the object Crab (right); delete it first",
    );
    expect(deleteBlocker("enemy.crab", [doc], [fast])).toBeNull();
  });

  it("offers every category with a built-in base but spawn and unknown", () => {
    const project = {
      ...getDefinition("platform.moving")!,
      id: "obj.fast",
      baseId: "platform.moving",
    };
    const offered = newObjectBases([...OBJECT_DEFINITIONS, project]);
    const categories = offered.map((c) => c.category);
    expect(categories).not.toContain("spawn");
    expect(categories).not.toContain("unknown");
    expect(categories).toEqual(expect.arrayContaining(["enemy", "pickup", "platform", "camera"]));
    // Project objects are no base: only built-ins are.
    const platforms = offered.find((c) => c.category === "platform")!.bases.map((d) => d.id);
    expect(platforms).toEqual(["platform.moving", "platform.falling"]);
  });

  it("adds an object under a free id with its values, exposing all by default", () => {
    const base = getDefinition("platform.moving")!;
    const values = { Travel: 64, Speed: 90, Axis: "vertical" };
    const keys = base.properties.map((p) => p.key);
    const all = addObject([fast], base, " Quick ", values, keys);
    expect(all.id).toBe("obj.platform.moving.2");
    expect(all.objects[1]).toEqual({ id: all.id, name: "Quick", base: base.id, values });
    const some = addObject(all.objects, base, "Fixed", values, ["Speed"]);
    expect(some.id).toBe("obj.platform.moving.3");
    expect(some.objects[2]!.exposed).toEqual(["Speed"]);
    // A base with no property gets no values.
    const pickup = OBJECT_DEFINITIONS.find((d) => d.category === "pickup")!;
    expect(addObject([], pickup, "Big", {}, []).objects[0]).toEqual({
      id: `obj.${pickup.id}.1`,
      name: "Big",
      base: pickup.id,
    });
  });
});
