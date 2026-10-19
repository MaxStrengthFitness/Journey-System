import { describe, expect, it } from "vitest";
import { toVaultBlocks } from "./blocks";
import { QUOTE_MAX } from "./markup";
import {
  BODY_MAX,
  BODY_MIN,
  PROPOSED_MAX,
  makeSubmission,
  queueGroups,
  signalSentence,
  strikeSignals,
  submissionProblems,
} from "./submissions";
import type { LearningSubmission, StudioMarkup, StudioStrike, VaultTarget } from "./types";

const JORDAN = { uid: "uid-jordan", name: "Jordan Park" };
const AT = "2026-10-19T14:00:00.000Z";
const LEG_PRESS: VaultTarget = { ref: { kind: "machine", id: "m-leg-press" }, key: "machine:m-leg-press", title: "Leg Press" };
const [knee] = toVaultBlocks([{ kind: "line", text: "Knee Replacement" }]);

describe("submissionProblems", () => {
  it("needs a few words, said for what the trainer is doing", () => {
    expect(submissionProblems({ intent: "dispute", body: "no" })).toEqual(["Say what is wrong with it, in a few words."]);
    expect(submissionProblems({ intent: "addition", body: " " })).toEqual(["Say what to add, in a few words."]);
    expect(submissionProblems({ intent: "dispute", body: "x".repeat(BODY_MIN) })).toEqual([]);
  });

  it("holds the words and the proposed wording to their ceilings", () => {
    expect(submissionProblems({ intent: "dispute", body: "x".repeat(BODY_MAX + 1) })).toEqual(["Keep it to 1,000 characters."]);
    expect(submissionProblems({ intent: "addition", body: "Add the Leg Press.", proposed: "y".repeat(PROPOSED_MAX + 1) })).toEqual([
      "Keep the wording to 600 characters.",
    ]);
    expect(submissionProblems({ intent: "addition", body: "Add the Leg Press.", proposed: "" })).toEqual([]);
  });
});

describe("makeSubmission", () => {
  it("quotes the line, credits the studio and person, and starts pending", () => {
    const s = makeSubmission(
      { intent: "dispute", body: "  Academy 6.1 says the opposite.  ", proposed: " After physical therapy. " },
      { target: LEG_PRESS, block: knee, studioId: "solon", studioName: "Solon", by: JORDAN },
      "sub-1",
      AT,
    );
    expect(s).toEqual({
      id: "sub-1",
      intent: "dispute",
      ref: LEG_PRESS.ref,
      targetKey: "machine:m-leg-press",
      targetTitle: "Leg Press",
      blockKey: knee.key,
      quote: "Knee Replacement",
      body: "Academy 6.1 says the opposite.",
      proposed: "After physical therapy.",
      studioId: "solon",
      studioName: "Solon",
      by: JORDAN,
      at: AT,
      status: "pending",
    });
  });

  it("about a whole page: no line, no quote, no empty proposed wording, never undefined", () => {
    const s = makeSubmission(
      { intent: "addition", body: "Add the Leg Press version.", proposed: "   " },
      { target: LEG_PRESS, studioId: "solon", studioName: "Solon", by: JORDAN },
      "sub-2",
      AT,
    );
    expect(s).not.toHaveProperty("blockKey");
    expect(s).not.toHaveProperty("quote");
    expect(s).not.toHaveProperty("proposed");
    expect(Object.values(s)).not.toContain(undefined);
  });

  it("quotes at most QUOTE_MAX of a long line", () => {
    const [long] = toVaultBlocks([{ kind: "para", text: "w ".repeat(QUOTE_MAX) }]);
    const s = makeSubmission({ intent: "dispute", body: "Too long." }, { target: LEG_PRESS, block: long, studioId: "s", studioName: "S", by: JORDAN }, "x", AT);
    expect(s.quote!.length).toBeLessThanOrEqual(QUOTE_MAX);
  });
});

describe("queueGroups", () => {
  const sub = (id: string, targetKey: string, at: string, status: LearningSubmission["status"] = "pending"): LearningSubmission => ({
    id,
    intent: "dispute",
    ref: { kind: "machine", id: targetKey },
    targetKey,
    targetTitle: `Page ${targetKey}`,
    body: "words",
    studioId: "solon",
    studioName: "Solon",
    by: JORDAN,
    at,
    status,
  });

  it("puts a page with something waiting first, newest inside", () => {
    const groups = queueGroups([
      sub("a1", "a", "2026-10-19T10:00:00.000Z", "taken"),
      sub("b1", "b", "2026-10-15T10:00:00.000Z"),
      sub("b2", "b", "2026-10-17T10:00:00.000Z", "declined"),
      sub("c1", "c", "2026-10-18T10:00:00.000Z"),
    ]);
    expect(groups.map((g) => g.targetKey)).toEqual(["c", "b", "a"]);
    expect(groups[1].items.map((s) => s.id)).toEqual(["b2", "b1"]);
    expect(groups[1].ref).toEqual({ kind: "machine", id: "b" });
  });

  it("is empty for nothing", () => {
    expect(queueGroups([])).toEqual([]);
  });

  it("takes the group's title from its newest submission", () => {
    const old = { ...sub("x1", "x", "2026-10-10T10:00:00.000Z"), targetTitle: "Old name" };
    const fresh = { ...sub("x2", "x", "2026-10-18T10:00:00.000Z"), targetTitle: "New name" };
    expect(queueGroups([old, fresh])[0].targetTitle).toBe("New name");
  });
});

