import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import { modelsReadOf } from "../catalog/models";
import { IMAGINE_STRENGTH_MODELS, seedModelDocument } from "./imagine-strength";
import { initialTicks, linkMismatched, linksFor, sizeRows, sizesHeading, type FloorMachine } from "./links";
import { sizeSourceWords, type UnitFacts } from "./sizes";

const TWENTY = Object.keys(MACHINE_DEFINITIONS);
const isModels = modelsReadOf(IMAGINE_STRENGTH_MODELS.map((r) => ({ id: r.id, data: seedModelDocument(r) })));
const floorOf = (ids: readonly string[]): FloorMachine[] => ids.map((id) => ({ machineId: id, name: MACHINE_DEFINITIONS[id]?.name ?? id }));
const unitsOf = (ids: readonly string[], over: Record<string, Partial<UnitFacts>> = {}): Record<string, UnitFacts> =>
  Object.fromEntries(ids.map((id) => [id, { unitSize: null, modelId: null, movementId: MACHINE_DEFINITIONS[id] ? id : null, ...over[id] }]));
const HOIST = { id: "mm-hoist-roc-it-leg-press", data: { brand: "Hoist", model: "ROC-IT Leg Press", movementId: "m-leg-press" } };

describe("the Sizes sheet's rows", () => {
  it("offers Solon's twenty catalog copies a tick each, in walking order, none ticked", () => {
    const rows = sizeRows(floorOf(TWENTY), unitsOf(TWENTY), isModels);
    expect(rows.map((r) => r.machineId)).toEqual(TWENTY);
    expect(rows.map((r) => r.order)).toEqual(TWENTY.map((_, i) => i + 1));
    expect(rows.every((r) => r.isOffer !== null)).toBe(true);
    expect(linksFor(rows, new Set())).toEqual([]);
  });

  it("offers Strongsville's twenty, and its own machine with no movement only Measure", () => {
    const ids = [...TWENTY, "sm-strongsville-hammer-sled"];
    const rows = sizeRows(floorOf(ids), unitsOf(ids), isModels);
    expect(rows.filter((r) => r.isOffer).length).toBe(20);
    const own = rows.find((r) => r.machineId === "sm-strongsville-hammer-sled")!;
    expect(own.isOffer).toBeNull();
    expect(own.models).toEqual([]);
    expect(sizeSourceWords(own.size, () => null)).toBe("Size not known. Measure it.");
  });

  it("offers no tick to a unit that already names a model, and its picker shows that model's movement's models", () => {
    const models = modelsReadOf([...IMAGINE_STRENGTH_MODELS.map((r) => ({ id: r.id, data: seedModelDocument(r) })), HOIST]);
    const rows = sizeRows(floorOf(["m-leg-press"]), unitsOf(["m-leg-press"], { "m-leg-press": { modelId: HOIST.id } }), models);
    expect(rows[0].isOffer).toBeNull();
    expect(rows[0].models.map((m) => m.id)).toContain(HOIST.id);
  });

  it("offers no tick to a unit with a measured size", () => {
    const rows = sizeRows(
      floorOf(["m-neck"]),
      unitsOf(["m-neck"], { "m-neck": { unitSize: { lengthMm: 1120, widthMm: 1160, by: "u", at: new Date() } } }),
      isModels,
    );
    expect(rows[0].isOffer).toBeNull();
    expect(rows[0].size).toMatchObject({ state: "known", from: "measured" });
  });

  it("offers nothing and lists nothing with no models at all", () => {
    const rows = sizeRows(floorOf(TWENTY), unitsOf(TWENTY), modelsReadOf([]));
    expect(rows.every((r) => r.isOffer === null && r.models.length === 0)).toBe(true);
    const off = sizeRows(floorOf(TWENTY), unitsOf(TWENTY), { state: "loading" });
    expect(off.every((r) => r.isOffer === null)).toBe(true);
  });

  it("offers no tick when two Imagine Strength models share a movement, and lists both", () => {
    const second = { id: "mm-imagine-strength-is2019b-leg-press", data: { brand: "Imagine Strength", model: "IS2019B Leg Press", movementId: "m-leg-press" } };
    const models = modelsReadOf([...IMAGINE_STRENGTH_MODELS.map((r) => ({ id: r.id, data: seedModelDocument(r) })), second]);
    const [row] = sizeRows(floorOf(["m-leg-press"]), unitsOf(["m-leg-press"]), models);
    expect(row.isOffer).toBeNull();
    expect(row.models.filter((m) => m.brand === "Imagine Strength").length).toBe(2);
  });

  it("links only the ticked rows, in walking order", () => {
    const rows = sizeRows(floorOf(TWENTY), unitsOf(TWENTY), isModels);
    const ticked = new Set([TWENTY[5], TWENTY[0], TWENTY[11]]);
    const links = linksFor(rows, ticked);
    expect(links.map((l) => l.machineId)).toEqual([TWENTY[0], TWENTY[5], TWENTY[11]]);
    expect(links[0].modelId).toBe(IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === TWENTY[0])!.id);
    expect(links.some(linkMismatched)).toBe(false);
    expect(linkMismatched({ machineId: "x", modelId: "y", unitMovementId: "m-pulldown", modelMovementId: "m-leg-press" })).toBe(true);
  });

  it("carries the model's own movement on each link, so the store's check is a real one", () => {
    const rows = sizeRows(floorOf(TWENTY), unitsOf(TWENTY), isModels);
    const [link] = linksFor(rows, new Set([TWENTY[0]]));
    expect(link.modelMovementId).toBe(IMAGINE_STRENGTH_MODELS.find((m) => m.id === link.modelId)!.movementId);
    // A row offering a model of another movement: the link says so, and the store drops it.
    const wrong = rows.map((r) => (r.machineId === TWENTY[0] ? { ...r, isOffer: { ...r.isOffer!, movementId: "m-some-other" } } : r));
    expect(linksFor(wrong, new Set([TWENTY[0]])).map(linkMismatched)).toEqual([true]);
  });

  it("heads the sheet with how many have a size", () => {
    const none = sizeRows(floorOf(TWENTY), unitsOf(TWENTY), isModels);
    expect(sizesHeading(none)).toBe("20 machines have no size yet");
    const some = sizeRows(
      floorOf(TWENTY),
      unitsOf(TWENTY, Object.fromEntries(TWENTY.slice(0, 12).map((id) => [id, { modelId: IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === id)!.id }]))),
      isModels,
    );
    expect(sizesHeading(some)).toBe("12 of 20 have a size");
    const all = sizeRows(
      floorOf(TWENTY),
      unitsOf(TWENTY, Object.fromEntries(TWENTY.map((id) => [id, { modelId: IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === id)!.id }]))),
      isModels,
    );
    expect(sizesHeading(all)).toBe("Every machine has a size");
  });
});

