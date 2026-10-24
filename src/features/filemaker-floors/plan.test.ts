import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import { resolveMachine } from "../../lib/resolve-machine";
import { toFloorMachines } from "../../lib/floor-machines";
import type { Machine } from "../../types";
import type { MachineCatalogEntry, StudioMachineRosterEntry } from "../../types/machines";
import { FILEMAKER_FLOORS, WESTLAKE, WILLOUGHBY, type FilemakerFloor } from "./floors";
import {
  FLOORS_SCRIPT_SIGNATURE,
  planDialSwitch,
  planFloor,
  planRemove,
  sameDoc,
  unitsNotInTable,
  standardIndexes,
  type CatalogDoc,
} from "./plan";

/*
 * The catalog as production held it on Oct 12 2026: each document an id, a
 * name, an order and the dial labels as `settingOptions` (the same labels
 * as the generated definitions), and two (Leg Press, Lumbar) carrying the
 * old safety fields a second unit must keep.
 */
const CATALOG: Record<string, CatalogDoc> = Object.fromEntries(
  Object.values(MACHINE_DEFINITIONS).map((d) => [
    d.id,
    {
      id: d.id,
      name: d.name,
      order: d.defaultOrder,
      settingOptions: d.settingFields.map((f) => f.label),
    },
  ]),
);
CATALOG["m-leg-press"] = {
  ...CATALOG["m-leg-press"],
  primaryMuscles: ["Quadriceps", "Gluteus Maximus"],
  contraindicatedFor: ["Lumbar Issues", "Knee Replacement"],
  biomechanicalNotes: "Knee angle should not exceed 90 degrees.",
  modifications: "For Lumbar issues: lock the seat angle.",
};

const unit = (floor: FilemakerFloor, fm: string, dials: "standard" | "filemaker" = "standard") => {
  const u = planFloor(floor, CATALOG, dials).units.find((x) => x.fm === fm);
  if (!u) throw new Error(`no ${fm}`);
  return u;
};

const hasUndefined = (v: unknown): boolean =>
  v === undefined ||
  (Array.isArray(v) ? v.some(hasUndefined) : !!v && typeof v === "object" && Object.values(v).some(hasUndefined));

describe("the two floors as read from FileMaker", () => {
  it("westlake has 35 units and Willoughby 27, each name once, every movement one of the twenty", () => {
    expect(WESTLAKE.units).toHaveLength(35);
    expect(WILLOUGHBY.units).toHaveLength(27);
    for (const floor of FILEMAKER_FLOORS) {
      const names = floor.units.map((u) => u.fm.toLowerCase());
      expect(new Set(names).size, floor.key).toBe(names.length);
      for (const u of floor.units) {
        if (u.movement) expect(MACHINE_DEFINITIONS[u.movement], `${floor.key} ${u.fm}`).toBeTruthy();
        expect(u.fm.trim(), "no stray spaces").toBe(u.fm);
      }
    }
  });

  it("neither studio has a Tricep Extension, and each has its own machines with no movement", () => {
    for (const floor of FILEMAKER_FLOORS) expect(floor.units.some((u) => u.movement === "m-tricep-ext")).toBe(false);
    expect(WESTLAKE.units.filter((u) => !u.movement).map((u) => u.fm)).toEqual(["Calf"]);
    expect(WILLOUGHBY.units.filter((u) => !u.movement).map((u) => u.fm)).toEqual(["Calf Raises", "Shoulder Extensions"]);
  });

  it("plans both floors with no problem against the catalog", () => {
    for (const floor of FILEMAKER_FLOORS) {
      for (const dials of ["standard", "filemaker"] as const) {
        expect(planFloor(floor, CATALOG, dials).problems, `${floor.key} ${dials}`).toEqual([]);
      }
    }
  });

  it("says so when the catalog lacks a movement, and writes nothing that pretends otherwise", () => {
    const { ["m-leg-press"]: _gone, ...without } = CATALOG;
    expect(planFloor(WESTLAKE, without, "standard").problems).toContain("Leg Press SSS: the catalog has no m-leg-press");
  });
});