describe("strikeSignals", () => {
  const strike = (blockKey: string, reason: string, at: string, text = "The line."): StudioStrike => ({
    blockKey,
    originalText: text,
    reason,
    by: { uid: "u", name: "Sam Lee" },
    at,
  });
  const doc = (studioId: string, studioName: string, targetKey: string, strikes: StudioStrike[]): StudioMarkup => ({
    studioId,
    studioName,
    targetKey,
    title: targetKey === "machine:m-leg-press" ? "Leg Press" : "Cueing phrasebook",
    strikes,
    notes: [],
  });

  const all = [
    doc("west", "West", "machine:m-leg-press", [strike("b-1", "Not ours.", "2026-10-12T10:00:00.000Z")]),
    doc("east", "East", "machine:m-leg-press", [strike("b-1", "Routine B.", "2026-10-13T10:00:00.000Z"), strike("b-2", "Other.", "2026-10-13T11:00:00.000Z")]),
    doc("north", "North", "machine:m-leg-press", [{ ...strike("b-1", "No machine.", "2026-10-14T10:00:00.000Z"), replacement: "We skip it." }]),
    doc("demo-studio", "Demo Mode", "machine:m-leg-press", [strike("b-1", "Practice.", "2026-10-15T10:00:00.000Z")]),
    doc("north", "North", "academy-cueing", [strike("b-1", "Same key, other page.", "2026-10-16T10:00:00.000Z")]),
  ];

  it("counts the studios that crossed out the same line on the same page, most first", () => {
    const signals = strikeSignals(all);
    expect(signals.map((s) => `${s.targetKey} ${s.blockKey} ${s.studios.length}`)).toEqual([
      "machine:m-leg-press b-1 3",
      "academy-cueing b-1 1",
      "machine:m-leg-press b-2 1",
    ]);
  });

  it("lists the studios by name, each with its own reason, and leaves Demo Mode out", () => {
    const [top] = strikeSignals(all);
    expect(top.studios.map((s) => s.studioName)).toEqual(["East", "North", "West"]);
    expect(top.studios.map((s) => s.reason)).toEqual(["Routine B.", "No machine.", "Not ours."]);
    expect(top.studios[1].replacement).toBe("We skip it.");
    expect(top.studios[0]).not.toHaveProperty("replacement");
    expect(top.studios.some((s) => s.studioId === "demo-studio")).toBe(false);
    expect(top.targetTitle).toBe("Leg Press");
  });

  it("counts a studio once per line", () => {
    const twice = [doc("east", "East", "machine:m-leg-press", [strike("b-1", "One.", AT)]), doc("east", "East", "machine:m-leg-press", [strike("b-1", "Two.", AT)])];
    expect(strikeSignals(twice)[0].studios).toHaveLength(1);
  });

  it("is empty with nothing crossed out", () => {
    expect(strikeSignals([])).toEqual([]);
    expect(strikeSignals([doc("east", "East", "academy-cueing", [])])).toEqual([]);
  });
});

describe("signalSentence", () => {
  const signal = (n: number) => ({
    targetKey: "t",
    targetTitle: "T",
    blockKey: "b-1",
    quote: "q",
    studios: Array.from({ length: n }, (_, i) => ({ studioId: `s${i}`, studioName: `S${i}`, reason: "r", at: AT })),
  });

  it("says the count as a sentence", () => {
    expect(signalSentence(signal(1))).toBe("Crossed out at 1 studio");
    expect(signalSentence(signal(3))).toBe("Crossed out at 3 studios");
    expect(signalSentence(signal(4))).toBe("Crossed out at 4 studios");
  });

  it("says it out of every studio when it knows how many there are", () => {
    expect(signalSentence(signal(3), 70)).toBe("Crossed out at 3 of 70 studios");
    expect(signalSentence(signal(1), 1)).toBe("Crossed out at 1 of 1 studio");
    // A total smaller than the count is not believed.
    expect(signalSentence(signal(3), 2)).toBe("Crossed out at 3 studios");
  });
});
