import { describe, expect, it } from "vitest";
import type { Routine } from "../../types";
import { addedForGood, plannedOf } from "./planned";

const who = { uid: "uid-sam", name: "Sam Lee" };
const T = "2026-10-23";
const plan = (intended: string[], extra: Partial<NonNullable<Routine["plan"]>> = {}) =>
  ({ purpose: "", intended, building: false, madeByUid: "u0", ...extra }) as NonNullable<Routine["plan"]>;

describe("plannedOf", () => {
  it("is the plan's road past what the routine runs now, in the road's order", () => {
    const r = { machineIds: ["leg-press", "row"], plan: plan(["leg-press", "row", "dip", "lumbar", "hip"]) };
    expect(plannedOf(r, T)).toEqual(["dip", "lumbar", "hip"]);
  });
  it("never a machine the client can't do while the mark holds", () => {
    const r = {
      machineIds: ["leg-press"],
      plan: plan(["leg-press", "dip"], { cantDo: [{ machineId: "dip", until: "cleared", at: T, byUid: "u0" }] as never }),
    };
    expect(plannedOf(r, T)).toEqual([]);
  });
  it("nothing without a plan", () => {
    expect(plannedOf({ machineIds: ["x"] }, T)).toEqual([]);
    expect(plannedOf(null, T)).toEqual([]);
  });
});

describe("addedForGood", () => {
  it("joins planned machines to the routine in the road's order, one signed add each, in one write", () => {
    const r = { machineIds: ["leg-press", "row"], plan: plan(["leg-press", "dip", "row", "lumbar"]) };
    const w = addedForGood(r, ["lumbar", "dip"], who, T)!;
    expect(w.machineIds).toEqual(["leg-press", "dip", "row", "lumbar"]);
    expect([w.change, ...(w.also ?? [])].map((c) => [c.kind, c.machineIds, c.byUid])).toEqual([
      ["add", ["lumbar"], "uid-sam"],
      ["add", ["dip"], "uid-sam"],
    ]);
  });
  it("nothing for a machine not planned, and nothing while Routine A is empty and day one runs", () => {
    expect(addedForGood({ machineIds: ["a"], plan: plan(["a", "b"]) }, ["z"], who, T)).toBeNull();
    expect(addedForGood({ machineIds: [], plan: plan(["a", "b"], { dayOne: ["a"] }) }, ["b"], who, T)).toBeNull();
  });
});