describe("which unit follows the standard (AJ: the Imagine Strength one, else the first)", () => {
  it("picks the Imagine Strength unit even when it comes second", () => {
    const idx = standardIndexes(WILLOUGHBY.units);
    expect(WILLOUGHBY.units[idx.get("m-leg-press")!].fm).toBe("Leg Press Imag.");
    expect(WILLOUGHBY.units[idx.get("m-pulldown")!].fm).toBe("Pulldown Imag.");
    expect(WILLOUGHBY.units[idx.get("m-chest-press")!].fm).toBe("Chest Press Imagine");
    expect(WILLOUGHBY.units[idx.get("m-compound-row")!].fm).toBe("Compound Row Imagine");
    expect(WILLOUGHBY.units[idx.get("m-overhead-press")!].fm).toBe("Overhead Imag.");
    expect(WILLOUGHBY.units[idx.get("m-abs")!].fm).toBe("Abs Imagine");
  });

  it("picks the first in FileMaker's order where no unit is Imagine Strength", () => {
    const idx = standardIndexes(WESTLAKE.units);
    expect(WESTLAKE.units[idx.get("m-leg-press")!].fm).toBe("Leg Press SSS");
    expect(WESTLAKE.units[idx.get("m-compound-row")!].fm).toBe("CR SSS");
    expect(WESTLAKE.units[idx.get("m-chest-press")!].fm).toBe("Chest Press IS");
    expect(WESTLAKE.units[idx.get("m-abs")!].fm).toBe("Ab MX");
  });

  it("gives westlake 19 standard units, 15 second units and 1 own machine; Willoughby 19, 6 and 2", () => {
    const count = (floor: FilemakerFloor) => {
      const kinds = planFloor(floor, CATALOG, "standard").units.map((u) => u.kind);
      return { standard: kinds.filter((k) => k === "standard").length, second: kinds.filter((k) => k === "second").length, own: kinds.filter((k) => k === "own").length };
    };
    expect(count(WESTLAKE)).toEqual({ standard: 19, second: 15, own: 1 });
    expect(count(WILLOUGHBY)).toEqual({ standard: 19, second: 6, own: 2 });
  });
});

describe("the documents", () => {
  it("orders every unit by FileMaker's row, ids unique, signed by the script, nothing undefined", () => {
    for (const floor of FILEMAKER_FLOORS) {
      const plan = planFloor(floor, CATALOG, "filemaker");
      expect(plan.units.map((u) => u.order)).toEqual(floor.units.map((_, i) => i + 1));
      expect(new Set(plan.units.map((u) => u.id)).size).toBe(plan.units.length);
      for (const u of plan.units) {
        expect(u.doc.machineId).toBe(u.id);
        expect(u.doc.studioId).toBe(floor.studioId);
        expect(u.doc.status).toBe("active");
        expect(u.doc.updatedBy).toBe(FLOORS_SCRIPT_SIGNATURE);
        expect(hasUndefined(u.doc), `${floor.key} ${u.fm}`).toBe(false);
      }
    }
  });

  it("a standard unit is a catalog copy at the movement's own id carrying only its floor name", () => {
    const u = unit(WESTLAKE, "Leg Press SSS");
    expect(u.id).toBe("m-leg-press");
    expect(u.doc).toMatchObject({ source: "catalog", basedOn: "m-leg-press", overrides: { name: "Leg Press SSS" } });
    expect(u.doc.overrides).toEqual({ name: "Leg Press SSS" });
    expect(u.doc).not.toHaveProperty("modelId");
  });

  it("an Imagine Strength unit names its model; nothing else does", () => {
    expect(unit(WESTLAKE, "Chest Press IS").doc.modelId).toBe("mm-imagine-strength-is2023-chest-press");
    expect(unit(WILLOUGHBY, "Leg Press Imag.").doc.modelId).toBe("mm-imagine-strength-is2019-leg-press");
    expect(unit(WILLOUGHBY, "Abs Imagine").doc.modelId).toBe("mm-imagine-strength-is2018f-seated-abdominal");
    expect(unit(WILLOUGHBY, "Rowing Back").doc).not.toHaveProperty("modelId");
    const named = FILEMAKER_FLOORS.flatMap((f) => planFloor(f, CATALOG, "standard").units).filter((u) => u.modelId);
    expect(named.map((u) => u.fm)).toEqual([
      "Chest Press IS",
      "Leg Press Imag.",
      "Pulldown Imag.",
      "Chest Press Imagine",
      "Compound Row Imagine",
      "Overhead Imag.",
      "Abs Imagine",
    ]);
  });

  it("a second unit is the studio's own machine based on the movement, its id from its name", () => {
    const u = unit(WESTLAKE, "Leg Press NT");
    expect(u.id).toBe("sm-A4uvDltWoJuCas0hqEkG-leg-press-nt");
    expect(u.doc).toMatchObject({ source: "custom", basedOn: "m-leg-press" });
    expect(unit(WILLOUGHBY, "Comp. Row Hoist").id).toBe("sm-1WV88AvJKRpgypnmmO1N-comp-row-hoist");
    expect(unit(WESTLAKE, "CR A90").id).toBe("sm-A4uvDltWoJuCas0hqEkG-cr-a90");
  });

  it("a second unit keeps the movement's safety words, copied, and none of the document's bookkeeping", () => {
    const def = unit(WESTLAKE, "Leg Press MX").doc.definition as Record<string, unknown>;
    expect(def.name).toBe("Leg Press MX");
    expect(def.contraindicatedFor).toEqual(["Lumbar Issues", "Knee Replacement"]);
    expect(def.primaryMuscles).toEqual(["Quadriceps", "Gluteus Maximus"]);
    expect(def.biomechanicalNotes).toBe("Knee angle should not exceed 90 degrees.");
    for (const k of ["id", "order", "settingOptions", "modifications", "modelId"]) expect(def, k).not.toHaveProperty(k);
    expect(def.defaultSettings).toEqual({});
  });

  it("a second unit invents nothing the document doesn't hold (no blank-machine defaults over the knowledge base)", () => {
    for (const floor of FILEMAKER_FLOORS) {
      for (const u of planFloor(floor, CATALOG, "filemaker").units.filter((x) => x.kind === "second")) {
        const def = u.doc.definition as Record<string, unknown>;
        const held = new Set([...Object.keys(CATALOG[u.movement!]), "settingFields", "defaultSettings"]);
        for (const k of Object.keys(def)) expect(held.has(k), `${u.fm}: ${k}`).toBe(true);
        for (const k of ["execution", "kinematicClass", "anatomicalRegion", "movementPattern", "preferredView"]) {
          expect(def, `${u.fm}: ${k}`).not.toHaveProperty(k);
        }
      }
    }
    const own = unit(WILLOUGHBY, "Calf Raises").doc.definition;
    expect(Object.keys(own as object).sort()).toEqual(["defaultSettings", "name", "settingFields"]);
  });

  it("a studio's own machine has no lineage, its name and FileMaker's dials only", () => {
    const u = unit(WESTLAKE, "Calf");
    expect(u.id).toBe("sm-A4uvDltWoJuCas0hqEkG-calf");
    expect(u.doc).not.toHaveProperty("basedOn");
    expect(u.doc.source).toBe("custom");
    const def = u.doc.definition as { name: string; settingFields: { label: string }[] };
    expect(def.name).toBe("Calf");
    expect(def.settingFields.map((f) => f.label)).toEqual(["SH", "LT"]);
  });
});

