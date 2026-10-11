import { describe, expect, it } from "vitest";
import { modelsReadOf, type ModelsRead } from "../catalog/models";
import { MARKER_MM, knownSizeOf, measuredSizeOf, sizeOfUnit, sizeSourceWords, type UnitSizeRead } from "./sizes";

const IS_LP = {
  id: "mm-imagine-strength-is2019-leg-press",
  data: {
    brand: "Imagine Strength",
    model: "IS2019 Leg Press",
    movementId: "m-leg-press",
    size: { lengthMm: 2120, widthMm: 1260, heightMm: 1800, source: "Imagine Strength brochure, 2026, page 2", note: "The seat moves past the frame." },
  },
};
const HOIST_LP = { id: "mm-hoist-roc-it-leg-press", data: { brand: "Hoist", model: "ROC-IT Leg Press", movementId: "m-leg-press" } };
const IS_ROW = {
  id: "mm-imagine-strength-is2024-compound-rowing",
  data: { brand: "Imagine Strength", model: "IS2024 Compound Rowing", movementId: "m-compound-row", size: { lengthMm: 1594, widthMm: 1227, source: "Brochure" } },
};
const ready = modelsReadOf([IS_LP, HOIST_LP, IS_ROW]);
const measured = { lengthMm: 2000, widthMm: 1200, by: "uid-aj", at: new Date("2026-10-12T15:00:00Z") };
const unit = (over: Partial<{ unitSize: unknown; modelId: string | null; movementId: string | null }> = {}) => ({
  unitSize: null,
  modelId: null,
  movementId: "m-leg-press",
  ...over,
});
const names = (uid: string) => (uid === "uid-aj" ? "AJ Jurgens" : null);

describe("which size a unit has", () => {
  it("takes the measured size over the model's", () => {
    const r = sizeOfUnit(unit({ unitSize: measured, modelId: IS_LP.id }), ready);
    expect(r).toMatchObject({ state: "known", from: "measured", size: { lengthMm: 2000, widthMm: 1200, heightMm: null }, by: "uid-aj" });
  });

  it("knows a measured size while the models are still loading, or off", () => {
    for (const models of [{ state: "loading" }, { state: "off" }, { state: "unreadable" }] as ModelsRead[]) {
      expect(sizeOfUnit(unit({ unitSize: measured, modelId: IS_LP.id }), models).state).toBe("known");
    }
  });

  it("reads models that are off as loading, never as unknown", () => {
    expect(sizeOfUnit(unit({ modelId: IS_LP.id }), { state: "off" })).toEqual({ state: "loading" });
    expect(sizeOfUnit(unit({ modelId: IS_LP.id }), { state: "loading" })).toEqual({ state: "loading" });
    expect(sizeOfUnit(unit({ modelId: IS_LP.id }), { state: "unreadable" })).toEqual({ state: "unreadable" });
  });

  it("takes the model's size, its source and its note", () => {
    expect(sizeOfUnit(unit({ modelId: IS_LP.id }), ready)).toEqual({
      state: "known",
      from: "model",
      size: { lengthMm: 2120, widthMm: 1260, heightMm: 1800 },
      modelId: IS_LP.id,
      model: "IS2019 Leg Press",
      source: "Imagine Strength brochure, 2026, page 2",
      note: "The seat moves past the frame.",
    });
  });

  it("says why each unknown is unknown", () => {
    expect(sizeOfUnit(unit(), ready)).toEqual({ state: "unknown", why: "no-model" });
    expect(sizeOfUnit(unit({ modelId: HOIST_LP.id }), ready)).toEqual({ state: "unknown", why: "model-has-no-size" });
    expect(sizeOfUnit(unit({ modelId: "mm-gone" }), ready)).toEqual({ state: "unknown", why: "model-not-recorded" });
    // A leg press model named on a unit whose movement is the pulldown is never drawn for it.
    expect(sizeOfUnit(unit({ modelId: HOIST_LP.id, movementId: "m-pulldown" }), ready)).toEqual({
      state: "unknown",
      why: "model-for-another-machine",
    });
    expect(sizeOfUnit(unit({ movementId: "m-neck" }), ready)).toEqual({ state: "unknown", why: "no-model-for-movement" });
    expect(sizeOfUnit(unit({ movementId: "m-neck" }), { state: "loading" })).toEqual({ state: "unknown", why: "no-model" });
    expect(sizeOfUnit(unit({ movementId: null }), ready)).toEqual({ state: "unknown", why: "no-model-for-movement", noMovement: true });
  });

  it("ignores junk in a measured size and falls back to the model", () => {
    for (const junk of [{ ...measured, lengthMm: "2000" }, { ...measured, widthMm: -4 }, "2000 x 1200", 7]) {
      expect(measuredSizeOf(junk)).toBeNull();
      expect(sizeOfUnit(unit({ unitSize: junk, modelId: IS_LP.id }), ready)).toMatchObject({ state: "known", from: "model" });
    }
  });

  it("reads an absent height as null, and a Firestore timestamp as a date", () => {
    expect(measuredSizeOf({ lengthMm: 2000, widthMm: 1200, by: "x" })?.size.heightMm).toBeNull();
    expect(measuredSizeOf({ ...measured, at: { toDate: () => new Date("2026-10-12T15:00:00Z") } })?.at?.toISOString()).toBe(
      "2026-10-12T15:00:00.000Z",
    );
    expect(sizeOfUnit(unit({ modelId: IS_ROW.id, movementId: "m-compound-row" }), ready)).toMatchObject({ size: { heightMm: null } });
  });

  it("draws a unit with no size as a marker", () => {
    expect(knownSizeOf({ state: "loading" })).toBeNull();
    expect(MARKER_MM).toBe(610);
  });
});

