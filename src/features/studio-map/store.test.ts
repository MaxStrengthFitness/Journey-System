import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedPlan, Placement, PlannedPlacement, PlanRoom } from "./layout";

vi.mock("../../firebase", () => ({ db: {} }));

const writes: { kind: string; path: string; data: Record<string, unknown> }[] = [];
let commits = 0;
let serverRev: number | null = null;
let refuse = false;

vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  serverTimestamp: () => "__now__",
  deleteField: () => "__delete__",
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    writes.push({ kind: "update", path: ref.path, data });
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    if (refuse) throw Object.assign(new Error("denied"), { code: "permission-denied" });
    writes.push({ kind: "set", path: ref.path, data });
  },
  getDocFromServer: async () => ({ exists: () => serverRev !== null, data: () => ({ rev: serverRev, updatedBy: "uid-marina" }) }),
  writeBatch: () => {
    const pending: typeof writes = [];
    return {
      update: (ref: { path: string }, data: Record<string, unknown>) => pending.push({ kind: "batch-update", path: ref.path, data }),
      set: (ref: { path: string }, data: Record<string, unknown>) => pending.push({ kind: "batch-set", path: ref.path, data }),
      commit: async () => {
        if (refuse) throw Object.assign(new Error("denied"), { code: "permission-denied" });
        commits += 1;
        writes.push(...pending);
      },
    };
  },
}));

const { linkModels, setUnitModel, setUnitSize, unlinkModels, AnotherMachinesModel, saveLayout, useThisLayout, undoUseThisLayout, planUseThisLayout, retireDraft, restoreDraft } =
  await import("./store");
const { useLayoutOps } = await import("./layout");

/** Every value in a written object, deep, so an undefined anywhere is caught. */
const undefinedIn = (v: unknown): boolean =>
  v === undefined || (v !== null && typeof v === "object" && Object.values(v as Record<string, unknown>).some(undefinedIn));