describe("the dials, both sets (AJ: decide later, build both)", () => {
  it("standard: a copy keeps the catalog's, a second unit takes the movement's, an own machine FileMaker's", () => {
    expect(unit(WESTLAKE, "Leg Press SSS").doc.overrides).toEqual({ name: "Leg Press SSS" });
    const second = unit(WESTLAKE, "Leg Press NT").doc.definition as { settingFields: { key: string; label: string }[] };
    expect(second.settingFields.map((f) => f.label)).toEqual(["Gap", "Back Pad", "Shoulder Pads", "Seat"]);
    expect(second.settingFields.map((f) => f.key)).toEqual(["gap", "back-pad", "shoulder-pads", "seat"]);
    expect(unit(WESTLAKE, "Calf").standardDials).toEqual(["SH", "LT"]);
  });

  it("filemaker: every unit takes FileMaker's letters, keyed by their slug", () => {
    const copy = unit(WESTLAKE, "Leg Press SSS", "filemaker").doc.overrides as { settingFields: { key: string; label: string; type: string }[] };
    expect(copy.settingFields.map((f) => f.label)).toEqual(["SH", "UT", "LT", "HP", "P", "F"]);
    expect(copy.settingFields[0]).toEqual({ key: "sh", label: "SH", type: "text" });
    const second = unit(WILLOUGHBY, "Chest Press Hoist", "filemaker").doc.definition as { settingFields: { key: string }[] };
    expect(second.settingFields.map((f) => f.key)).toEqual(["s", "blocks", "neutral"]);
  });

  it("a unit FileMaker shows no dials for: a copy keeps the standard's, a second unit has none", () => {
    expect(unit(WILLOUGHBY, "Ab Hoist", "filemaker").filemakerDials).toEqual([]);
    const floor: FilemakerFloor = { ...WILLOUGHBY, units: [{ fm: "Ab Hoist", movement: "m-abs", dials: [] }] };
    const copy = planFloor(floor, CATALOG, "filemaker").units[0];
    expect(copy.kind).toBe("standard");
    expect(copy.doc.overrides).toEqual({ name: "Ab Hoist" });
    expect(copy.filemakerDials).toEqual(["Gap", "Seat"]);
  });
});

