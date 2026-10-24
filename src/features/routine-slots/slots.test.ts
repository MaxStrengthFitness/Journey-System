import { describe, expect, it } from "vitest";
import type { Routine } from "../../types";
import { matchesRoutineLetter, findRoutineByLetter } from "../../lib/routine-utils";
import { nextRoutine } from "../routines/next-routine";
import {
  distinctMachines,
  equipped,
  nameProblem,
  nextRoutineName,
  resolvedSlots,
  retiredOf,
  slotRoutine,
  slotsOf,
  slotsPatch,
  stashOf,
  stashedName,
  withSlots,
} from "./slots";

const r = (id: string, name: string, extra: Partial<Routine> = {}): Routine => ({ id, name, clientId: "c1", machineIds: [], ...extra });

describe("slotsOf", () => {
  it("keeps string ids and nulls, nothing else", () => {
    expect(slotsOf(undefined)).toBeNull();
    expect(slotsOf([])).toBeNull();
    expect(slotsOf({})).toBeNull();
    expect(slotsOf({ a: "x", b: null })).toEqual({ a: "x", b: null });
    expect(slotsOf({ a: 3, b: " " })).toBeNull();
    expect(slotsOf({ b: "y" })).toEqual({ b: "y" });
  });
});

describe("resolvedSlots", () => {
  const routines = [r("1", "Routine A"), r("2", "Routine B"), r("3", "Post-surgery")];

  it("reads by name with no slots: nothing changes the day this ships", () => {
    expect(resolvedSlots(routines, undefined)).toEqual({ a: "1", b: "2" });
    expect(resolvedSlots([r("1", "a"), r("2", " B ")], undefined)).toEqual({ a: "1", b: "2" });
  });

  it("reads the slot's id when written", () => {
    expect(resolvedSlots(routines, { a: "3", b: "2" })).toEqual({ a: "3", b: "2" });
  });

  it("an empty or unknown slot holds the routine named for it, so older writers still land", () => {
    expect(resolvedSlots([r("3", "Post-surgery"), r("9", "Routine B")], { a: "3", b: null })).toEqual({ a: "3", b: "9" });
    expect(resolvedSlots([r("3", "Post-surgery")], { a: "3", b: null })).toEqual({ a: "3", b: null });
    expect(resolvedSlots(routines, { a: "gone", b: "2" })).toEqual({ a: "1", b: "2" });
  });

  it("never a retired routine, never one routine in both", () => {
    expect(resolvedSlots([r("1", "Routine A", { archived: true })], { a: "1" })).toEqual({ a: null, b: null });
    expect(resolvedSlots(routines, { a: "3", b: "3" })).toEqual({ a: "3", b: "2" });
  });

  it("ignores the profile's temp stand-ins", () => {
    expect(resolvedSlots([r("temp-a", "Routine A")], undefined)).toEqual({ a: null, b: null });
  });
});

describe("withSlots and matchesRoutineLetter", () => {
  it("a renamed routine is still A, and the slot answers before the name", () => {
    const list = withSlots([r("3", "Post-surgery"), r("1", "Routine A · until Oct 23 2026"), r("2", "Routine B")], { a: "3", b: "2" });
    expect(list.map((x) => x.inSlot)).toEqual(["A", null, "B"]);
    expect(findRoutineByLetter(list, "A")?.id).toBe("3");
    expect(matchesRoutineLetter(list[1], "A")).toBe(false);
  });

  it("with no slots, the list is read by name and a stray inSlot is taken off", () => {
    const list = withSlots([r("1", "Routine A", { inSlot: null })], undefined);
    expect(list[0].inSlot).toBeUndefined();
    expect(matchesRoutineLetter(list[0], "A")).toBe(true);
  });

  it("the session's alternation reads the slots", () => {
    const list = withSlots([r("3", "Strength"), r("4", "Upper")], { a: "3", b: "4" });
    expect(nextRoutine(list, "3", true)?.id).toBe("4");
    expect(nextRoutine(list, "4", true)?.id).toBe("3");
    expect(nextRoutine(list, "4", false)?.id).toBe("3");
  });
});

describe("the stash", () => {
  const routines = [r("1", "Zeta"), r("2", "Alpha"), r("3", "Mid", { archived: true }), r("4", "Routine A")];
  it("is every routine not in a slot and not retired, by name", () => {
    expect(stashOf(routines, { a: "4", b: null }).map((x) => x.id)).toEqual(["2", "1"]);
    expect(retiredOf(routines).map((x) => x.id)).toEqual(["3"]);
    expect(slotRoutine(routines, { a: "4" }, "a")?.id).toBe("4");
  });
});

describe("equipped", () => {
  it("puts a routine in a slot, swapping one from the other slot", () => {
    expect(equipped({ a: "1", b: "2" }, "a", "3")).toEqual({ a: "3", b: "2" });
    expect(equipped({ a: "1", b: "2" }, "a", "2")).toEqual({ a: "2", b: "1" });
    expect(equipped({ a: "1", b: "2" }, "b", null)).toEqual({ a: "1", b: null });
  });
  it("never empties slot A", () => {
    expect(equipped({ a: "1", b: "2" }, "a", null)).toEqual({ a: "1", b: "2" });
  });
});

describe("slotsPatch", () => {
  const routines = [r("1", "Routine A"), r("2", "Routine B"), r("3", "New")];
  it("the first save pins both slots, by field path", () => {
    expect(slotsPatch(undefined, routines, { a: "3", b: "2" }, true)).toEqual({ "routineSlots.a": "3", "routineSlots.b": "2" });
  });
  it("afterwards only what differs, with the B switch mirrored", () => {
    expect(slotsPatch({ a: "1", b: "2" }, routines, { a: "1", b: null }, true)).toEqual({ "routineSlots.b": null, isRoutineBActive: false });
    expect(slotsPatch({ a: "1", b: null }, routines, { a: "1", b: "3" }, false)).toEqual({ "routineSlots.b": "3", isRoutineBActive: true });
    expect(slotsPatch({ a: "1", b: "2" }, routines, { a: "1", b: "2" }, true)).toEqual({});
  });
});

describe("names", () => {
  it("a new routine is Routine 1, 2 … the first not taken", () => {
    expect(nextRoutineName([r("1", "Routine A"), r("2", "routine 1")])).toBe("Routine 2");
  });
  it("a name is unique per client", () => {
    expect(nameProblem("  ", [])).toMatch(/name/);
    expect(nameProblem("Upper", [r("1", "upper")])).toMatch(/already/);
    expect(nameProblem("Upper", [r("1", "upper")], "1")).toBeNull();
  });
  it("a letter-named routine leaving its slot takes a dated name", () => {
    expect(stashedName(r("1", "Routine A"), "2026-10-23")).toBe("Routine A · until Oct 23 2026");
    expect(stashedName(r("1", "b"), "2026-01-05")).toBe("Routine B · until Jan 5 2026");
    expect(stashedName(r("1", "Strength"), "2026-10-23")).toBeNull();
  });
});

describe("distinctMachines", () => {
  it("counts a machine in A and B once (13 vs 11)", () => {
    expect(distinctMachines(["m1", "m2", "m3"], ["m2", "m4"])).toEqual(["m1", "m2", "m3", "m4"]);
  });
});