describe("which rows start ticked (AJ, Oct 11 2026: Yes, nearly all)", () => {
  const catalogFloor = (ids: readonly string[]) => floorOf(ids).map((m) => ({ ...m, source: "catalog" as const }));

  it("every catalog copy that offers Imagine Strength: Solon's twenty, all ticked", () => {
    const rows = sizeRows(catalogFloor(TWENTY), unitsOf(TWENTY), isModels);
    expect([...initialTicks(rows)].sort()).toEqual([...TWENTY].sort());
    expect(linksFor(rows, initialTicks(rows))).toHaveLength(20);
  });

  it("a studio's own machine based on a movement offers a tick but starts unticked", () => {
    const own: FloorMachine = { machineId: "sm-solon-leg-press-2", name: "LEG PRESS 2", source: "custom" };
    const rows = sizeRows([own], { [own.machineId]: { unitSize: null, modelId: null, movementId: "m-leg-press" } }, isModels);
    expect(rows[0].isOffer).not.toBeNull();
    expect(initialTicks(rows).size).toBe(0);
  });

  it("Strongsville's twenty ticked, its own machine with no movement offered Measure only", () => {
    const ids = [...TWENTY, "sm-strongsville-hammer-sled"];
    const floor = [...catalogFloor(TWENTY), { machineId: "sm-strongsville-hammer-sled", name: "Hammer sled", source: "custom" }];
    const rows = sizeRows(floor, unitsOf(ids), isModels);
    expect(initialTicks(rows).size).toBe(20);
    expect(initialTicks(rows).has("sm-strongsville-hammer-sled")).toBe(false);
  });

  it("nothing is ticked that already names a model or has a measured size", () => {
    const rows = sizeRows(
      catalogFloor(["m-leg-press", "m-neck"]),
      unitsOf(["m-leg-press", "m-neck"], {
        "m-leg-press": { modelId: "mm-hoist-roc-it-leg-press" },
        "m-neck": { unitSize: { lengthMm: 1120, widthMm: 1160, by: "u", at: new Date() } },
      }),
      isModels,
    );
    expect(initialTicks(rows).size).toBe(0);
  });
});

describe("the sheet over sizes not confirmed (AJ, Oct 12 2026: Fill them in)", () => {
  const copies = (ids: readonly string[], over: Record<string, Partial<UnitFacts>> = {}) =>
    Object.fromEntries(Object.entries(unitsOf(ids, over)).map(([id, f]) => [id, { ...f, catalogCopy: true }]));

  it("keeps offering Mark for every copy drawn at its Imagine Strength size, all ticked, and doesn't call the floor done", () => {
    const rows = sizeRows(floorOf(TWENTY).map((m) => ({ ...m, source: "catalog" })), copies(TWENTY), isModels);
    expect(rows.every((r) => r.size.state === "known" && r.size.from === "assumed")).toBe(true);
    // The tick names the very model the map is drawn at.
    expect(rows.every((r) => r.size.state === "known" && r.size.from === "assumed" && r.isOffer?.modelId === r.size.modelId)).toBe(true);
    expect(initialTicks(rows).size).toBe(20);
    expect(sizesHeading(rows)).toBe("20 sizes not confirmed yet");
    expect(sizesHeading(rows.slice(0, 1))).toBe("1 size not confirmed yet");
  });

  it("says both counts when some have no size and some aren't confirmed", () => {
    const ids = [...TWENTY, "sm-strongsville-hammer-sled"];
    const rows = sizeRows(floorOf(ids), copies(ids), isModels);
    expect(sizesHeading(rows)).toBe("1 with no size · 20 not confirmed");
  });

  it("calls it done once each is confirmed or measured", () => {
    const named = Object.fromEntries(TWENTY.map((id) => [id, { modelId: IMAGINE_STRENGTH_MODELS.find((m) => m.movementId === id)!.id }]));
    expect(sizesHeading(sizeRows(floorOf(TWENTY), copies(TWENTY, named), isModels))).toBe("Every machine has a size");
  });

  it("ticks a row whose roster entry says no source, the same rule that draws it at its Imagine Strength size", () => {
    const rows = sizeRows(floorOf(["m-leg-press"]).map((m) => ({ ...m, source: null })), copies(["m-leg-press"]), isModels);
    expect(initialTicks(rows).has("m-leg-press")).toBe(true);
  });
});