describe("what a trainer's screens would show (resolveMachine, then the session's floor list)", () => {
  const legacyById: Record<string, Machine> = Object.fromEntries(
    Object.values(CATALOG).map((d) => [d.id as string, { id: d.id, name: d.name, settingOptions: d.settingOptions } as unknown as Machine]),
  );
  const floorOf = (floor: FilemakerFloor, dials: "standard" | "filemaker") => {
    const resolved = planFloor(floor, CATALOG, dials).units.map((u) => {
      const entry = { ...u.doc } as unknown as StudioMachineRosterEntry;
      const catalog = u.movement ? ({ ...CATALOG[u.movement], status: "active", defaultOrder: 1, inStandardSet: true } as unknown as MachineCatalogEntry) : undefined;
      const r = resolveMachine(entry, entry.source === "catalog" ? catalog : undefined);
      if (!r) throw new Error(`${u.fm} did not resolve`);
      return r;
    });
    return toFloorMachines(resolved.sort((a, b) => a.order - b.order), legacyById);
  };

  it("every unit resolves, under FileMaker's name, in FileMaker's order, rolling up to its movement", () => {
    for (const floor of FILEMAKER_FLOORS) {
      const list = floorOf(floor, "standard");
      expect(list.map((m) => m.name)).toEqual(floor.units.map((u) => u.fm));
      list.forEach((m, i) => {
        const movement = floor.units[i].movement;
        expect((m as { comparisonKey?: string }).comparisonKey, floor.units[i].fm).toBe(movement ?? m.id);
      });
    }
  });

  it("standard: the session shows the standard's dials on every MSF unit", () => {
    const list = floorOf(WESTLAKE, "standard");
    const at = (name: string) => list.find((m) => m.name === name)!;
    expect(at("Leg Press SSS").settingOptions).toEqual(["Gap", "Back Pad", "Shoulder Pads", "Seat"]);
    expect(at("Leg Press NT").settingOptions).toEqual(["Gap", "Back Pad", "Shoulder Pads", "Seat"]);
    expect(at("Calf").settingOptions).toEqual(["SH", "LT"]);
  });

  it("filemaker: the session shows FileMaker's letters", () => {
    const list = floorOf(WILLOUGHBY, "filemaker");
    const at = (name: string) => list.find((m) => m.name === name)!;
    expect(at("Leg Press Imag.").settingOptions).toEqual(["G", "S"]);
    expect(at("Leg Press Nt").settingOptions).toEqual(["B", "S", "Prefer"]);
    expect(at("Ab Hoist").settingOptions ?? []).toEqual([]);
    expect(at("Abs Imagine").settingOptions).toEqual(["S", "G", "Blocks"]);
  });
});

