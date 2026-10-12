import { describe, expect, it } from "vitest";
import { planStateOf, PLAN_WORDS } from "./states";

const base = { enabled: true, loading: false, failed: false, exists: true, fromCache: false, usable: true };

describe("the four states of a layout read", () => {
  it("is off when not asked for", () => {
    expect(planStateOf({ ...base, enabled: false })).toBe("off");
  });

  it("a failed read wins, then loading", () => {
    expect(planStateOf({ ...base, failed: true, loading: true })).toBe("unreadable");
    expect(planStateOf({ ...base, loading: true })).toBe("loading");
  });

  it("no document, from the cache alone, is still loading; from the server it is none", () => {
    expect(planStateOf({ ...base, exists: false, fromCache: true })).toBe("loading");
    expect(planStateOf({ ...base, exists: false, fromCache: false })).toBe("empty");
  });

  it("a document that can't be read is unreadable, never none; a cached one that can is ready", () => {
    expect(planStateOf({ ...base, usable: false })).toBe("unreadable");
    expect(planStateOf({ ...base, fromCache: true })).toBe("ready");
  });

  it("says each in words", () => {
    expect(PLAN_WORDS).toEqual({ loading: "Loading the layout…", unreadable: "Can't show the layout right now.", empty: "No layout yet." });
  });
});
