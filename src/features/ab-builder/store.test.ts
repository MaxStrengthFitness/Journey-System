import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ db: {}, auth: {} }));

import type { Routine } from "../../types";
import { phasePlanOf, tickedStep } from "./phase";
import { phaseSaveOf, phaseSaveOfA, routineSaveOf, saveChanges, type RoutineSaveInput } from "./store";
import { switchOnWholeOf } from "../routine-slots/usePlannedStarts";

const who = { uid: "u1", name: "Sam" };
const base: Omit<RoutineSaveInput, "slot" | "routine" | "machineIds" | "purpose"> = {
  routines: [],
  clientId: "c1",
  studioId: "s1",
  trainerId: "t1",
  who,
  todayYmd: "2026-10-19",
  isBActive: false,
};

const A: Routine = { id: "ra", name: "Routine A", clientId: "c1", studioId: "s1", machineIds: ["add", "press", "row"] };
const swapB: Routine = {
  id: "rb",
  name: "Routine B",
  clientId: "c1",
  studioId: "s1",
  machineIds: ["add", "curl", "row"],
  plan: { purpose: "", intended: ["add", "curl", "row"], building: false, madeByUid: "u0", swaps: [{ replaces: "press", with: "curl" }] },
};

describe("Routine B, built whole", () => {
  it("makes Routine B with its machines and a plan of no swaps, planned: B stays off (the routine library round, Oct 23 2026)", () => {
    const s = routineSaveOf({ ...base, slot: "Routine B", routine: null, machineIds: ["add", "curl"], purpose: "Variety" });
    expect(s.routineId).toBeNull();
    expect(s.fields).toMatchObject({ name: "Routine B", clientId: "c1", machineIds: ["add", "curl"] });
    expect((s.fields.plan as { swaps?: unknown; purpose: string }).swaps).toBeUndefined();
    expect((s.fields.plan as { purpose: string }).purpose).toBe("Variety");
    expect(s.turnB).toBeNull();
    expect(s.adjustment.changeType).toBe("created");
  });

  it("replaces a plan of swaps, so B no longer follows A", () => {
    const s = routineSaveOf({ ...base, slot: "Routine B", routine: swapB, machineIds: ["add", "curl", "row", "fly"], purpose: "", isBActive: true });
    expect(s.routineId).toBe("rb");
    expect((s.fields.plan as { swaps?: unknown }).swaps).toBeUndefined();
    expect(s.turnB).toBeNull();
  });

  it("turns B off when it is saved empty while on", () => {
    expect(routineSaveOf({ ...base, slot: "Routine B", routine: swapB, machineIds: [], purpose: "", isBActive: true }).turnB).toBe(false);
  });
});

describe("Routine A", () => {
  it("makes Routine A with a plan and its start change when there is none", () => {
    const s = routineSaveOf({ ...base, slot: "Routine A", routine: null, machineIds: ["add", "press"], purpose: "The core" });
    expect(s.fields).toMatchObject({ name: "Routine A", machineIds: ["add", "press"] });
    expect(s.changes.map((c) => c.kind)).toEqual(["start"]);
    expect(s.changes[0].byUid).toBe("u1");
  });

  it("saves a plan-less Routine A as its machines alone, and a B of swaps still follows it", () => {
    const s = routineSaveOf({ ...base, slot: "Routine A", routine: A, routines: [A, swapB], machineIds: ["add", "press", "row", "ohp"], purpose: "" });
    expect(s.fields).toEqual({ machineIds: ["add", "press", "row", "ohp"] });
    expect(s.changes).toEqual([]);
    expect(s.follow?.routineId).toBe("rb");
  });

  it("never makes B follow when B is its own list", () => {
    const ownB = { ...swapB, plan: { ...swapB.plan!, swaps: undefined } };
    const s = routineSaveOf({ ...base, slot: "Routine A", routine: A, routines: [A, ownB], machineIds: ["add", "row"], purpose: "" });
    expect(s.follow).toBeNull();
  });

  it("keeps a plan: the matching changes and what it's for", () => {
    const planned: Routine = { ...A, plan: { purpose: "Old", intended: ["add", "press", "row"], building: false, madeByUid: "u0" } };
    const s = routineSaveOf({ ...base, slot: "Routine A", routine: planned, machineIds: ["add", "row"], purpose: "New", why: "Knee" });
    expect(s.changes.map((c) => c.kind)).toEqual(["remove", "purpose"]);
    expect(s.changes.every((c) => c.reason === "Knee")).toBe(true);
    expect((s.fields.plan as { purpose: string; intended: string[] }).purpose).toBe("New");
    expect((s.fields.plan as { intended: string[] }).intended).toEqual(["add", "row"]);
    expect(s.adjustment.notes).toBe("Knee");
  });

  it("leaves a plan alone when only the order or nothing on it changed, and writes What it's for by its own path", () => {
    const planned: Routine = { ...A, plan: { purpose: "Core ", intended: ["add", "press", "row"], building: false, madeByUid: "u0", cantDo: [] } };
    expect(routineSaveOf({ ...base, slot: "Routine A", routine: planned, machineIds: ["add", "press", "row"], purpose: "Core" }).fields).toEqual({ machineIds: ["add", "press", "row"] });
    const s = routineSaveOf({ ...base, slot: "Routine A", routine: planned, machineIds: ["add", "press", "row"], purpose: "Whole body" });
    expect(s.fields).toEqual({ machineIds: ["add", "press", "row"], "plan.purpose": "Whole body" });
    expect(s.changes.map((c) => c.kind)).toEqual(["purpose"]);
  });
});