beforeEach(() => {
  writes.length = 0;
  commits = 0;
  serverRev = null;
  refuse = false;
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

describe("the layout's writes", () => {
  const room: PlanRoom = { areaSqFt: 1800, boxes: [{ id: "bx-1", x: 0, y: 0, w: 18288, h: 9144 }], places: [] };
  const unit = (machineId: string): Placement => ({ machineId, x: 3000, y: 3000, rotationDeg: 0 });
  const planned: PlannedPlacement = { kind: "planned", id: "pm-1", label: "Hip Abductor", movementId: "m-hip-abd", modelId: null, x: 5000, y: 5000, rotationDeg: 0 };
  const loaded = (id: string, rev: number, placements: Placement[], retired = false): LoadedPlan => ({
    id,
    name: id === "current" ? "The layout" : `Remodel ${id.slice(2)}`,
    rev,
    retired,
    room,
    placements,
    updatedAtMs: 0,
    updatedBy: "u",
  });

  it("saves the layout at rev + 1, whole", async () => {
    const out = await saveLayout("solon", "current", { room, placements: [unit("m-a")], gone: [] }, "The layout", 4, "uid-aj");
    expect(out).toEqual({ ok: true, rev: 5 });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: "set", path: "studios/solon/floorPlans/current", data: { rev: 5, updatedBy: "uid-aj", updatedAt: "__now__" } });
  });

  it("never writes a machine still to buy to the layout itself", async () => {
    const out = await saveLayout("solon", "current", { room, placements: [unit("m-a"), planned], gone: [] }, "The layout", 4, "uid-aj");
    expect(out).toEqual({ ok: false, why: "invalid", problem: "A machine still to buy goes on a draft, not the layout." });
    expect(writes).toEqual([]);
  });

  it("tells a save someone else beat apart from a refusal", async () => {
    refuse = true;
    serverRev = 6;
    expect(await saveLayout("solon", "current", { room, placements: [], gone: [] }, "The layout", 4, "uid-aj")).toEqual({
      ok: false,
      why: "changed",
      by: "uid-marina",
    });
    serverRev = 4;
    expect(await saveLayout("solon", "current", { room, placements: [], gone: [] }, "The layout", 4, "uid-aj")).toEqual({ ok: false, why: "refused" });
  });

  it("Use this layout with machines still to buy sends three sets: the units, the draft unchanged, the old layout kept", async () => {
    const current = loaded("current", 4, [unit("m-a")]);
    const draft = loaded("d-1", 2, [unit("m-b"), planned]);
    const out = await useThisLayout("solon", current, draft, [draft], "uid-aj", Date.UTC(2026, 9, 12, 19, 40));
    expect(out.ok).toBe(true);
    expect(commits).toBe(1);
    expect(writes.map((w) => [w.kind, w.path, w.data.rev])).toEqual([
      ["batch-set", "studios/solon/floorPlans/current", 5],
      ["batch-set", "studios/solon/floorPlans/d-1", 3],
      ["batch-set", "studios/solon/floorPlans/d-2", 1],
    ]);
    expect((writes[0].data.placements as Record<string, unknown>[]).some((p) => p.kind === "planned")).toBe(false);
  });

  it("with no free slot, two", async () => {
    const current = loaded("current", 4, [unit("m-a")]);
    const slots = ["d-1", "d-2", "d-3", "d-4", "d-5"].map((id) => loaded(id, 1, id === "d-1" ? [planned] : [unit("m-z")]));
    await useThisLayout("solon", current, slots[0], slots, "uid-aj", 0);
    expect(writes).toHaveLength(2);
  });

  it("works out what Make this the map sends before sending it, so its Undo is ready at the tap", async () => {
    const current = loaded("current", 4, [unit("m-a")]);
    const draft = loaded("d-1", 2, [unit("m-b"), planned]);
    const retired = loaded("d-2", 7, [], true);
    const now = Date.UTC(2026, 9, 12, 19, 40);
    const plan = planUseThisLayout(current, draft, [draft, retired], now);
    expect(plan.free).toEqual({ id: "d-2", rev: 7 });
    expect(plan.record).toMatchObject({ draftId: "d-1", currentRev: 5, slotRev: 3, kept: true, beforeSlot: { id: "d-2", rev: 8 } });
    await useThisLayout("solon", current, draft, [draft, retired], "uid-aj", now);
    expect(writes.map((w) => [w.path, w.data.rev])).toEqual(plan.ops.map((o) => [`studios/solon/floorPlans/${o.id}`, o.data.rev]));
    expect("retired" in writes[2].data).toBe(false);
    // Its Undo, while every document still stands where the batch left it: the old map back, the Before slot retired.
    writes.length = 0;
    await undoUseThisLayout("solon", plan.record, { current: 5, slot: 3, before: 8 }, "uid-aj");
    expect(writes.map((w) => [w.path, w.data.rev, w.data.retired ?? false])).toEqual([
      ["studios/solon/floorPlans/current", 6, false],
      ["studios/solon/floorPlans/d-2", 9, true],
    ]);
    expect(undoUseThisLayout("solon", plan.record, { current: 6, slot: 3, before: 8 }, "uid-aj")).toBeNull();
  });

  it("Delete draft retires the slot at rev + 1 with its content, and its Undo brings it back at rev + 2", async () => {
    const draft = loaded("d-3", 4, [planned]);
    expect(await retireDraft("solon", draft, "uid-aj")).toEqual({ ok: true, rev: 5 });
    expect(writes[0]).toMatchObject({ path: "studios/solon/floorPlans/d-3", data: { rev: 5, retired: true, name: "Remodel 3" } });
    expect(await restoreDraft("solon", { ...draft, rev: 5, retired: true }, "uid-aj")).toEqual({ ok: true, rev: 6 });
    expect(writes[1].data.rev).toBe(6);
    expect("retired" in writes[1].data).toBe(false);
    expect((writes[1].data.placements as unknown[]).length).toBe(1);
  });

  it("every layout write carries rev as a literal whole number, never a transform (final review fixes)", async () => {
    // The rules' rev check only protects an honest client: increment(1) passes it without reading rev,
    // so "Someone changed it" depends on this store always sending the number it read, plus one.
    const current = loaded("current", 4, [unit("m-a")]);
    const draft = loaded("d-1", 2, [unit("m-b"), planned]);
    const retired = loaded("d-2", 7, [], true);
    await saveLayout("solon", "current", { room, placements: [unit("m-a")], gone: [] }, "The layout", 4, "uid-aj");
    await saveLayout("solon", "d-4", { room, placements: [planned], gone: [] }, "Remodel 4", null, "uid-aj");
    const plan = planUseThisLayout(current, draft, [draft, retired], 0);
    await useThisLayout("solon", current, draft, [draft, retired], "uid-aj", 0);
    await undoUseThisLayout("solon", plan.record, { current: 5, slot: 3, before: 8 }, "uid-aj");
    await retireDraft("solon", loaded("d-3", 4, [planned]), "uid-aj");
    await restoreDraft("solon", { ...loaded("d-3", 4, [planned]), rev: 5, retired: true }, "uid-aj");
    const layoutWrites = writes.filter((w) => w.path.includes("/floorPlans/"));
    expect(layoutWrites.length).toBeGreaterThanOrEqual(8);
    for (const w of layoutWrites) {
      expect(typeof w.data.rev).toBe("number");
      expect(Number.isInteger(w.data.rev)).toBe(true);
    }
  });

  it("the store never imports Firestore's increment (a rev is always the number read, plus one)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(fileURLToPath(new URL("./store.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/\bincrement\s*\(/);
  });

  it("refuses a composed layout that would carry a machine still to buy, sending nothing", async () => {
    // An Undo whose "before" layout holds one (only a bug could make it).
    const { record } = useLayoutOps(loaded("current", 4, [planned]), loaded("d-1", 2, [unit("m-b")]), null, 0);
    await expect(undoUseThisLayout("solon", record, { current: 5, slot: 3, before: null }, "uid-aj")!).rejects.toThrow(
      "A machine still to buy goes on a draft, not the layout.",
    );
    expect(writes).toEqual([]);
  });
});
