import { describe, expect, it } from "vitest";
import {
  addChoices,
  addTo,
  lastTimeWords,
  moveTo,
  orderWarnings,
  putBack,
  swapChoices,
  swapIn,
  takeOut,
} from "./today-list";

/* A floor in its walking order, catalog ids, as the session's floor uses them. */
const floor = [
  { id: "m-hip-add", name: "Hip Adduction" },
  { id: "m-hip-abd", name: "Hip Abduction" },
  { id: "m-leg-press", name: "Leg Press" },
  { id: "m-ext", name: "Leg Extension" },
  { id: "m-compound-row", name: "Compound Row" },
  { id: "m-dip", name: "Seated Dip" },
  { id: "m-lumbar", name: "Lumbar" },
  { id: "m-pullover", name: "Seated Pullover" },
];
const nameOf = (id: string) => floor.find((m) => m.id === id)?.name ?? id;
const robbin = ["m-hip-add", "m-hip-abd", "m-leg-press", "m-compound-row", "m-dip", "m-lumbar"];

describe("last time, in words", () => {
  it("says weight and reps, or seconds for a timed set, and nothing when nothing is on file", () => {
    expect(lastTimeWords({ lastWeight: 154, lastReps: 8, lastUnit: "reps", lastDate: null })).toBe("154 lb · 8 reps");
    expect(lastTimeWords({ lastWeight: 140, lastReps: 90, lastUnit: "sec", lastDate: null })).toBe("140 lb · 90 sec");
    expect(lastTimeWords({ lastWeight: 52, lastReps: null, lastDate: null })).toBe("52 lb");
    expect(lastTimeWords({ lastWeight: null, lastReps: "", lastDate: null })).toBeNull();
    expect(lastTimeWords(undefined)).toBeNull();
  });
});

describe("+ Add a machine", () => {
  it("offers the rest of the floor in walking order, never one already on today's list", () => {
    const { next, rest } = addChoices({ today: robbin, floor });
    expect(next).toBeNull();
    expect(rest).toEqual(["m-ext", "m-pullover"]);
  });

  it("puts the plan's next machine first, once, and only when today doesn't have it", () => {
    expect(addChoices({ today: robbin, floor, nextInPlan: "m-pullover" })).toEqual({ next: "m-pullover", rest: ["m-ext"] });
    expect(addChoices({ today: robbin, floor, nextInPlan: "m-lumbar" }).next).toBeNull();
    // Not on this floor: not offered.
    expect(addChoices({ today: robbin, floor, nextInPlan: "m-neck" }).next).toBeNull();
  });

  it("never offers a machine the client can't do", () => {
    expect(addChoices({ today: robbin, floor, nextInPlan: "m-pullover", held: ["m-pullover"] })).toEqual({ next: null, rest: ["m-ext"] });
  });

  it("adds at the end, and never lists a machine twice", () => {
    expect(addTo(robbin, "m-pullover")).toEqual([...robbin, "m-pullover"]);
    expect(addTo(robbin, "m-lumbar")).toEqual(robbin);
  });
});

describe("Swap", () => {
  it("offers the Academy's substitutes this floor has, only the members not already running", () => {
    const { documented, rest } = swapChoices({ target: "m-leg-press", today: robbin, floor, nameOf });
    // Leg Press → Leg Extension + Hip Abduction + Lumbar: the last two already run, so Leg Extension goes in.
    expect(documented[0]).toEqual({ ids: ["m-ext"] });
    // The same machine set is offered once.
    expect(new Set(documented.map((d) => d.ids.join("+"))).size).toBe(documented.length);
    expect(rest).toEqual(["m-ext", "m-pullover"]);
  });

  it("puts Routine B's next swap first when it replaces this machine", () => {
    const next = { replaces: "m-compound-row", with: "m-pullover" };
    expect(swapChoices({ target: "m-compound-row", today: robbin, floor, nameOf, nextSwap: next }).planned).toBe("m-pullover");
    expect(swapChoices({ target: "m-leg-press", today: robbin, floor, nameOf, nextSwap: next }).planned).toBeNull();
  });

  it("keeps the swapped machine's place, and lists nothing twice", () => {
    expect(swapIn(robbin, "m-leg-press", ["m-ext"])).toEqual(["m-hip-add", "m-hip-abd", "m-ext", "m-compound-row", "m-dip", "m-lumbar"]);
    expect(swapIn(robbin, "m-leg-press", ["m-ext", "m-lumbar"])).toEqual(["m-hip-add", "m-hip-abd", "m-ext", "m-compound-row", "m-dip", "m-lumbar"]);
    expect(swapIn(robbin, "m-neck", ["m-ext"])).toEqual(robbin);
  });
});

describe("× and Undo", () => {
  it("takes a machine out in one tap, and Undo puts it back where it was", () => {
    const { next, undo } = takeOut(robbin, "m-leg-press");
    expect(next).toEqual(["m-hip-add", "m-hip-abd", "m-compound-row", "m-dip", "m-lumbar"]);
    expect(undo).toEqual({ id: "m-leg-press", at: 2 });
    expect(putBack(next, undo!)).toEqual(robbin);
  });

  it("Undo never lists a machine twice", () => {
    expect(putBack(robbin, { id: "m-leg-press", at: 2 })).toEqual(robbin);
  });
});

describe("Reorder", () => {
  it("moves one machine, and ignores a move off the list", () => {
    expect(moveTo(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveTo(["a", "b", "c"], 0, 5)).toEqual(["a", "b", "c"]);
  });
});

describe("the order rules, said without a tap", () => {
  it("names Lumbar straight into Leg Press, with a fix in this floor's ids", () => {
    const warnings = orderWarnings(["m-hip-add", "m-lumbar", "m-leg-press"], nameOf, floor);
    const lumbar = warnings.find((w) => w.title.includes("Lumbar"));
    expect(lumbar).toBeTruthy();
    expect(lumbar!.fix?.next.every((id) => floor.some((m) => m.id === id))).toBe(true);
    // A fix names a floor machine by its name, never its code.
    expect(lumbar!.fix?.label).not.toMatch(/\bLE\b/);
  });

  it("offers no fix that would bring in a machine this floor doesn't have", () => {
    const small = floor.filter((m) => m.id !== "m-ext");
    for (const w of orderWarnings(["m-lumbar", "m-leg-press"], nameOf, small)) {
      if (w.fix) expect(w.fix.next.every((id) => small.some((m) => m.id === id))).toBe(true);
    }
  });

  it("says nothing when the order breaks no rule", () => {
    expect(orderWarnings(["m-hip-add"], nameOf, floor)).toEqual([]);
  });
});
