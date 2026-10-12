import { describe, expect, it } from "vitest";
import { columnsLookSwapped, findingsOf, groupVisits, readSet, shapeOf } from "./visits";
import type { WorkoutLine } from "./records";

let row = 1;
function line(day: string | null, machine: string, order: number | null, weight: number | null, reps: number | null, nextWeight: number | null = null): WorkoutLine {
  row += 1;
  return { file: "w.xlsx", row, fmClientId: null, name: "Test Client", day, machine, order, weight, reps, nextWeight, trainer: null, note: null, problems: [] };
}

describe("what one entry means", () => {
  it("reads every kind of entry the samples hold", () => {
    expect(readSet({ weight: 70, reps: 8 }, false)).toEqual({ kind: "reps", reps: 8 });
    // AJ, Oct 12 2026: a weight with no reps was done; the count wasn't written.
    expect(readSet({ weight: 26, reps: null }, false)).toEqual({ kind: "not-recorded" });
    // A 0 is "not performed, or take it out".
    expect(readSet({ weight: 30, reps: 0 }, false)).toEqual({ kind: "not-performed" });
    expect(readSet({ weight: 0, reps: null }, false)).toEqual({ kind: "not-performed" });
    // Solon's timed holds, in seconds, in the reps column.
    expect(readSet({ weight: 88, reps: 90 }, false)).toEqual({ kind: "seconds", seconds: 90 });
    expect(readSet({ weight: 88, reps: 30 }, false)).toEqual({ kind: "seconds", seconds: 30 });
    // Solon's Torso Rotation: left.right.
    expect(readSet({ weight: 20, reps: 7.6 }, true)).toEqual({ kind: "sides", left: 7, right: 6 });
    expect(readSet({ weight: 20, reps: 5.5 }, true)).toEqual({ kind: "sides", left: 5, right: 5 });
    expect(readSet({ weight: null, reps: null }, false)).toEqual({ kind: "empty" });
    // A 0 for next time with no count: not performed. Beside a count, the count wins.
    expect(readSet({ weight: 80, reps: null, nextWeight: 0 }, false)).toEqual({ kind: "not-performed" });
    expect(readSet({ weight: 88, reps: 60, nextWeight: 0 }, false)).toEqual({ kind: "seconds", seconds: 60 });
  });

  it("holds back what it can't read safely, and says why", () => {
    expect(readSet({ weight: 40, reps: 25 }, false).kind).toBe("unclear");
    expect(readSet({ weight: 40, reps: 7.5 }, false).kind).toBe("unclear");
    // Excel keeps no trailing zero: one digit of 1 may be ten.
    expect(readSet({ weight: 20, reps: 10.1 }, true)).toMatchObject({ kind: "unclear", why: expect.stringMatching(/10 and 1, or 10 and 10/) });
    expect(readSet({ weight: 20, reps: 7.1 }, true)).toMatchObject({ kind: "unclear", why: expect.stringMatching(/7 and 1, or 7 and 10/) });
    // 7.2 may be seven and twenty.
    expect(readSet({ weight: 20, reps: 7.2 }, true).kind).toBe("unclear");
    expect(readSet({ weight: 20, reps: 7.3 }, true)).toEqual({ kind: "sides", left: 7, right: 3 });
    // Two digits are as typed.
    expect(readSet({ weight: 20, reps: 12.12 }, true)).toEqual({ kind: "sides", left: 12, right: 12 });
    expect(readSet({ weight: 20, reps: 9.11 }, true)).toEqual({ kind: "sides", left: 9, right: 11 });
    // A side of 0, or a side no one would count to.
    expect(readSet({ weight: 20, reps: 0.5 }, true).kind).toBe("unclear");
    expect(readSet({ weight: 20, reps: 25.5 }, true).kind).toBe("unclear");
    expect(readSet({ weight: 20, reps: 7.255 }, true).kind).toBe("unclear");
    expect(readSet({ weight: 20, reps: -3 }, false).kind).toBe("unclear");
  });
});

describe("visits", () => {
  it("groups a client's entries by day, oldest first, in the order done", () => {
    const { visits, undated } = groupVisits([
      line("2026-03-05", "Hip ABD", 2, 20, 8),
      line("2026-03-01", "Leg Curl", 1, 30, 9),
      line("2026-03-05", "Hip ADD", 1, 38, 10),
      line(null, "Abs", 1, 40, 8),
    ]);
    expect(visits.map((v) => [v.day, v.lines.map((l) => l.machine)])).toEqual([
      ["2026-03-01", ["Leg Curl"]],
      ["2026-03-05", ["Hip ADD", "Hip ABD"]],
    ]);
    expect(undated.map((l) => l.machine)).toEqual(["Abs"]);
  });

  it("breaks a tie in the order by the sheet's row, and keeps a machine's second entry that day out", () => {
    const { visits } = groupVisits([
      line("2026-09-11", "Chest fly", 6, 20, 9),
      line("2026-09-11", "Seated Dip", 6, 40, 8),
      line("2026-09-11", "chest fly", 7, 20, 9),
    ]);
    expect(visits[0].lines.map((l) => l.machine)).toEqual(["Chest fly", "Seated Dip"]);
    expect(visits[0].repeats.map((l) => l.order)).toEqual([7]);
  });

  it("never lets a blank entry push out the same machine's entry with something on it", () => {
    // The biggest sample (Willoughby): Cx entered blank first, then with its weight, on one day.
    const { visits } = groupVisits([
      line("2026-04-03", "Cx", 1, null, null),
      line("2026-04-03", "Cx", 1, 34, null),
      line("2026-04-03", "Leg Press Nt", 3, 250, null),
      line("2026-04-03", "Leg Press Nt", 4, null, null),
    ]);
    expect(visits[0].lines.map((l) => [l.machine, l.weight])).toEqual([["Cx", 34], ["Leg Press Nt", 250]]);
    expect(visits[0].repeats).toEqual([]);
    expect(findingsOf(visits, [], () => false).filter((f) => f.level === "held")).toEqual([]);
  });
});

