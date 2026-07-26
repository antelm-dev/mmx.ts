import { describe, expect, it } from "vitest";
import type { ActorSnapshot } from "@mmx/editor-runtime";
import { fmtAbilities, fmtHealth, fmtNumber, fmtPosition, fmtVec } from "./format.js";

const actor = (over: Partial<ActorSnapshot> = {}): ActorSnapshot => ({
  runtimeId: "player",
  kind: "player",
  bounds: { x: 10, y: 20, w: 12, h: 24 },
  velocity: { x: 0, y: 0 },
  state: "-",
  abilities: [],
  ...over,
});

describe("runtime inspector formatting", () => {
  it("keeps whole numbers whole and rounds fractions to two places", () => {
    expect(fmtNumber(5)).toBe("5");
    expect(fmtNumber(-3)).toBe("-3");
    expect(fmtNumber(1.23456)).toBe("1.23");
  });

  it("formats a vector as its two components", () => {
    expect(fmtVec({ x: 1.5, y: -2 })).toBe("1.50, -2");
  });

  it("reports the centre of an actor's bounds as its position", () => {
    expect(fmtPosition(actor())).toBe("16, 32");
  });

  it("renders missing health as an em dash", () => {
    expect(fmtHealth(undefined, undefined)).toBe("—");
  });

  it("renders health with and without a maximum", () => {
    expect(fmtHealth(24, 32)).toBe("24 / 32");
    expect(fmtHealth(24, undefined)).toBe("24");
  });

  it("renders an idle actor's abilities as an em dash", () => {
    expect(fmtAbilities([])).toBe("—");
    expect(fmtAbilities(["Walk", "Shot"])).toBe("Walk, Shot");
  });
});
