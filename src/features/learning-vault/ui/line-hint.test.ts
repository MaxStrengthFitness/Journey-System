// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetPersonalMemory } from "../../sign-out/memory";
import { LINE_HINT_KEY, lineHintSeen, markLineHintSeen, resetLineHint, subscribeLineHint } from "./line-hint";

beforeEach(() => {
  localStorage.clear();
  resetLineHint();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the one hint that a line can be tapped", () => {
  it("is unseen until the reader chooses a line, then seen everywhere at once and on this iPad", () => {
    const heard = vi.fn();
    const stop = subscribeLineHint(heard);
    expect(lineHintSeen()).toBe(false);
    markLineHintSeen();
    expect(lineHintSeen()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LINE_HINT_KEY)).toBe("seen");
    // Once is enough: a second choice says nothing new.
    markLineHintSeen();
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });

  it("reads what this iPad remembers", () => {
    localStorage.setItem(LINE_HINT_KEY, "seen");
    resetLineHint();
    expect(lineHintSeen()).toBe(true);
  });

  it("is forgotten at sign-out: the next person on the iPad has not tapped a line", () => {
    markLineHintSeen();
    localStorage.clear(); // sign-out clears Journey's keys (features/sign-out)
    forgetPersonalMemory();
    expect(lineHintSeen()).toBe(false);
  });

  it("blocked storage remembers for this visit only, and never throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    resetLineHint();
    expect(lineHintSeen()).toBe(false);
    expect(() => markLineHintSeen()).not.toThrow();
    expect(lineHintSeen()).toBe(true);
  });
});
