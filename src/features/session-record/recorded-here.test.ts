// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  RECORDED_HERE_KEY,
  RECORDED_HERE_MAX,
  RECORDED_HERE_MS,
  markRecordedHere,
  readMarks,
  unmarkRecordedHere,
  wasRecordedHere,
  type MarkStore,
} from "./recorded-here";
import { forgetPersonalMemory } from "../sign-out/memory";

function store(): MarkStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const T = Date.parse("2026-10-17T14:00:00-04:00");

describe("sessions this iPad recorded from their Start (F22)", () => {
  it("a session started here is marked; one that arrived another way is not", () => {
    const s = store();
    markRecordedHere("s1", T, s);
    expect(wasRecordedHere("s1", T + 60_000, s)).toBe(true);
    expect(wasRecordedHere("s2", T + 60_000, s)).toBe(false);
  });

  it("turning to watching it takes the mark off, so a Continue here waits for the server", () => {
    const s = store();
    markRecordedHere("s1", T, s);
    markRecordedHere("s2", T, s);
    unmarkRecordedHere("s1", T, s);
    expect(wasRecordedHere("s1", T, s)).toBe(false);
    expect(wasRecordedHere("s2", T, s)).toBe(true);
    unmarkRecordedHere("s2", T, s);
    expect(s.data.has(RECORDED_HERE_KEY)).toBe(false);
  });

  it("a mark lasts twelve hours", () => {
    const s = store();
    markRecordedHere("s1", T, s);
    expect(wasRecordedHere("s1", T + RECORDED_HERE_MS - 1, s)).toBe(true);
    expect(wasRecordedHere("s1", T + RECORDED_HERE_MS, s)).toBe(false);
  });

  it("keeps the newest marks only", () => {
    const s = store();
    for (let i = 0; i < RECORDED_HERE_MAX + 5; i += 1) markRecordedHere(`s${i}`, T + i, s);
    expect(wasRecordedHere("s0", T + 100, s)).toBe(false);
    expect(wasRecordedHere(`s${RECORDED_HERE_MAX + 4}`, T + 100, s)).toBe(true);
    expect(readMarks(s.data.get(RECORDED_HERE_KEY) ?? null, T + 100)).toHaveLength(RECORDED_HERE_MAX);
  });

  it("anything unreadable, or a storage that refuses, is no mark: the session waits for the server", () => {
    expect(readMarks("{not json", T)).toEqual([]);
    expect(readMarks(JSON.stringify({ id: "s1" }), T)).toEqual([]);
    expect(readMarks(JSON.stringify([{ id: "s1", at: "yesterday" }, { id: "", at: T }]), T)).toEqual([]);
    const refusing: MarkStore = {
      getItem: () => {
        throw new Error("refused");
      },
      setItem: () => {
        throw new Error("refused");
      },
      removeItem: () => {},
    };
    expect(() => markRecordedHere("s1", T, refusing)).not.toThrow();
    expect(wasRecordedHere("s1", T, refusing)).toBe(false);
    expect(wasRecordedHere("s1", T, null)).toBe(false);
    expect(wasRecordedHere(null, T, store())).toBe(false);
  });

  it("a sign-out forgets every mark", () => {
    localStorage.clear();
    markRecordedHere("s1");
    expect(wasRecordedHere("s1")).toBe(true);
    forgetPersonalMemory();
    expect(wasRecordedHere("s1")).toBe(false);
    expect(localStorage.getItem(RECORDED_HERE_KEY)).toBeNull();
  });
});