describe("findings", () => {
  const none = () => false;

  it("says what the import handles, what a person may look at, and what it holds back", () => {
    const { visits, undated } = groupVisits([
      line("2026-02-20", "Leg Press Imag.", 1, 70, null, null),
      line("2026-02-20", "Comp. Row", 2, 20, 8),
      line("2026-08-14", "Hip ADD", 1, 50, 9),
      line("2026-08-14", "Hip ABD", 2, 28, 9),
      line("2026-08-14", "Leg Press", 4, 120, 10),
      line("2026-08-14", "Lumbar", 5, 44, 25),
      line(null, "Abs", 1, 50, 9),
    ]);
    const f = findingsOf(visits, undated, none);
    const byWhat = (what: RegExp) => f.filter((x) => what.test(x.what));
    expect(byWhat(/no date/)[0]).toMatchObject({ level: "held" });
    expect(byWhat(/can't be read safely/)[0]).toMatchObject({ level: "held", where: expect.stringContaining("Lumbar") });
    expect(byWhat(/skip/)[0]).toMatchObject({ level: "handled", where: "2026-08-14: 1, 2, 4, 5" });
    expect(byWhat(/one or two machines/)[0]).toMatchObject({ level: "look", where: expect.stringContaining("2026-02-20") });
  });

  it("calls a machine with nothing written handled, not something to fix", () => {
    const { visits } = groupVisits([line("2025-01-22", "Leg Press Nt", 1, 225, null), line("2025-01-22", "Cx", 2, null, null)]);
    const blank = findingsOf(visits, [], none).filter((x) => /nothing written/.test(x.what));
    expect(blank).toEqual([{ level: "handled", what: "A machine with nothing written (left out; the visit imports)", where: "2025-01-22 Cx" }]);
  });

  it("calls a big change in weight a thing to look at, unless FileMaker's next-time weight planned it", () => {
    const { visits } = groupVisits([
      line("2024-09-30", "Pullover", 1, 72, null),
      line("2024-10-14", "Pullover", 1, 24, 7),
      line("2024-09-30", "Leg Press Imag.", 2, 80, 12, 106),
      line("2024-10-14", "Leg Press Imag.", 2, 106, 9),
    ]);
    const changes = findingsOf(visits, [], none).filter((x) => /big change/.test(x.what));
    expect(changes).toHaveLength(1);
    expect(changes[0].where).toBe("2024-10-14 Pullover: 72 on 2024-09-30, then 24");
  });
});

describe("the swapped-columns guard", () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);

  it("passes the samples' shape: reps on most entries, next time's weight on few", () => {
    const fine = days(25).map((d, i) => line(d, "A", 1, 70 + i, 9, i % 8 === 0 ? 72 + i : null));
    expect(columnsLookSwapped(fine)).toBe(false);
  });

  it("passes a client who does mostly timed holds with nothing in next time's column", () => {
    const holds = days(25).flatMap((d) => [line(d, "A", 1, 60, 90), line(d, "B", 2, 80, 120), line(d, "C", 3, 90, 60), line(d, "D", 4, 40, 9)]);
    expect(columnsLookSwapped(holds)).toBe(false);
  });

  it("stops a swapped file of a client whose counts are mostly blank", () => {
    // The long Strongsville sample, swapped: counts on a third of the entries, now in next time's column.
    const sparse = days(30).map((d, i) => line(d, "A", 1, 70, null, i % 3 === 0 ? 9 : null));
    expect(columnsLookSwapped(sparse)).toBe(true);
  });

  it("stops a file whose small counts sit in next time's column and whose reps column is mostly blank", () => {
    const swapped = days(25).map((d, i) => line(d, "A", 1, 70, i % 6 === 0 ? 76 : null, 9));
    expect(columnsLookSwapped(swapped)).toBe(true);
  });
});

describe("the shape of a history", () => {
  it("counts visits, entries, machines and how often reps were left blank", () => {
    const { visits } = groupVisits([
      line("2026-01-01", "A", 1, 70, null),
      line("2026-01-01", "B", 2, 40, 9),
      line("2026-01-15", "A", 1, 72, 8),
      line("2026-01-15", "B", 2, 40, 0),
    ]);
    expect(shapeOf(visits)).toEqual({ visits: 2, entries: 4, first: "2026-01-01", last: "2026-01-15", machines: 2, repsBlankPercent: 25, longestBreakDays: 14 });
  });
});