describe("saveChanges", () => {
  it("is a change when the machines or what it's for moved", () => {
    expect(saveChanges(A, ["add", "press", "row"], "")).toBe(false);
    expect(saveChanges(A, ["press", "add", "row"], "")).toBe(true);
    expect(saveChanges(A, ["add", "press", "row"], "Core")).toBe(true);
    expect(saveChanges(null, [], "")).toBe(false);
  });
});

describe("phasing in", () => {
  const phase = phasePlanOf({ base: A.machineIds, target: ["add", "curl", "row"], todayYmd: "2026-10-19", who });

  it("gives a B of swaps a plan of its own with the phase on it, B running the base", () => {
    const s = phaseSaveOf({ routine: swapB, clientId: "c1", studioId: "s1", trainerId: "t1", who, todayYmd: "2026-10-19", phase, machineIds: phase.base, starting: true, note: "Phase it in", isBActive: true });
    expect(s.fields.machineIds).toEqual(["add", "press", "row"]);
    expect((s.fields.plan as { phase: unknown; swaps?: unknown }).phase).toEqual(phase);
    expect((s.fields.plan as { swaps?: unknown }).swaps).toBeUndefined();
  });

  it("makes Routine B from the base when there is none, and turns B on", () => {
    const s = phaseSaveOf({ routine: null, clientId: "c1", studioId: "s1", trainerId: "t1", who, todayYmd: "2026-10-19", phase, machineIds: phase.base, starting: true, note: "Phase it in", isBActive: false });
    expect(s.routineId).toBeNull();
    expect(s.fields).toMatchObject({ name: "Routine B", machineIds: ["add", "press", "row"] });
    expect(s.turnB).toBe(true);
  });

  it("writes only the phase and the machines on B's own plan, with the step's words", () => {
    const own: Routine = { ...swapB, machineIds: ["add", "press", "row"], plan: { purpose: "", intended: [], building: false, madeByUid: "u1", phase } };
    const ticked = tickedStep(phase, 0, true, who, "2026-10-20");
    const s = phaseSaveOf({ routine: own, clientId: "c1", studioId: "s1", trainerId: "t1", who, todayYmd: "2026-10-20", phase: ticked, machineIds: ["add", "curl", "row"], note: "Phasing in: Leg Curl for Leg Press", isBActive: true });
    expect(Object.keys(s.fields).sort()).toEqual(["machineIds", "plan.phase"]);
    expect(s.fields.machineIds).toEqual(["add", "curl", "row"]);
    expect(s.adjustment?.notes).toBe("Phasing in: Leg Curl for Leg Press");
  });

  it("writes no adjustment when only a week or an owner changed", () => {
    const own: Routine = { ...swapB, machineIds: ["add", "press", "row"], plan: { purpose: "", intended: [], building: false, madeByUid: "u1", phase } };
    const later = { ...phase, steps: phase.steps.map((st) => ({ ...st, ownerName: "Sarah" })) };
    expect(phaseSaveOf({ routine: own, clientId: "c1", studioId: "s1", trainerId: "t1", who, todayYmd: "2026-10-20", phase: later, machineIds: own.machineIds, note: "", isBActive: true }).adjustment).toBeNull();
  });

  it("never turns B back on from a tick, only when the plan starts", () => {
    const own: Routine = { ...swapB, machineIds: ["add", "press", "row"], plan: { purpose: "", intended: [], building: false, madeByUid: "u1", phase } };
    const ticked = tickedStep(phase, 0, true, who, "2026-10-20");
    expect(phaseSaveOf({ routine: own, clientId: "c1", studioId: "s1", trainerId: "t1", who, todayYmd: "2026-10-20", phase: ticked, machineIds: ["add", "curl", "row"], note: "", isBActive: false }).turnB).toBeNull();
  });
});

describe("phasing slot A in (the routine library round, Oct 23 2026)", () => {
  const planned: Routine = { ...A, plan: { purpose: "Core", intended: ["add", "press", "row"], building: false, madeByUid: "u0" } };
  const phase = phasePlanOf({ base: ["add", "press", "row"], target: ["add", "curl", "row"], todayYmd: "2026-10-19", who });
  const input = { routine: planned, routines: [planned], clientId: "c1", studioId: "s1", trainerId: "t1", who, todayYmd: "2026-10-19", isBActive: false, note: "Phasing in" };

  it("a start writes the plan alone, by its field path: A runs as it is", () => {
    const out = phaseSaveOfA({ ...input, phase, machineIds: planned.machineIds });
    expect(out.routine).toBeUndefined();
    expect(out.phase!.fields).toEqual({ "plan.phase": phase });
    expect(out.phase!.adjustment).toBeNull();
  });

  it("a tick is A's own save, its road kept, with the plan beside it", () => {
    const ticked = tickedStep(phase, 0, true, who, "2026-10-19");
    const out = phaseSaveOfA({ ...input, phase: ticked, machineIds: ["add", "curl", "row"] });
    expect(out.routine!.fields.machineIds).toEqual(["add", "curl", "row"]);
    const plan = (out.routine!.fields.plan ?? null) as { phase?: unknown; intended?: string[] } | null;
    if (plan) {
      expect(plan.phase).toEqual(ticked);
      expect(plan.intended).toContain("curl");
    } else expect(out.routine!.fields["plan.phase"]).toEqual(ticked);
  });
});

describe("how a planned routine starts at a studio", () => {
  const read = (value: number, source: "studio" | "company" | "app", loading = false, failed = false) =>
    switchOnWholeOf({ value: () => value, source: () => source, loading, failed } as never);
  it("switched on whole only where the studio allows it and the setting has answered", () => {
    expect(read(2, "studio")).toBe(true);
    expect(read(2, "company")).toBe(true);
    expect(read(1, "studio")).toBe(false);
    expect(read(2, "company", true)).toBe(false);
    expect(read(2, "company", false, true)).toBe(false);
  });
});
