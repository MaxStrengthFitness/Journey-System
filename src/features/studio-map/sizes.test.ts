import { describe, expect, it } from "vitest";
import { modelsReadOf, type ModelsRead } from "../catalog/models";
import {
  ASSUMED_WORDS,
  MARKER_MM,
  isAssumed,
  isCatalogCopy,
  knownSizeOf,
  measuredSizeOf,
  sizeNeedsModels,
  sizeOfUnit,
  sizeSourceWords,
  unitFactsOfEntry,
  type UnitSizeRead,
} from "./sizes";
import type { StudioMachineRosterEntry } from "../../types/machines";

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

/*
 * AJ, Oct 12 2026, after every machine on his practice floor came up as a
 * "?": "we have the info for the machines lets add it", then "Fill them in".
 * A catalog copy that names no model takes its movement's Imagine Strength
 * size, said as not confirmed; a studio's own machine never does.
 */
describe("a catalog copy's Imagine Strength size, not confirmed", () => {
  const copy = (over: Partial<{ unitSize: unknown; modelId: string | null; movementId: string | null }> = {}) => ({ ...unit(over), catalogCopy: true });

  it("draws a catalog copy that names no model at its movement's Imagine Strength size, with the model's source and note", () => {
    const r = sizeOfUnit(copy(), ready);
    expect(r).toEqual({
      state: "known",
      from: "assumed",
      size: { lengthMm: 2120, widthMm: 1260, heightMm: 1800 },
      modelId: IS_LP.id,
      model: "IS2019 Leg Press",
      source: "Imagine Strength brochure, 2026, page 2",
      note: "The seat moves past the frame.",
    });
    expect(isAssumed(r)).toBe(true);
    expect(knownSizeOf(r)).toEqual({ lengthMm: 2120, widthMm: 1260, heightMm: 1800 });
  });

  it("never gives a studio's own machine one, even one based on a movement", () => {
    expect(sizeOfUnit(unit(), ready)).toEqual({ state: "unknown", why: "no-model" });
    expect(sizeOfUnit({ ...unit(), catalogCopy: false }, ready)).toEqual({ state: "unknown", why: "no-model" });
  });

  it("keeps a measured size and a named model ahead of it, and confirms nothing by itself", () => {
    expect(sizeOfUnit(copy({ unitSize: measured }), ready)).toMatchObject({ from: "measured" });
    expect(sizeOfUnit(copy({ modelId: IS_LP.id }), ready)).toMatchObject({ from: "model" });
    // A Hoist named with no size stays unknown: a person named it, so it is never swapped for Imagine Strength's.
    expect(sizeOfUnit(copy({ modelId: HOIST_LP.id }), ready)).toEqual({ state: "unknown", why: "model-has-no-size" });
  });

  it("waits for the models (off reads as loading), and a failed read is unreadable, never a size or none", () => {
    expect(sizeOfUnit(copy(), { state: "off" })).toEqual({ state: "loading" });
    expect(sizeOfUnit(copy(), { state: "loading" })).toEqual({ state: "loading" });
    expect(sizeOfUnit(copy(), { state: "unreadable" })).toEqual({ state: "unreadable" });
  });

  it("says unknown when its movement has no Imagine Strength model, or two to choose between, or one without a size", () => {
    expect(sizeOfUnit(copy({ movementId: "m-neck" }), ready)).toEqual({ state: "unknown", why: "no-model-for-movement" });
    const second = { id: "mm-imagine-strength-is2019b-leg-press", data: { ...IS_LP.data, model: "IS2019B Leg Press" } };
    expect(sizeOfUnit(copy(), modelsReadOf([IS_LP, second]))).toEqual({ state: "unknown", why: "no-model" });
    const bare = { id: IS_LP.id, data: { brand: "Imagine Strength", model: "IS2019 Leg Press", movementId: "m-leg-press" } };
    expect(sizeOfUnit(copy(), modelsReadOf([bare]))).toEqual({ state: "unknown", why: "no-model" });
    // Another maker's model for the movement is never assumed.
    expect(sizeOfUnit(copy(), modelsReadOf([HOIST_LP]))).toEqual({ state: "unknown", why: "no-model" });
    expect(sizeOfUnit(copy({ movementId: null }), ready)).toEqual({ state: "unknown", why: "no-model-for-movement", noMovement: true });
  });

  it("says it is not confirmed, to a leader and a trainer alike", () => {
    const r = sizeOfUnit(copy(), ready);
    expect(sizeSourceWords(r, names)).toBe(`${ASSUMED_WORDS} · IS2019 Leg Press`);
    expect(sizeSourceWords(r, names, false)).toBe("Imagine Strength size, not confirmed · IS2019 Leg Press");
  });
});

describe("whether a door reads the models", () => {
  it("only while a unit names one, or is a catalog copy of a movement with nothing measured", () => {
    expect(sizeNeedsModels(unit({ modelId: IS_LP.id }))).toBe(true);
    expect(sizeNeedsModels({ ...unit(), catalogCopy: true })).toBe(true);
    expect(sizeNeedsModels(unit())).toBe(false);
    expect(sizeNeedsModels({ ...unit({ movementId: null }), catalogCopy: true })).toBe(false);
    expect(sizeNeedsModels({ ...unit({ unitSize: measured, modelId: IS_LP.id }), catalogCopy: true })).toBe(false);
  });
});

describe("a roster entry's facts", () => {
  const entry = (over: Record<string, unknown>) =>
    ({ machineId: "m-leg-press", studioId: "solon", status: "active", ...over }) as unknown as StudioMachineRosterEntry;

  it("reads the measured size, the model it names, its movement and whether it is a catalog copy", () => {
    expect(unitFactsOfEntry(entry({ source: "catalog", basedOn: "m-leg-press", modelId: ` ${IS_LP.id} `, unit: { size: measured } }))).toEqual({
      unitSize: measured,
      modelId: IS_LP.id,
      movementId: "m-leg-press",
      catalogCopy: true,
    });
    expect(unitFactsOfEntry(entry({ source: "custom", definition: { basedOn: "m-leg-press" } }))).toEqual({
      unitSize: null,
      modelId: null,
      movementId: "m-leg-press",
      catalogCopy: false,
    });
    expect(unitFactsOfEntry(undefined)).toEqual({ unitSize: null, modelId: null, movementId: null });
  });

  it("counts anything but a studio's own machine as a catalog copy", () => {
    expect(isCatalogCopy("catalog")).toBe(true);
    expect(isCatalogCopy(undefined)).toBe(true);
    expect(isCatalogCopy("custom")).toBe(false);
  });
});
