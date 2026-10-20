import { describe, expect, it } from "vitest";
import { everyMachineDone, nextToDo } from "./next-machine";

const ids = ["m1", "m2", "m3", "m4", "m5", "m6"];
const doneOf = (...done: string[]) => (id: string) => done.includes(id);

describe("nextToDo", () => {
  it("is the next machine in the order while everything after is still to do", () => {
    expect(nextToDo(ids, "m2", doneOf())).toEqual({ id: "m3", wraps: false });
  });

  it("passes over machines already done", () => {
    expect(nextToDo(ids, "m2", doneOf("m3", "m4"))).toEqual({ id: "m5", wraps: false });
  });

  it("started at 5, finished 6: goes back round to the first machine not done (AJ, Oct 20 2026)", () => {
    expect(nextToDo(ids, "m6", doneOf("m5", "m6"))).toEqual({ id: "m1", wraps: true });
    expect(nextToDo(ids, "m6", doneOf("m1", "m5", "m6"))).toEqual({ id: "m2", wraps: true });
  });

  it("is nothing when every other machine is done, whatever the one in hand", () => {
    expect(nextToDo(ids, "m3", doneOf("m1", "m2", "m4", "m5", "m6"))).toBeNull();
    expect(nextToDo(ids, "m3", doneOf(...ids))).toBeNull();
  });

  it("with no machine in hand, is the first not done", () => {
    expect(nextToDo(ids, null, doneOf("m1"))).toEqual({ id: "m2", wraps: false });
    expect(nextToDo([], null, doneOf())).toBeNull();
  });
});

describe("everyMachineDone", () => {
  it("only when every machine in today's order is done, and never for an empty order", () => {
    expect(everyMachineDone(ids, doneOf(...ids))).toBe(true);
    expect(everyMachineDone(ids, doneOf("m1"))).toBe(false);
    expect(everyMachineDone([], doneOf())).toBe(false);
  });
});
