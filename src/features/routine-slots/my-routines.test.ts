import { describe, expect, it } from "vitest";
import type { RoutinePreset } from "../../types";
import { drawerTemplates } from "../../lib/routine-templates";
import { myRoutineDoc, myRoutineFromClientRoutine, myRoutineNameProblem, myRoutinesFromDocs, ownRoutinesOf } from "./my-routines";

const p = (id: string, extra: Partial<RoutinePreset> = {}): RoutinePreset => ({
  id,
  name: id,
  machineIds: ["m1"],
  scope: "westlake",
  tier: "trainer",
  studioId: "westlake",
  ...extra,
});

describe("a trainer's own routines (AJ: save them on their profile)", () => {
  it("are the trainer-tier presets carrying their uid, by name", () => {
    const list = [p("z", { ownerUid: "u1", name: "Zed" }), p("a", { ownerUid: "u1", name: "Alpha" }), p("x", { ownerUid: "u2" }), p("old")];
    expect(ownRoutinesOf(list, "u1").map((r) => r.id)).toEqual(["a", "z"]);
    expect(ownRoutinesOf(list, null)).toEqual([]);
  });

  it("are never in the studio's list: another trainer's stays theirs, an older studio preset stays the studio's", () => {
    const listed = drawerTemplates([p("mine", { ownerUid: "u1" }), p("theirs", { ownerUid: "u2" }), p("old")], "westlake", []);
    expect(listed.studio.map((r) => r.id)).toEqual(["old"]);
  });

  it("read back through the one normaliser, keeping the owner", () => {
    const read = myRoutinesFromDocs([{ id: "r1", data: { name: "Mine", machineIds: ["m1"], tier: "trainer", scope: "westlake", ownerUid: "u1" } }], "u1");
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ id: "r1", ownerUid: "u1", tier: "trainer" });
  });

  it("write the trainer's uid, the studio's scope, and nothing undefined", () => {
    const d = myRoutineDoc({ name: "  Upper  ", machineIds: ["a", "a", "b"] }, { uid: "u1", name: "Sam" }, "westlake");
    expect(d).toEqual({
      name: "Upper",
      description: "",
      machineIds: ["a", "b"],
      machineNotes: {},
      scope: "westlake",
      tier: "trainer",
      studioId: "westlake",
      ownerUid: "u1",
      createdBy: "u1",
      createdByName: "Sam",
    });
    expect(Object.values(d).some((v) => v === undefined)).toBe(false);
  });

  it("a name is unique among the trainer's own", () => {
    expect(myRoutineNameProblem("", [])).toMatch(/name/);
    expect(myRoutineNameProblem("Upper", [p("1", { name: "upper" })])).toMatch(/already/);
    expect(myRoutineNameProblem("Upper", [p("1", { name: "upper" })], "1")).toBeNull();
  });

  it("a client's routine saved as the trainer's own keeps its machines, notes and what it's for", () => {
    expect(
      myRoutineFromClientRoutine({ name: "Strength", machineIds: ["a"], machineNotes: { a: "slow" }, plan: { purpose: "Whole body", intended: [], building: false, madeByUid: "u" } }),
    ).toEqual({ name: "Strength", machineIds: ["a"], description: "Whole body", machineNotes: { a: "slow" } });
  });
});
