import { describe, expect, it } from "vitest";
import { refreshEndChoices, setsHeardFor, setsWaitWords, SETS_WAIT_BUTTON } from "./sets-heard";

const none = () => false;

describe("setsHeardFor: Finish stamps from this iPad's copy only once it holds the session's sets (F22)", () => {
  it("the server answered for a window holding the session: heard, online or not", () => {
    const window = { ids: ["past-1", "s1"], state: "ready" as const };
    expect(setsHeardFor("s1", { window, recordedHere: none, online: true })).toBe("heard");
    expect(setsHeardFor("s1", { window, recordedHere: none, online: false })).toBe("heard");
  });

  it("every set typed here (the session started on this iPad): heard, even offline from the cache", () => {
    const window = { ids: ["s1"], state: "cache-only" as const };
    expect(setsHeardFor("s1", { window, recordedHere: (id) => id === "s1", online: false })).toBe("heard");
  });

  it("a resumed session the cache answered alone: online it is getting them, offline it waits", () => {
    const window = { ids: ["s1"], state: "cache-only" as const };
    expect(setsHeardFor("s1", { window, recordedHere: none, online: true })).toBe("getting");
    expect(setsHeardFor("s1", { window, recordedHere: none, online: false })).toBe("offline");
  });

  it("no answer yet, or a window that doesn't hold the session, is not heard", () => {
    expect(setsHeardFor("s1", { window: null, recordedHere: none, online: true })).toBe("getting");
    expect(setsHeardFor("s1", { window: { ids: ["other"], state: "ready" }, recordedHere: none, online: true })).toBe("getting");
  });

  it("a failed read says failed (Try again), never heard", () => {
    expect(setsHeardFor("s1", { window: { ids: ["s1"], state: "failed" }, recordedHere: none, online: true })).toBe("failed");
  });

  it("no session: nothing to stamp", () => {
    expect(setsHeardFor(null, { window: null, recordedHere: none, online: false })).toBe("heard");
  });
});

describe("refreshEndChoices: the no-count machines follow the sets as they arrive", () => {
  it("keeps every answer given, adds a new one at Skipped, drops one that turned out to have a count", () => {
    const prev = { a: "practice", b: "skipped" } as Record<string, "practice" | "skipped" | "not_reached">;
    expect(refreshEndChoices(prev, ["a", "c"], "skipped")).toEqual({ a: "practice", c: "skipped" });
  });

  it("unchanged comes back as the same object", () => {
    const prev = { a: "practice", b: "skipped" } as Record<string, "practice" | "skipped">;
    expect(refreshEndChoices(prev, ["a", "b"], "skipped")).toBe(prev);
    const empty = {} as Record<string, "skipped">;
    expect(refreshEndChoices(empty, [], "skipped")).toBe(empty);
  });
});

describe("the words while Finish waits", () => {
  it("one line per state, none once heard, and every set is said to be saved where it waits for a person", () => {
    expect(setsWaitWords("heard")).toBeNull();
    expect(setsWaitWords("getting")).toContain("Getting this session's sets");
    expect(setsWaitWords("offline")).toContain("offline");
    expect(setsWaitWords("offline")).toContain("Every set is saved.");
    expect(setsWaitWords("failed")).toContain("Try again");
    expect(setsWaitWords("failed")).toContain("Every set is saved.");
    expect(SETS_WAIT_BUTTON).toBe("Getting the sets…");
  });
});
