import { describe, expect, it } from "vitest";
import { modelsReadOf } from "../catalog/models";
import { IMAGINE_STRENGTH_MODELS, seedModelDocument } from "./imagine-strength";
import { planProblems, readPlan } from "./layout";
import { newPlanned, plannedId, plannedLabel, plannedSizeOf, plannedSizeWords, stillToBuyWords, swapCandidates } from "./planned";

const IS = modelsReadOf(IMAGINE_STRENGTH_MODELS.map((r) => ({ id: r.id, data: seedModelDocument(r) })));
const ABD = IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === "m-hip-abd")!;
const LP = IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === "m-leg-press")!;
const at = { x: 3000, y: 4000 };

describe("newPlanned", () => {
  it("is a pm- id at the spot, turned 0, and a draft can store it", () => {
    const p = newPlanned({ movementId: "m-hip-abd", modelId: ABD.id, label: "  IS2027W  Hip Abductor ", typed: null, at });
    expect(p).toMatchObject({ kind: "planned", label: "IS2027W Hip Abductor", movementId: "m-hip-abd", modelId: ABD.id, x: 3000, y: 4000, rotationDeg: 0 });
    expect(p.id).toMatch(/^pm-[a-z0-9]+$/);
    expect("lengthMm" in p).toBe(false);
    const doc = { v: 1, name: "Remodel 1", room: { boxes: [{ id: "bx-1", x: 0, y: 0, w: 9000, h: 9000 }], places: [] }, placements: [p], rev: 1 };
    expect(planProblems(doc, { planId: "d-1" })).toEqual([]);
    expect(readPlan(doc, { planId: "d-1" })!.plan.placements).toEqual([p]);
    expect(planProblems(doc, { planId: "current" })).toContain("A machine still to buy goes on a draft, not the layout.");
  });

  it("keeps typed lengths only with no model, both in range", () => {
    const typed = { lengthMm: 1500, widthMm: 1200, heightMm: null };
    expect(newPlanned({ movementId: null, modelId: null, label: "Sled", typed, at })).toMatchObject({ lengthMm: 1500, widthMm: 1200 });
    expect("lengthMm" in newPlanned({ movementId: "m-hip-abd", modelId: ABD.id, label: "x", typed, at })).toBe(false);
    expect("lengthMm" in newPlanned({ movementId: null, modelId: null, label: "x", typed: { lengthMm: 100, widthMm: 1200, heightMm: null }, at })).toBe(false);
  });

  it("gives different ids", () => {
    expect(plannedId(1000, 0.1)).not.toBe(plannedId(1000, 0.2));
    expect(plannedId(1_800_000_000_000, 0.999).length).toBeLessThanOrEqual(40);
  });
});

describe("plannedSizeOf", () => {
  const base = newPlanned({ movementId: "m-hip-abd", modelId: ABD.id, label: "Hip Abductor", typed: null, at });

  it("takes the model's size over a typed one", () => {
    const p = { ...base, lengthMm: 2000, widthMm: 2000 };
    expect(plannedSizeOf(p, IS)).toEqual({ state: "known", size: { lengthMm: ABD.lengthMm, widthMm: ABD.widthMm, heightMm: ABD.heightMm }, from: "model" });
  });

  it("never uses a model of another movement", () => {
    const p = { ...base, modelId: LP.id };
    expect(plannedSizeOf(p, IS)).toEqual({ state: "unknown" });
    expect(plannedSizeOf({ ...p, lengthMm: 1500, widthMm: 1000 }, IS)).toMatchObject({ state: "known", from: "typed" });
  });

  it("is loading while the models load, and one typed length alone is unknown", () => {
    expect(plannedSizeOf(base, { state: "loading" })).toEqual({ state: "loading" });
    expect(plannedSizeOf(base, { state: "off" })).toEqual({ state: "loading" });
    const noModel = { ...base, modelId: null, lengthMm: 1500 } as typeof base;
    expect(plannedSizeOf(noModel, IS)).toEqual({ state: "unknown" });
  });

  it("says where the size came from, never in millimetres", () => {
    expect(plannedSizeWords(base, plannedSizeOf(base, IS), IS)).toBe("IS2027W Hip Abductor · Imagine Strength brochure, 2026, page 2");
    const typed = { ...base, modelId: null, lengthMm: 1500, widthMm: 1000 };
    expect(plannedSizeWords(typed, plannedSizeOf(typed, IS), IS)).toBe("Size typed on the plan");
    const none = { ...base, modelId: null };
    expect(plannedSizeWords(none, plannedSizeOf(none, IS), IS)).toBe("Size not known yet.");
  });
});

describe("plannedLabel", () => {
  it("is the model's own name, else the movement's, never female, male or a brand twice", () => {
    expect(plannedLabel("Abduction", "IS2027W Hip Abductor")).toBe("IS2027W Hip Abductor");
    expect(plannedLabel("Abduction", null)).toBe("Abduction");
    expect(plannedLabel("Leg Press", "Female Leg Press")).toBe("Leg Press");
    expect(plannedLabel("Leg Press", "Leg Press (male)")).toBe("Leg Press");
    for (const l of [plannedLabel("Abduction", "IS2027W Hip Abductor"), plannedLabel("Leg Press", "Male leg press")]) {
      expect(l).not.toMatch(/\b(?:fe)?male\b/i);
      expect(l).not.toMatch(/Imagine Strength/);
    }
  });
});

describe("swapCandidates", () => {
  it("lists the same movement first, the rest after, each in walking order", () => {
    const p = newPlanned({ movementId: "m-hip-abd", modelId: null, label: "Hip Abductor", typed: null, at });
    const unplaced = [
      { machineId: "sm-sled", name: "Sled", movementId: null },
      { machineId: "m-hip-abd-2", name: "Hip Abductor 2", movementId: "m-hip-abd" },
      { machineId: "m-neck", name: "Neck", movementId: "m-neck" },
      { machineId: "m-hip-abd", name: "Hip Abductor", movementId: "m-hip-abd" },
    ];
    const c = swapCandidates(p, unplaced);
    expect(c.same.map((u) => u.machineId)).toEqual(["m-hip-abd-2", "m-hip-abd"]);
    expect(c.other.map((u) => u.machineId)).toEqual(["sm-sled", "m-neck"]);
    expect(swapCandidates({ ...p, movementId: null }, unplaced).same).toEqual([]);
  });
});

describe("stillToBuyWords", () => {
  it("names them in one line, and is null with none", () => {
    expect(stillToBuyWords([])).toBeNull();
    expect(stillToBuyWords([{ label: "Hip Abductor" }])).toBe("Still to buy: Hip Abductor.");
    expect(stillToBuyWords([{ label: "Hip Abductor" }, { label: "Seated Dip" }, { label: "Neck" }])).toBe("Still to buy: Hip Abductor, Seated Dip and Neck.");
  });
});
