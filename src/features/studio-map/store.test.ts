import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ db: {} }));

const writes: { kind: string; path: string; data: Record<string, unknown> }[] = [];
let commits = 0;

vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  serverTimestamp: () => "__now__",
  deleteField: () => "__delete__",
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    writes.push({ kind: "update", path: ref.path, data });
  },
  writeBatch: () => {
    const pending: typeof writes = [];
    return {
      update: (ref: { path: string }, data: Record<string, unknown>) => pending.push({ kind: "batch-update", path: ref.path, data }),
      commit: async () => {
        commits += 1;
        writes.push(...pending);
      },
    };
  },
}));

const { linkModels, setUnitModel, setUnitSize, unlinkModels, AnotherMachinesModel } = await import("./store");

/** Every value in a written object, deep, so an undefined anywhere is caught. */
const undefinedIn = (v: unknown): boolean =>
  v === undefined || (v !== null && typeof v === "object" && Object.values(v as Record<string, unknown>).some(undefinedIn));

beforeEach(() => {
  writes.length = 0;
  commits = 0;
});

describe("a unit's size", () => {
  it("is written by its dotted path, signed, and nothing else", async () => {
    await setUnitSize("solon", "m-leg-press", { lengthMm: 2120.6, widthMm: 1260, heightMm: 1800 }, "uid-aj");
    expect(writes).toEqual([
      {
        kind: "update",
        path: "studios/solon/roster/m-leg-press",
        data: { "unit.size": { lengthMm: 2121, widthMm: 1260, heightMm: 1800, by: "uid-aj", at: "__now__" } },
      },
    ]);
  });

  it("leaves out a height it hasn't got, never writing undefined", async () => {
    await setUnitSize("solon", "m-leg-press", { lengthMm: 2120, widthMm: 1260, heightMm: null }, "uid-aj");
    const size = writes[0].data["unit.size"] as Record<string, unknown>;
    expect(Object.keys(size).sort()).toEqual(["at", "by", "lengthMm", "widthMm"]);
    expect(undefinedIn(writes[0].data)).toBe(false);
  });

  it("is taken away with deleteField", async () => {
    await setUnitSize("solon", "m-leg-press", null, "uid-aj");
    expect(writes[0].data).toEqual({ "unit.size": "__delete__" });
  });
});

describe("a unit's model", () => {
  it("is written alone, or deleted", async () => {
    await setUnitModel("solon", { machineId: "m-leg-press", movementId: "m-leg-press" }, { id: "mm-is-lp", movementId: "m-leg-press" });
    await setUnitModel("solon", { machineId: "m-leg-press", movementId: "m-leg-press" }, null);
    expect(writes.map((w) => w.data)).toEqual([{ modelId: "mm-is-lp" }, { modelId: "__delete__" }]);
  });

  it("refuses another movement's model, writing nothing", async () => {
    await expect(
      setUnitModel("solon", { machineId: "m-pulldown", movementId: "m-pulldown" }, { id: "mm-is-lp", movementId: "m-leg-press" }),
    ).rejects.toBeInstanceOf(AnotherMachinesModel);
    await expect(setUnitModel("solon", { machineId: "sm-x", movementId: null }, { id: "mm-is-lp", movementId: "m-leg-press" })).rejects.toThrow(
      "That model is for another machine.",
    );
    expect(writes).toEqual([]);
  });
});

describe("Mark {n} as Imagine Strength", () => {
  const link = (machineId: string, unitMovementId: string | null, modelMovementId = machineId) => ({
    machineId,
    modelId: `mm-is-${modelMovementId}`,
    unitMovementId,
    modelMovementId,
  });

  it("writes modelId alone on each entry, in one batch, and drops a link to another movement's model", async () => {
    const r = linkModels("solon", [link("m-leg-press", "m-leg-press"), link("m-pulldown", "m-pulldown", "m-leg-press"), link("m-neck", "m-neck")]);
    expect(r.written).toEqual(["m-leg-press", "m-neck"]);
    expect(r.dropped).toEqual(["m-pulldown"]);
    await r.done;
    expect(commits).toBe(1);
    expect(writes).toEqual([
      { kind: "batch-update", path: "studios/solon/roster/m-leg-press", data: { modelId: "mm-is-m-leg-press" } },
      { kind: "batch-update", path: "studios/solon/roster/m-neck", data: { modelId: "mm-is-m-neck" } },
    ]);
  });

  it("refuses more than a floor's worth, and its Undo takes the models away in one batch", async () => {
    const many = Array.from({ length: 121 }, (_, i) => link(`m-${i}`, `m-${i}`));
    await expect(linkModels("solon", many).done).rejects.toThrow();
    expect(writes).toEqual([]);
    await unlinkModels("solon", ["m-leg-press", "m-neck"]);
    expect(commits).toBe(1);
    expect(writes.map((w) => w.data)).toEqual([{ modelId: "__delete__" }, { modelId: "__delete__" }]);
  });
});
