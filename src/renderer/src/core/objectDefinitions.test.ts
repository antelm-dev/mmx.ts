import { describe, expect, it } from "vitest";
import { createLevelDocument } from "@mmx/content-schema";
import { deleteBlocker, duplicateObject } from "./objectDefinitions.js";

const fast = { id: "obj.platform.moving.1", name: "Fast", base: "platform.moving", values: { Speed: 120 } };
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
    const placed = { ...doc, objects: [...doc.objects, { ...doc.objects[0]!, id: "o1", definitionId: "enemy.crab" }] };
    const right = { id: "obj.enemy.crab.1", name: "Crab (right)", base: "enemy.crab" };
    expect(deleteBlocker("enemy.crab", [doc, placed], [])).toBe("Used by 1 placed object; delete them first");
    expect(deleteBlocker("enemy.crab", [doc], [right])).toBe("Base of the object Crab (right); delete it first");
    expect(deleteBlocker("enemy.crab", [doc], [fast])).toBeNull();
  });
});
