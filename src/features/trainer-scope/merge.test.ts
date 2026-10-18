import { describe, expect, it } from "vitest";
import { inListOrder, mergeAnswers } from "./merge";

const doc = (id: string, over: Record<string, unknown> = {}) => ({ id, ...over });

describe("mergeAnswers", () => {
  it("is nothing until every listener has answered once, and nothing with no listeners", () => {
    expect(mergeAnswers([])).toBeNull();
    expect(mergeAnswers([{ docs: [doc("a")], fromCache: false }, null])).toBeNull();
    expect(mergeAnswers([null, null])).toBeNull();
  });

  it("merges the answers into one list, one entry per id", () => {
    const merged = mergeAnswers([
      { docs: [doc("a", { n: 1 }), doc("b")], fromCache: false },
      { docs: [doc("a", { n: 2 }), doc("c")], fromCache: false },
    ]);
    expect(merged?.docs.map((d) => d.id)).toEqual(["a", "b", "c"]);
    // The later listener's copy of a shared id wins.
    expect((merged?.docs[0] as { n?: number }).n).toBe(2);
  });

  it("is from the cache while any listener still is", () => {
    const cacheAndServer = [
      { docs: [doc("a")], fromCache: true },
      { docs: [doc("b")], fromCache: false },
    ];
    expect(mergeAnswers(cacheAndServer)?.fromCache).toBe(true);
    expect(mergeAnswers(cacheAndServer.map((a) => ({ ...a, fromCache: false })))?.fromCache).toBe(false);
  });

  it("an empty answer still counts as an answer (a studio with no guests)", () => {
    const merged = mergeAnswers([{ docs: [doc("a")], fromCache: false }, { docs: [], fromCache: false }]);
    expect(merged?.docs.map((d) => d.id)).toEqual(["a"]);
    expect(merged?.fromCache).toBe(false);
  });
});

describe("inListOrder", () => {
  it("sorts by order, then by name, and leaves the input alone", () => {
    const input = [
      { id: "c", fullName: "Cara", order: 2 },
      { id: "a", fullName: "Avi" },
      { id: "b", fullName: "Ben", order: 1 },
      { id: "d", fullName: "Dee", order: 2 },
    ];
    expect(inListOrder(input).map((t) => t.id)).toEqual(["b", "c", "d", "a"]);
    expect(input.map((t) => t.id)).toEqual(["c", "a", "b", "d"]);
  });
});
