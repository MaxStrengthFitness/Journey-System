import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ db: {} }));
const { answerAsText, entryFor, groupQuestions, reachesHeadOffice, LIMITS } = await import("./head-office");
import type { AskResult } from "./ask";

const answered: AskResult = {
  kind: "answered",
  health: false,
  points: [{ says: "Keep them breathing.", quotes: [{ text: "Breathe freely.", pageId: "topic:mastery-breathing", page: "Mastery Series › Breathing", title: "Breathing" }] }],
};
const OCT_19_NOON_ET = new Date("2026-10-19T16:00:00Z");

describe("an entry for head office", () => {
  it("holds the question, why it's there, the studio and the studio's day, and never who asked", () => {
    const e = entryFor("  The leg press   squeaks? ", "not_covered", "solon", undefined, OCT_19_NOON_ET);
    expect(e).toEqual({ question: "The leg press squeaks?", reason: "not_covered", studioId: "solon", day: "2026-10-19", mark: "open" });
    expect(JSON.stringify(e)).not.toMatch(/uid|name|trainer/i);
    // Even handed a sender, an unanswered question stays anonymous (AJ, Oct 19 2026).
    expect("by" in entryFor("Squeak?", "not_covered", "solon", { result: answered, why: "", by: { uid: "u", name: "Sam" } })).toBe(false);
  });

  it("keeps a flagged answer as the trainer saw it, and the reason only when given", () => {
    const e = entryFor("Breath?", "flagged", "solon", { result: answered, why: "  It missed the cue  ", by: { uid: "auth-uid-1", name: "Sam Rivera" } }, OCT_19_NOON_ET);
    expect(e.why).toBe("It missed the cue");
    expect(e.by).toEqual({ uid: "auth-uid-1", name: "Sam Rivera" });
    expect(e.answer).toBe("Keep them breathing.\n“Breathe freely.” (Mastery Series › Breathing)");
    expect("why" in entryFor("Breath?", "flagged", "solon", { result: answered, why: "  ", by: null })).toBe(false);
  });

  it("stays inside the rules' limits", () => {
    const e = entryFor("x".repeat(400), "flagged", "solon", { result: answered, why: "y".repeat(900), by: null });
    expect(e.question.length).toBe(LIMITS.question);
    expect(e.why!.length).toBe(LIMITS.why);
    expect(answerAsText({ kind: "not_covered" })).toBe("");
  });

  it("leaves Demo Mode's practice out", () => {
    expect(reachesHeadOffice("solon")).toBe(true);
    expect(reachesHeadOffice("demo-studio")).toBe(false);
    expect(reachesHeadOffice(null)).toBe(false);
  });
});

describe("head office's rows", () => {
  const e = (id: string, question: string, studioId: string, at: number, over = {}) => ({ id, question, reason: "not_covered" as const, studioId, day: "2026-10-1" + (at % 10), mark: "open" as const, at, ...over });

  it("makes the same question asked again one row, with every studio, newest first", () => {
    const rows = groupQuestions([
      e("1", "The leg press squeaks", "solon", 1),
      e("2", "the leg-press squeaks!", "westlake", 3),
      e("3", "Late clients?", "solon", 2),
      e("4", "The leg press squeaks", "solon", 4, { reason: "conflicting" }),
    ]);
    expect(rows.map((r) => [r.question, r.ids.length, r.studioIds])).toEqual([
      ["The leg press squeaks", 3, ["solon", "westlake"]],
      ["Late clients?", 1, ["solon"]],
    ]);
    expect(rows[0].reason).toBe("conflicting");
  });

  it("keeps each flagged answer on its own row", () => {
    const rows = groupQuestions([e("1", "Breath?", "solon", 1, { reason: "flagged", why: "a", by: { uid: "u", name: "Sam Rivera" } }), e("2", "Breath?", "solon", 2, { reason: "flagged" })]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.byName)).toEqual([undefined, "Sam Rivera"]);
  });
});
