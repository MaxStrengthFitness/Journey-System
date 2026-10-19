import { describe, expect, it } from "vitest";
import { copiedAIntoB, differs, laidFrom, markOf, markWords, moved, sameList, takenOut, tapFloor } from "./builder";

describe("tapFloor", () => {
  const d = { a: ["pull", "row"], b: ["pull"] };

  it("into A: adds to the end, or takes out when it is there", () => {
    expect(tapFloor(d, "press", "A")).toEqual({ a: ["pull", "row", "press"], b: ["pull"] });
    expect(tapFloor(d, "row", "A")).toEqual({ a: ["pull"], b: ["pull"] });
  });

  it("into B: never touches A", () => {
    expect(tapFloor(d, "row", "B")).toEqual({ a: ["pull", "row"], b: ["pull", "row"] });
    expect(tapFloor(d, "pull", "B")).toEqual({ a: ["pull", "row"], b: [] });
  });

  it("into both: one tap puts it in both, and a machine in both leaves both", () => {
    expect(tapFloor(d, "row", "both")).toEqual({ a: ["pull", "row"], b: ["pull", "row"] });
    expect(tapFloor(d, "press", "both")).toEqual({ a: ["pull", "row", "press"], b: ["pull", "press"] });
    expect(tapFloor(d, "pull", "both")).toEqual({ a: ["row"], b: [] });
  });
});

describe("marks", () => {
  const d = { a: ["pull", "row"], b: ["pull", "curl"] };
  it("says which routines hold a machine", () => {
    expect(markOf(d, "pull")).toBe("AB");
    expect(markOf(d, "row")).toBe("A");
    expect(markOf(d, "curl")).toBe("B");
    expect(markOf(d, "press")).toBeNull();
    expect(markWords("AB")).toBe("In Routine A and Routine B");
    expect(markWords(null)).toBeNull();
  });
});

describe("a routine's order", () => {
  it("moves one place and stops at either end", () => {
    expect(moved(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(takenOut(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("copy and lay", () => {
  it("copies A into B", () => {
    expect(copiedAIntoB({ a: ["x", "y"], b: ["z"] })).toEqual({ a: ["x", "y"], b: ["x", "y"] });
  });

  it("lays a routine into the target only, without repeats", () => {
    const d = { a: ["x"], b: ["y"] };
    expect(laidFrom(d, ["p", "q", "p"], "A")).toEqual({ a: ["p", "q"], b: ["y"] });
    expect(laidFrom(d, ["p"], "B")).toEqual({ a: ["x"], b: ["p"] });
    expect(laidFrom(d, ["p"], "both")).toEqual({ a: ["p"], b: ["p"] });
  });

  it("knows when A and B differ", () => {
    expect(differs({ a: ["x", "y"], b: ["x", "y"] })).toBe(false);
    expect(differs({ a: ["x", "y"], b: ["y", "x"] })).toBe(true);
    expect(sameList([], [])).toBe(true);
  });
});
