import { describe, expect, it, vi } from "vitest";
import { toVaultBlocks } from "./blocks";
import { makeNote, makeStrike } from "./markup";
import { createSandboxStore } from "./markup-store";
import type { LearningSubmission, StudioMarkup } from "./types";

const SAM = { uid: "uid-sam", name: "Sam Lee" };
const AT = "2026-10-19T14:00:00.000Z";
const BASE = { studioId: "solon", studioName: "Solon", targetKey: "machine:m-leg-press", title: "Leg Press" };
const [abd, crawl] = toVaultBlocks([
  { kind: "line", text: "Consider doing ABD prior to LP to pre-fatigue glutes and improve sensation of glute engagement." },
  { kind: "cue", text: "Crawl" },
]);

const sub = (id: string, status: LearningSubmission["status"] = "pending"): LearningSubmission => ({
  id,
  intent: "dispute",
  ref: { kind: "machine", id: "m-leg-press" },
  targetKey: "machine:m-leg-press",
  targetTitle: "Leg Press",
  body: "Academy 6.1 says the opposite.",
  studioId: "solon",
  studioName: "Solon",
  by: SAM,
  at: AT,
  status,
});

describe("createSandboxStore", () => {
  it("starts empty", () => {
    const store = createSandboxStore();
    expect(store.markupFor("solon", "machine:m-leg-press")).toBeNull();
    expect(store.allMarkup()).toEqual([]);
    expect(store.submissions()).toEqual([]);
    expect(store.version()).toBe(0);
  });

  it("crosses out and puts back, telling its listeners each time", () => {
    const store = createSandboxStore();
    const told = vi.fn();
    store.subscribe(told);
    store.strike(BASE, makeStrike(abd, { reason: "No Abduction here." }, SAM, AT));
    const m = store.markupFor("solon", "machine:m-leg-press");
    expect(m?.strikes.map((s) => s.reason)).toEqual(["No Abduction here."]);
    expect(store.version()).toBe(1);
    store.unstrike("solon", "machine:m-leg-press", abd.key);
    expect(told).toHaveBeenCalledTimes(2);
    // Nothing left on the page: the document is gone, not empty.
    expect(store.markupFor("solon", "machine:m-leg-press")).toBeNull();
    expect(store.allMarkup()).toEqual([]);
  });

  it("hands back the same objects until something changes, and new ones after", () => {
    const store = createSandboxStore();
    store.strike(BASE, makeStrike(abd, { reason: "No Abduction here." }, SAM, AT));
    const before = store.markupFor("solon", "machine:m-leg-press");
    const allBefore = store.allMarkup();
    expect(store.markupFor("solon", "machine:m-leg-press")).toBe(before);
    expect(store.allMarkup()).toBe(allBefore);

    store.addNote({ ...BASE, targetKey: "academy-cueing", title: "Cueing phrasebook" }, makeNote(crawl, "Too short.", SAM, AT, "n1"));
    // The Leg Press did not change, so it is the same object; the list is new.
    expect(store.markupFor("solon", "machine:m-leg-press")).toBe(before);
    expect(store.allMarkup()).not.toBe(allBefore);
    expect(allBefore).toHaveLength(1);

    store.addNote(BASE, makeNote(abd, "Ask Sam.", SAM, AT, "n2"));
    const after = store.markupFor("solon", "machine:m-leg-press");
    expect(after).not.toBe(before);
    expect(before?.notes).toEqual([]);
    expect(after?.notes.map((n) => n.id)).toEqual(["n2"]);
  });

  it("does nothing, and tells nobody, when there is nothing to change", () => {
    const store = createSandboxStore();
    const told = vi.fn();
    store.subscribe(told);
    store.unstrike("solon", "machine:m-leg-press", abd.key);
    store.removeNote("solon", "machine:m-leg-press", "n1");
    store.decide("nope", "taken", { byName: "Head office", at: AT });
    store.strike(BASE, makeStrike(abd, { reason: "Ours." }, SAM, AT));
    told.mockClear();
    store.unstrike("solon", "machine:m-leg-press", crawl.key);
    store.removeNote("solon", "machine:m-leg-press", "n1");
    expect(told).not.toHaveBeenCalled();
    expect(store.version()).toBe(1);
  });

  it("keeps studios apart", () => {
    const store = createSandboxStore();
    store.strike(BASE, makeStrike(abd, { reason: "Ours." }, SAM, AT));
    store.strike({ ...BASE, studioId: "westlake", studioName: "westlake" }, makeStrike(abd, { reason: "Theirs." }, SAM, AT));
    expect(store.markupFor("solon", BASE.targetKey)?.strikes[0].reason).toBe("Ours.");
    expect(store.markupFor("westlake", BASE.targetKey)?.strikes[0].reason).toBe("Theirs.");
    expect(store.allMarkup()).toHaveLength(2);
  });

  it("removes one note and keeps the rest", () => {
    const store = createSandboxStore();
    store.addNote(BASE, makeNote(abd, "One.", SAM, AT, "n1"));
    store.addNote(BASE, makeNote(crawl, "Two.", SAM, AT, "n2"));
    store.removeNote("solon", BASE.targetKey, "n1");
    expect(store.markupFor("solon", BASE.targetKey)?.notes.map((n) => n.id)).toEqual(["n2"]);
  });

  it("takes submissions and decides them without touching the others", () => {
    const store = createSandboxStore({ submissions: [sub("s1"), sub("s2")] });
    const s2 = store.submissions()[1];
    store.decide("s1", "taken", { note: "  Agreed.  ", byName: "Head office", at: AT });
    expect(store.submissions()[0]).toMatchObject({ status: "taken", decision: { note: "Agreed.", byName: "Head office", at: AT } });
    expect(store.submissions()[1]).toBe(s2);
    store.decide("s2", "declined", { note: "", byName: "Head office", at: AT });
    expect(store.submissions()[1].decision).toEqual({ byName: "Head office", at: AT });
    store.submit(sub("s3"));
    expect(store.submissions().map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(store.version()).toBe(3);
  });

  it("folds a seed's documents for the same studio and page into one, and drops empty ones", () => {
    const seed: StudioMarkup[] = [
      { ...BASE, strikes: [makeStrike(abd, { reason: "First." }, SAM, AT)], notes: [] },
      { ...BASE, strikes: [makeStrike(abd, { reason: "Second." }, SAM, AT)], notes: [makeNote(crawl, "N.", SAM, AT, "n1")] },
      { ...BASE, targetKey: "academy-cueing", strikes: [], notes: [] },
    ];
    const store = createSandboxStore({ markup: seed });
    expect(store.allMarkup()).toHaveLength(1);
    const m = store.markupFor("solon", BASE.targetKey)!;
    expect(m.strikes.map((s) => s.reason)).toEqual(["Second."]);
    expect(m.notes.map((n) => n.id)).toEqual(["n1"]);
    expect(store.version()).toBe(0);
  });

  it("stops telling a listener once it unsubscribes", () => {
    const store = createSandboxStore();
    const told = vi.fn();
    const stop = store.subscribe(told);
    stop();
    store.submit(sub("s1"));
    expect(told).not.toHaveBeenCalled();
  });

  it("still tells the others when one listener throws", () => {
    const store = createSandboxStore();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const second = vi.fn();
    store.subscribe(() => {
      throw new Error("boom");
    });
    store.subscribe(second);
    store.submit(sub("s1"));
    expect(second).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
