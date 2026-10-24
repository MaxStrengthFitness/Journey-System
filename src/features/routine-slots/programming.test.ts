import { describe, expect, it } from "vitest";
import type { Routine } from "../../types";
import { savedRoutineA } from "../routine-plan/ui/host";
import { activeCantDo } from "../routine-plan/cant-do";
import { movesProgramming, programmingFromPlan, programmingOf, withProgramming } from "./programming";
import { withSlots } from "./slots";

const T = "2026-10-23";
const knee = { machineId: "m-leg-press", reason: "Surgery", until: "2027-03-01", day: T, byUid: "u-sam" } as const;
const plan = (extra: Partial<NonNullable<Routine["plan"]>> = {}) =>
  ({ purpose: "", intended: ["m-leg-press", "m-row"], building: false, madeByUid: "u0", ...extra }) as NonNullable<Routine["plan"]>;
const r = (id: string, name: string, extra: Partial<Routine> = {}): Routine => ({ id, name, clientId: "mary", machineIds: ["m-leg-press", "m-row"], ...extra });

describe("Mary's knee follows her, whatever is equipped (AJ: 1 yes)", () => {
  it("lays the client's marks onto the routine in slot A, so every reader of Routine A's plan sees them", () => {
    const strength = r("s", "Strength", { plan: plan({ cantDo: [{ ...knee }] }) });
    const post = r("p", "Post-surgery"); // copied from a template: no plan of its own
    const list = withSlots([strength, post], { a: "p", b: null }, { cantDo: [{ ...knee }], focus: ["delts"] });
    const a = savedRoutineA(list)!;
    expect(a.id).toBe("p");
    expect(activeCantDo(a.plan, T).map((c) => c.machineId)).toEqual(["m-leg-press"]);
    expect(a.plan?.focus).toEqual(["delts"]);
    // The stashed routine keeps its own plan untouched.
    expect(list.find((x) => x.id === "s")!.plan?.cantDo).toHaveLength(1);
  });

  it("with no document yet (or still reading), Routine A's own marks, as before", () => {
    const strength = r("s", "Routine A", { plan: plan({ cantDo: [{ ...knee }] }) });
    expect(withSlots([strength], undefined, null)[0]).toBe(strength);
    expect(withSlots([strength], undefined, undefined)[0]).toBe(strength);
  });

  it("the document is the answer: a mark reopened elsewhere is gone, a routine's own road fields kept", () => {
    const own = { ...knee, replacedBy: ["m-leg-ext"], onRoad: true, until: "cleared" };
    const strength = r("s", "Routine A", { plan: plan({ cantDo: [own, { machineId: "m-row", until: "cleared", day: T, byUid: "u0" }] }) });
    const out = withProgramming(strength, { cantDo: [{ ...knee }], focus: [] });
    expect(out.plan!.cantDo).toEqual([{ ...own, until: "2027-03-01" }]);
  });

  it("a mark carried to a routine that never held it has no road fields", () => {
    const out = withProgramming(r("p", "Post-surgery"), { cantDo: [{ ...knee, replacedBy: ["x"], onRoad: true, dayOneAt: 2 }], focus: [] });
    expect(out.plan!.cantDo).toEqual([{ ...knee }]);
    expect(out.plan!.intended).toEqual(["m-leg-press", "m-row"]);
  });

  it("nothing to lay on a plan-less routine is no change", () => {
    const post = r("p", "Post-surgery");
    expect(withProgramming(post, { cantDo: [], focus: [] })).toBe(post);
  });
});

describe("the document read and written", () => {
  it("reads back only usable marks, once each", () => {
    expect(programmingOf(null)).toBeNull();
    expect(programmingOf({ cantDo: [knee, knee, { machineId: 3 }], focus: ["delts", "delts", 7] })).toEqual({ cantDo: [knee], focus: ["delts"] });
  });
  it("is written from slot A's plan when a change moves the marks or the focus", () => {
    expect(movesProgramming({ kind: "cantdo" })).toBe(true);
    expect(movesProgramming({ kind: "add" }, [{ kind: "focus" }])).toBe(true);
    expect(movesProgramming({ kind: "reorder" })).toBe(false);
    expect(programmingFromPlan(plan({ cantDo: [{ ...knee }], focus: ["delts"] }))).toEqual({ cantDo: [knee], focus: ["delts"] });
    expect(programmingFromPlan(undefined)).toEqual({ cantDo: [], focus: [] });
  });
});
