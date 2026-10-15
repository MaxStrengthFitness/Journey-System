/**
 * The Hoist leg press's lineage fix (Oct 15 2026): scripts/fix-hoist-lineage.ts
 * decides through scripts/lib/fix-hoist-lineage-core.ts, and this holds that
 * decision. The document below is Strongsville's Hoist as production held it
 * on Oct 15 2026, the fields that matter here.
 */
import { describe, expect, it } from "vitest";
import {
  FIX_SIGNATURE,
  applyChanges,
  planHoistLineage,
  updateOf,
  watchOutCount,
} from "../../scripts/lib/fix-hoist-lineage-core";

const READ_OCT_15 = (): Record<string, unknown> => ({
  machineId: "sm-BVDDRe5AqQZFihRLW0vK-hoist-leg-press",
  studioId: "BVDDRe5AqQZFihRLW0vK",
  source: "custom",
  status: "active",
  definition: {
    name: "Hoist leg press ",
    anatomicalRegion: "Hamstring / Glute",
    movementPattern: "Upper Body: Horizontal Push",
    kinematicClass: "compound-linear",
    primaryMuscles: ["glutes", "quads", "hamstrings"],
    secondaryMuscles: [],
    synergistMuscles: [],
    settingFields: [],
    defaultSettings: {},
    clinicalNote: "",
  },
});

describe("the Hoist's lineage fix", () => {
  it("sets the Leg Press as its lineage and corrects the pattern, leaving the region", () => {
    const plan = planHoistLineage(READ_OCT_15(), "fix");
    expect(plan).toEqual({
      ok: true,
      changes: [
        { field: "basedOn", from: null, to: "m-leg-press" },
        { field: "definition.movementPattern", from: "Upper Body: Horizontal Push", to: "Lower Body: Quad Dominant" },
      ],
      reason: null,
    });
    const update = updateOf(plan.changes, { now: "NOW", remove: "DELETE" });
    expect(update).toEqual({
      basedOn: "m-leg-press",
      "definition.movementPattern": "Lower Body: Quad Dominant",
      updatedAt: "NOW",
      updatedBy: FIX_SIGNATURE,
    });
    // Dotted paths only: nothing else in the definition is written.
    expect(Object.keys(update).some((k) => k === "definition" || k.includes("anatomicalRegion"))).toBe(false);
  });

  it("gives the floor the standard Leg Press's eight watch-outs, from none", () => {
    const doc = READ_OCT_15();
    const plan = planHoistLineage(doc, "fix");
    expect(watchOutCount(doc)).toBe(0);
    expect(watchOutCount(applyChanges(doc, plan.changes))).toBe(8);
  });

  it("does nothing a second time, and a half-done fix finishes", () => {
    const fixed = applyChanges(READ_OCT_15(), planHoistLineage(READ_OCT_15(), "fix").changes);
    expect(planHoistLineage(fixed, "fix")).toEqual({ ok: true, changes: [], reason: null });
    const half = { ...READ_OCT_15(), basedOn: "m-leg-press" };
    expect(planHoistLineage(half, "fix")).toEqual({
      ok: true,
      changes: [{ field: "definition.movementPattern", from: "Upper Body: Horizontal Push", to: "Lower Body: Quad Dominant" }],
      reason: null,
    });
  });

  it("refuses over a person's newer edit, another lineage, or the wrong machine", () => {
    expect(planHoistLineage({ ...READ_OCT_15(), basedOn: "m-leg-curl" }, "fix").ok).toBe(false);
    const repatterned = READ_OCT_15();
    (repatterned.definition as Record<string, unknown>).movementPattern = "Lower Body: Hip Dominant";
    expect(planHoistLineage(repatterned, "fix").ok).toBe(false);
    const defLineage = READ_OCT_15();
    (defLineage.definition as Record<string, unknown>).basedOn = "m-leg-press";
    expect(planHoistLineage(defLineage, "fix").ok).toBe(false);
    expect(planHoistLineage({ ...READ_OCT_15(), source: "catalog" }, "fix").ok).toBe(false);
    const renamed = READ_OCT_15();
    (renamed.definition as Record<string, unknown>).name = "Rear Delt Hoist";
    expect(planHoistLineage(renamed, "fix").ok).toBe(false);
    expect(planHoistLineage(null, "fix").ok).toBe(false);
  });

  it("reverts what the fix wrote, deleting the lineage, and only that", () => {
    const fixed = applyChanges(READ_OCT_15(), planHoistLineage(READ_OCT_15(), "fix").changes);
    const plan = planHoistLineage(fixed, "revert");
    expect(plan).toEqual({
      ok: true,
      changes: [
        { field: "basedOn", from: "m-leg-press", to: null },
        { field: "definition.movementPattern", from: "Lower Body: Quad Dominant", to: "Upper Body: Horizontal Push" },
      ],
      reason: null,
    });
    expect(updateOf(plan.changes, { now: "NOW", remove: "DELETE" }).basedOn).toBe("DELETE");
    expect(planHoistLineage(READ_OCT_15(), "revert")).toEqual({ ok: true, changes: [], reason: null });
  });
});