describe("where a size came from, in words", () => {
  const all: UnitSizeRead[] = [
    sizeOfUnit(unit({ unitSize: measured }), ready),
    sizeOfUnit(unit({ modelId: IS_LP.id }), ready),
    sizeOfUnit(unit(), ready),
    sizeOfUnit(unit({ modelId: HOIST_LP.id }), ready),
    sizeOfUnit(unit({ modelId: "mm-gone" }), ready),
    sizeOfUnit(unit({ modelId: HOIST_LP.id, movementId: "m-pulldown" }), ready),
    sizeOfUnit(unit({ movementId: "m-neck" }), ready),
    sizeOfUnit(unit({ movementId: null }), ready),
    { state: "loading" },
    { state: "unreadable" },
  ];

  it("names who measured it and when, or just when", () => {
    expect(sizeSourceWords(all[0], names)).toBe("Measured by AJ Jurgens on Oct 12");
    expect(sizeSourceWords(all[0], () => null)).toBe("Measured on Oct 12");
  });

  it("says the model, its source and that it is the frame at rest", () => {
    expect(sizeSourceWords(all[1], names)).toBe("IS2019 Leg Press · Imagine Strength brochure, 2026, page 2 · frame at rest");
  });

  it("says what can be done about an unknown size", () => {
    expect(all.slice(2).map((r) => sizeSourceWords(r, names))).toEqual([
      "Size not known. Pick its model or measure it.",
      "Size not known: head office hasn't recorded this model's size. Measure it, or pick another model.",
      "Size not known: head office hasn't recorded its model. Measure it, or pick another.",
      "Size not known: the model named is for another machine. Pick its model or measure it.",
      "Size not known. Measure it, or ask head office to record its model.",
      "Size not known. Measure it.",
      "Checking the model's size…",
      "The model's size couldn't be read.",
    ]);
  });

  it("never tells a reader who can't measure or pick a model to do either", () => {
    expect(all.slice(2, 8).map((r) => sizeSourceWords(r, names, false))).toEqual(Array(6).fill("Size not known yet."));
    // Where it came from is the same for everyone.
    expect(sizeSourceWords(all[0], names, false)).toBe("Measured by AJ Jurgens on Oct 12");
    expect(sizeSourceWords(all[8], names, false)).toBe("Checking the model's size…");
  });

  it("never says mm", () => {
    for (const r of all) expect(sizeSourceWords(r, names)).not.toMatch(/\bmm\b/);
  });
});
