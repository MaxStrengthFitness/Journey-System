import { describe, expect, it } from "vitest";
import { planSheet, suggestedTotal, type SheetRow } from "./prior-sheet";

const row = (over: Partial<SheetRow>): SheetRow => ({
  clientId: "584",
  name: "Kenda Daniels",
  mindbodyVisits: 183,
  mindbodyAsOf: "2026-09-30",
  fmVisits: 48,
  fmVisitsAfter: 5,
  through: "2026-10-20",
  suggested: 188,
  answer: "",
  by: "",
  note: "",
  ...over,
});

describe("the numbering sheet", () => {
  it("suggests Mindbody's count plus the FileMaker visits after its day, or nothing when Mindbody has no count", () => {
    expect(suggestedTotal(183, 5)).toBe(188);
    expect(suggestedTotal(183, 0)).toBe(183);
    expect(suggestedTotal(null, 5)).toBeNull();
  });

  it("writes only from a person's answer with a name on it, and says why each other row is skipped", () => {
    const plan = planSheet(
      [
        row({ answer: "confirm", by: "Kayla Sharratt" }),
        row({ clientId: "2", name: "Own number", answer: "190", by: "Kyle McManus", note: "counted her cards" }),
        row({ clientId: "3", name: "No answer" }),
        row({ clientId: "4", name: "No name", answer: "confirm" }),
        row({ clientId: "5", name: "Not a number", answer: "about 180", by: "KS" }),
        row({ clientId: "6", name: "Too few", answer: "40", by: "KS" }),
        row({ clientId: "7", name: "No count", answer: "confirm", by: "KS", mindbodyVisits: null, suggested: null }),
        row({ clientId: "8", name: "Excel date", answer: "confirm", by: "KS", through: "10/20/2026" }),
      ],
      new Map(),
    );
    expect(plan.writes.map((w) => [w.clientId, w.sessions])).toEqual([["584", 188], ["2", 190]]);
    expect(plan.writes[0].record).toMatchObject({ sessions: 188, through: "2026-10-20", source: "filemaker", importedCount: 0, from: null, recordedByName: "Kayla Sharratt" });
    expect(plan.writes[0].record.note).toMatch(/Mindbody 183 as of 2026-09-30 \+ 5 FileMaker visits after/);
    expect(plan.writes[1].record.note).toMatch(/^counted her cards Numbering sheet/);
    expect(plan.skipped.map((s) => [s.clientId, s.why])).toEqual([
      ["3", "no answer"],
      ["4", expect.stringMatching(/nobody's name/)],
      ["5", expect.stringMatching(/neither confirm nor a number/)],
      ["6", expect.stringMatching(/fewer than the 48 FileMaker visits/)],
      ["7", expect.stringMatching(/no suggested total/)],
      ["8", expect.stringMatching(/not a day/)],
    ]);
  });

  it("keeps the importer's count and the first day on a record that is restated, and skips one already the same", () => {
    const existing = new Map([
      ["584", { sessions: 150, importedCount: 20, from: "2012-12-17", through: "2026-01-01", source: "trainer-estimate" as const }],
      ["2", { sessions: 190, importedCount: 0, through: "2026-10-20", source: "filemaker" as const }],
    ]);
    const plan = planSheet([row({ answer: "confirm", by: "KS" }), row({ clientId: "2", name: "Same", answer: "190", by: "KS" })], existing);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].record).toMatchObject({ sessions: 188, importedCount: 20, from: "2012-12-17", through: "2026-10-20" });
    expect(plan.skipped).toEqual([{ clientId: "2", name: "Same", why: "already stated, the same" }]);
  });
});
