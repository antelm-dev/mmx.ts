import { afterEach, describe, expect, it, vi } from "vitest";
import { createLevelDocument } from "@mmx/content-schema";
import { clearRecovery, readRecovery, serializeDocument, writeRecovery } from "./persistence.js";

const V1 = "mmx-studio.recovery.v1";
const V2 = "mmx-studio.recovery.v2";

function stubStorage(entries: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(entries));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  });
  return map;
}

afterEach(() => vi.unstubAllGlobals());

describe("recovery draft", () => {
  const doc = { ...createLevelDocument(), id: "level.main", name: "Main" };

  it("records the project it was written in, and replaces a v1 draft", () => {
    const map = stubStorage({ [V1]: serializeDocument(doc) });
    expect(writeRecovery(doc, "/projects/x")).toBe(true);
    expect(map.has(V1)).toBe(false);
    expect(JSON.parse(map.get(V2)!)).toMatchObject({ rootPath: "/projects/x", document: doc });
    expect(readRecovery()).toEqual({ rootPath: "/projects/x", document: { ...doc } });

    writeRecovery(doc, null);
    expect(readRecovery()?.rootPath).toBeNull();
    clearRecovery();
    expect(readRecovery()).toBeNull();
  });

  it("reads a v1 draft as coming from an unknown project", () => {
    stubStorage({ [V1]: serializeDocument(doc) });
    expect(readRecovery()).toMatchObject({ rootPath: undefined, document: { id: "level.main" } });
  });

  it("treats a malformed origin as unknown", () => {
    stubStorage({ [V2]: JSON.stringify({ rootPath: 42, document: doc }) });
    expect(readRecovery()?.rootPath).toBeUndefined();
  });

  it.each([
    ["not JSON", "{oops"],
    ["null", "null"],
    ["no document", JSON.stringify({ rootPath: "/p" })],
    ["a broken document", JSON.stringify({ rootPath: "/p", document: { id: "x" } })],
  ])("returns null for a corrupt draft (%s)", (_, json) => {
    stubStorage({ [V2]: json });
    expect(readRecovery()).toBeNull();
  });

  it("never throws when storage does", () => {
    const fail = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail });
    expect(writeRecovery(doc, null)).toBe(false);
    expect(readRecovery()).toBeNull();
    expect(() => clearRecovery()).not.toThrow();
  });
});