describe("switching the dials on a floor the script built", () => {
  const built = (floor: FilemakerFloor, dials: "standard" | "filemaker") =>
    Object.fromEntries(planFloor(floor, CATALOG, dials).units.map((u) => [u.id, u.doc as Record<string, unknown>]));

  it("standard → filemaker changes only the dials, and a unit already right is left alone", () => {
    const plan = planDialSwitch(WILLOUGHBY, CATALOG, built(WILLOUGHBY, "standard"), "filemaker");
    expect(plan.skipped).toEqual([]);
    const byFm = Object.fromEntries(plan.updates.map((u) => [u.fm, u.fields]));
    expect(byFm["Leg Press Imag."]).toEqual({ "overrides.settingFields": [{ key: "g", label: "G", type: "text" }, { key: "s", label: "S", type: "text" }] });
    expect(byFm["Leg Press Nt"]).toEqual({
      "definition.settingFields": [
        { key: "b", label: "B", type: "text" },
        { key: "s", label: "S", type: "text" },
        { key: "prefer", label: "Prefer", type: "text" },
      ],
      "definition.defaultSettings": {},
    });
    // Own machines are FileMaker's either way.
    expect(plan.unchanged).toContain("sm-1WV88AvJKRpgypnmmO1N-calf-raises");
    for (const u of plan.updates) for (const k of Object.keys(u.fields)) expect(k).toMatch(/settingFields|defaultSettings/);
  });

  it("filemaker → standard deletes a copy's own dials and gives a second unit the movement's", () => {
    const plan = planDialSwitch(WESTLAKE, CATALOG, built(WESTLAKE, "filemaker"), "standard");
    const byFm = Object.fromEntries(plan.updates.map((u) => [u.fm, u.fields]));
    expect(byFm["Leg Press SSS"]).toEqual({ "overrides.settingFields": null });
    expect((byFm["Leg Press NT"]["definition.settingFields"] as { label: string }[]).map((f) => f.label)).toEqual([
      "Gap",
      "Back Pad",
      "Shoulder Pads",
      "Seat",
    ]);
  });

  it("a switch to the set already there changes nothing", () => {
    for (const dials of ["standard", "filemaker"] as const) {
      const plan = planDialSwitch(WESTLAKE, CATALOG, built(WESTLAKE, dials), dials);
      expect(plan.updates, dials).toEqual([]);
      expect(plan.skipped, dials).toEqual([]);
    }
  });

  it("never touches a unit a person has saved since, or one that is not there, and names it", () => {
    const roster = built(WESTLAKE, "standard");
    roster["m-leg-press"] = { ...roster["m-leg-press"], updatedBy: "uid-of-a-leader" };
    delete roster["sm-A4uvDltWoJuCas0hqEkG-calf"];
    const plan = planDialSwitch(WESTLAKE, CATALOG, roster, "filemaker");
    expect(plan.updates.map((u) => u.id)).not.toContain("m-leg-press");
    // In FileMaker's order: Calf is row 8, Leg Press SSS row 9.
    expect(plan.skipped).toEqual([
      { id: "sm-A4uvDltWoJuCas0hqEkG-calf", fm: "Calf", why: "not on the floor" },
      { id: "m-leg-press", fm: "Leg Press SSS", why: "saved by a person since the script wrote it" },
    ]);
  });
});

describe("the way back: --remove deletes only what is exactly as the script wrote it", () => {
  const built = (dials: "standard" | "filemaker"): Record<string, Record<string, unknown>> =>
    Object.fromEntries(planFloor(WESTLAKE, CATALOG, dials).units.map((u) => [u.id, { ...u.doc, updatedAt: { seconds: 1 } }]));

  it("removes every unit of a floor nobody has touched, with either set of dials", () => {
    for (const dials of ["standard", "filemaker"] as const) {
      const plan = planRemove(WESTLAKE, CATALOG, built(dials));
      expect(plan.remove, dials).toHaveLength(35);
      expect(plan.kept, dials).toEqual([]);
    }
  });

  it("keeps a unit changed by a write that leaves updatedBy alone (a size, a model), and one a person saved", () => {
    const roster = built("standard");
    roster["m-leg-press"] = { ...roster["m-leg-press"], unit: { size: { lengthMm: 2000, widthMm: 1200, by: "uid-x", at: 1 } } };
    roster["sm-A4uvDltWoJuCas0hqEkG-leg-press-nt"] = { ...roster["sm-A4uvDltWoJuCas0hqEkG-leg-press-nt"], modelId: "mm-some-model" };
    roster["m-pulldown"] = { ...roster["m-pulldown"], updatedBy: "uid-of-a-leader" };
    const plan = planRemove(WESTLAKE, CATALOG, roster);
    expect(plan.kept.map((k) => k.fm)).toEqual(["Leg Press SSS", "Leg Press NT", "Pulldown SSS"]);
    expect(plan.remove).toHaveLength(32);
  });

  it("names, and never touches, a unit the script wrote that the table no longer lists", () => {
    const roster = built("standard");
    roster["sm-A4uvDltWoJuCas0hqEkG-old-name"] = { updatedBy: FLOORS_SCRIPT_SIGNATURE, source: "custom" };
    roster["sm-A4uvDltWoJuCas0hqEkG-a-leaders"] = { updatedBy: "uid-x", source: "custom" };
    expect(planRemove(WESTLAKE, CATALOG, roster).notInTable).toEqual(["sm-A4uvDltWoJuCas0hqEkG-old-name"]);
    expect(unitsNotInTable(WESTLAKE, CATALOG, roster)).toEqual(["sm-A4uvDltWoJuCas0hqEkG-old-name"]);
  });

  it("sameDoc ignores key order and the server time, nothing else", () => {
    expect(sameDoc({ a: 1, b: { c: [1, 2] }, updatedAt: 5 }, { b: { c: [1, 2] }, a: 1, updatedAt: 9 })).toBe(true);
    expect(sameDoc({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [2, 1] } })).toBe(false);
    expect(sameDoc({ a: 1 }, { a: 1, extra: null })).toBe(false);
  });
});
