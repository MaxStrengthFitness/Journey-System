import { describe, expect, it } from "vitest";
import { columnsLookSwapped, findingsOf, groupVisits, holdsAllowedOn, implausibleWeights, readSet, shapeOf } from "./visits";
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
  });

  it("reads a minus before the count as the count (Willoughby's mark for rep quality; AJ: 'we dont have to mind that')", () => {
    expect(readSet({ weight: 245, reps: -10 }, false)).toEqual({ kind: "reps", reps: 10 });
    expect(readSet({ weight: 88, reps: -60 }, false)).toEqual({ kind: "seconds", seconds: 60 });
    expect(readSet({ weight: 20, reps: -7.6 }, true)).toEqual({ kind: "sides", left: 7, right: 6 });
    expect(readSet({ weight: 40, reps: -25 }, false).kind).toBe("unclear");
    const { visits } = groupVisits([line("2025-06-06", "Hip ADD", 1, 80, -10)]);
    expect(findingsOf(visits, [], () => false)).toEqual([
      { level: "handled", what: expect.stringMatching(/^A minus before the count/), where: "2025-06-06 Hip ADD: -10" },
      expect.objectContaining({ what: expect.stringMatching(/one or two machines/) }),
    ]);
  });
});

describe("the Strongsville audit's guards (Oct 21 2026)", () => {
  it("reads a hold only from 30 to 120 seconds, and only on a machine that is held", () => {
    expect(readSet({ weight: 88, reps: 90 }, false, true)).toEqual({ kind: "seconds", seconds: 90 });
    expect(readSet({ weight: 26, reps: 120 }, false, true)).toEqual({ kind: "seconds", seconds: 120 });
    // Bonnie Eggers' Leg Ext. 40 × 910: "9" and "10" typed together, not a fifteen-minute hold.
    expect(readSet({ weight: 40, reps: 910 }, false, true)).toMatchObject({ kind: "unclear", why: expect.stringMatching(/too long for a timed hold/) });
    // Denise Kaveliski's Hip ADD 68 × 92: a weight typed in the reps column.
    expect(readSet({ weight: 68, reps: 92 }, false, false)).toMatchObject({ kind: "unclear", why: expect.stringMatching(/lifted for reps/) });
    // The default is as before (the machine not known yet): a hold.
    expect(readSet({ weight: 88, reps: 60 }, false)).toEqual({ kind: "seconds", seconds: 60 });
    // A minus keeps the guards.
    expect(readSet({ weight: 68, reps: -92 }, false, false).kind).toBe("unclear");
  });

  it("knows which machines are never held, a studio's own leg press included", () => {
    expect(holdsAllowedOn("m-hip-add")).toBe(false);
    expect(holdsAllowedOn("m-pulldown", "m-pulldown")).toBe(false);
    expect(holdsAllowedOn("sm-BVDDRe5AqQZFihRLW0vK-hoist-leg-press", null)).toBe(false);
    expect(holdsAllowedOn("sm-x-own-pull", "m-leg-curl")).toBe(false);
    expect(holdsAllowedOn("m-ext")).toBe(true);
    expect(holdsAllowedOn("m-overhead-press", "m-overhead-press")).toBe(true);
    expect(holdsAllowedOn("m-neck")).toBe(true);
  });

  it("holds a count beside a weight of 0 (Elovia Peddle's Hoist, 0 × 8 on alternate visits)", () => {
    expect(readSet({ weight: 0, reps: 8 }, false)).toMatchObject({ kind: "unclear", why: expect.stringMatching(/weight of 0/) });
    expect(readSet({ weight: 0, reps: 60 }, false)).toMatchObject({ kind: "unclear" });
    // 0 × 0 and 0 × blank are still "not performed".
    expect(readSet({ weight: 0, reps: 0 }, false)).toEqual({ kind: "not-performed" });
    expect(readSet({ weight: 0, reps: null }, false)).toEqual({ kind: "not-performed" });
  });

  it("finds the weights nobody lifts: over 400, or four times the client's usual, a run of the same slip whole", () => {
    const { visits } = groupVisits([
      line("2025-03-24", "Lumbar", 1, 84, 12),
      line("2025-03-31", "Lumbar", 1, 84, 15),
      line("2025-04-07", "Lumbar", 1, 84, 10),
      line("2025-04-22", "Lumbar", 1, 8410, null), // Debora Haidar: "84" and "10" typed together
      line("2025-04-28", "Lumbar", 1, 84, 10),
      // Nancy's Leg Press: 206, then 2000 on three visits, then 180
      line("2026-03-31", "Leg Press Imag.", 2, 206, 0),
      line("2026-04-07", "Leg Press Imag.", 2, 2000, 10),
      line("2026-04-14", "Leg Press Imag.", 2, 2000, 10),
      line("2026-04-21", "Leg Press Imag.", 2, 2000, 10),
      line("2026-09-01", "Leg Press Imag.", 2, 180, 10),
      // Two entries far apart are too few to call either a slip
      line("2026-01-05", "Bicep", 3, 40, 10),
      line("2026-01-12", "Bicep", 3, 170, 10),
      // A real heavy lifter is not a slip
      line("2026-01-05", "Hoist", 4, 300, 10),
      line("2026-01-12", "Hoist", 4, 310, 10),
      line("2026-01-19", "Hoist", 4, 320, 10),
    ]);
    const held = implausibleWeights(visits);
    const rows = (machine: string) => visits.flatMap((v) => v.lines).filter((l) => l.machine === machine && held.has(l.row)).map((l) => l.weight);
    expect(rows("Lumbar")).toEqual([8410]);
    expect(rows("Leg Press Imag.")).toEqual([2000, 2000, 2000]);
    expect(rows("Bicep")).toEqual([]);
    expect(rows("Hoist")).toEqual([]);
    const f = findingsOf(visits, [], () => false).filter((x) => /nobody lifts/.test(x.what));
    expect(f).toHaveLength(4);
    expect(f[0]).toMatchObject({ level: "held", where: "2025-04-22 Lumbar: 8410" });
  });

  it("judges a weight against the MACHINE's usual, so a renamed client's one name holding two machines over time is not a slip", () => {
    // Beverly Snyder (wave 2b, Oct 22 2026): "Overhead" is her overhead press at 20 until her chart was rebuilt
    // on 2024-11-04, and her lumbar at 76-88 after. By the name, the 88s are 4x the median and held; by the
    // machine each day resolves to, nothing is.
    const { visits } = groupVisits([
      line("2024-08-05", "Overhead", 1, 20, 10),
      line("2024-08-12", "Overhead", 1, 20, 10),
      line("2024-08-19", "Overhead", 1, 20, 10),
      line("2024-08-26", "Overhead", 1, 20, 10),
      line("2024-11-04", "Overhead", 1, 76, 10),
      line("2024-11-11", "Overhead", 1, 76, 10),
      line("2024-11-18", "Overhead", 1, 88, 10),
      line("2024-11-25", "Overhead", 1, 88, 10),
    ]);
    const byName = implausibleWeights(visits);
    expect([...byName].length).toBeGreaterThan(0);
    const byMachine = implausibleWeights(visits, (l, day) => (day >= "2024-11-04" ? "m-lumbar" : "m-overhead-press"));
    expect([...byMachine]).toEqual([]);
    // A line the table has not settled yet falls back to its name.
    const unsettled = implausibleWeights(visits, () => null);
    expect([...unsettled]).toEqual([...byName]);
  });

  it("asks the machine whether a hold is real, through the same door as per-side", () => {
    const { visits } = groupVisits([line("2024-04-16", "Hip ADD", 1, 68, 92), line("2024-04-16", "Leg Ext.", 2, 44, 90)]);
    const held = findingsOf(visits, [], () => false, (machine) => machine !== "Hip ADD").filter((x) => /can't be read safely/.test(x.what));
    expect(held).toHaveLength(1);
    expect(held[0].where).toMatch(/Hip ADD: a count of 92 on a machine lifted for reps/);
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

  it("keeps the real entry in its own place in the order, and counts a next-time weight alone as blank", () => {
    const { visits } = groupVisits([
      line("2026-04-03", "Cx", 1, null, null),
      line("2026-04-03", "Leg Press", 2, 250, 9),
      line("2026-04-03", "Cx", 6, 34, 8),
      line("2026-04-03", "Pullover", 3, null, null, 80),
      line("2026-04-03", "Pullover", 4, 76, 9),
      line("2026-04-03", "Abs", 5, 40, 8),
      line("2026-04-03", "Abs", 7, 42, 7),
    ]);
    expect(visits[0].lines.map((l) => [l.machine, l.order])).toEqual([["Leg Press", 2], ["Pullover", 4], ["Abs", 5], ["Cx", 6]]);
    // Two entries that both say something: the first stands, the second is held back.
    expect(visits[0].repeats.map((l) => [l.machine, l.order])).toEqual([["Abs", 7]]);
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
