import { afterEach, describe, expect, it } from "vitest";
import { allDefinitions, setCatalogGameData, setProjectDefinitions } from "@mmx/content-schema";
import { GAME_DATA, mergeGameData, type GameDataOverlay } from "@mmx/engine/data";
import { paletteRows } from "./paletteRows.js";
import { MMX_GAME_DATA } from "./mmx.test-support.js";

/** "Header: id, id | Header: id" for comparing a whole palette at a glance. */
const outline = (query = "") =>
  paletteRows(allDefinitions(), query)
    .map((row) => (row.kind === "header" ? `|${row.label}:` : row.def.id))
    .join(" ")
    .slice(1);

const lift: GameDataOverlay = {
  environments: {
    lift: { id: "lift", behavior: "environment.moving-platform", defaults: { travel: 64 } },
  },
  prefabs: {
    "platform.lift": {
      ...MMX_GAME_DATA.prefabs["platform.moving"]!,
      id: "platform.lift",
      source: { kind: "environment", ref: "lift" },
    },
  },
};

describe("paletteRows", () => {
  afterEach(() => {
    setProjectDefinitions([]);
    setCatalogGameData(GAME_DATA);
  });

  it("lists Base first, then the project's data and objects by category", () => {
    const base = GAME_DATA;
    const merged = mergeGameData(base, lift);
    if (!merged.ok) throw new Error(merged.diagnostics.map((d) => d.message).join("; "));
    setCatalogGameData(merged.value, lift);
    setProjectDefinitions([{ id: "obj.spikes", name: "Spikes", base: "hazard" }]);
    expect(outline()).toBe(
      "Base: spawn hazard slope camera-zone |Platforms: platform.lift |Hazards: obj.spikes",
    );
    // Search filters every section and drops the empty ones.
    expect(outline("li")).toBe("Platforms: platform.lift");
    expect(outline("slope")).toBe("Base: slope");
    expect(outline("base")).toBe("Base: spawn hazard slope camera-zone");
    expect(outline("ba")).toBe("Base: spawn hazard slope camera-zone");
    // A single letter only filters by name or category, as before.
    for (const q of ["s", "a"]) {
      const matches = allDefinitions()
        .filter((d) => d.name.toLowerCase().includes(q) || d.category.includes(q))
        .map((d) => d.id);
      const listed = paletteRows(allDefinitions(), q).flatMap((row) =>
        row.kind === "def" ? [row.def.id] : [],
      );
      expect([...listed].sort()).toEqual([...matches].sort());
    }
  });

  it("keeps every built-in in Base for a project without data", () => {
    const rows = paletteRows(allDefinitions(), "");
    expect(rows[0]).toMatchObject({ kind: "header", label: "Base" });
    expect(rows.filter((row) => row.kind === "header")).toHaveLength(1);
    expect(rows).toHaveLength(allDefinitions().length + 1);
  });
});
