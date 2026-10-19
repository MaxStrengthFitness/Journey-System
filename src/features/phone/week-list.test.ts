/**
 * My week, the pure half (the phone minimalist round, Oct 19 2026): a day's
 * bookings found by the studio's day, laid out as blocks in the Hub's
 * shape, the week day by day with Now on today only, and the headings.
 */
import { describe, expect, it } from "vitest";
import { blocksOf, bookingsOnDay, countWords, dayHeading, planWeekList } from "./week-list";

const at = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);
const booking = (id: string, day: string, hm: string, over: Record<string, unknown> = {}) => ({
  id,
  startTime: at(day, hm),
  endTime: new Date(at(day, hm).getTime() + 30 * 60_000),
  status: "Scheduled",
  ...over,
});

describe("bookingsOnDay", () => {
  it("keeps the day's own bookings, earliest first, and drops a cancelled one", () => {
    const list = [
      booking("late", "2026-10-19", "17:00"),
      booking("early", "2026-10-19", "07:00"),
      booking("tomorrow", "2026-10-20", "07:00"),
      booking("gone", "2026-10-19", "09:00", { status: "Cancelled" }),
      booking("late-night", "2026-10-18", "23:30"),
    ];
    expect(bookingsOnDay(list, "2026-10-19").map((b) => b.id)).toEqual(["early", "late"]);
  });

  it("leaves out a booking with no readable start", () => {
    expect(bookingsOnDay([{ id: "x", startTime: "nonsense" }], "2026-10-19")).toEqual([]);
  });
});

describe("blocksOf", () => {
  it("gives each booking its column, its span in studio minutes, and the Hub's key", () => {
    const b = [booking("b1", "2026-10-19", "07:00"), booking("b2", "2026-10-19", "10:30", { endTime: null })];
    const out = blocksOf(b, ["aj", "sam"], () => false);
    expect(out.map((x) => [x.key, x.columnId, x.span.from, x.span.to, x.staff])).toEqual([
      ["b1", "aj", 7 * 60, 7 * 60 + 30, false],
      ["b2", "sam", 10 * 60 + 30, 11 * 60, false],
    ]);
  });

  it("drops a booking the plan left out, and marks Unavailable as staff", () => {
    const b = [booking("b1", "2026-10-19", "07:00"), booking("lunch", "2026-10-19", "12:00", { clientName: "Unavailable" })];
    const out = blocksOf(b, [null, "sam"], (x) => (x as { clientName?: string }).clientName === "Unavailable");
    expect(out.map((x) => [x.key, x.staff])).toEqual([["lunch", true]]);
  });
});

describe("planWeekList", () => {
  const block = (key: string, columnId: string, from: number) => ({ key, columnId, span: { from, to: from + 30 }, staff: false });
  const days = [
    { key: "2026-10-19", blocks: [block("a", "sam", 420), block("b", "aj", 420)], columnOrder: ["aj", "sam"] },
    { key: "2026-10-20", blocks: [], columnOrder: ["aj", "sam"] },
    { key: "2026-10-21", blocks: [block("c", "aj", 600)], columnOrder: ["aj", "sam"] },
  ];

  it("keeps every day, mine only when narrowed, and puts Now on today alone", () => {
    const week = planWeekList({ days, mineOnly: "aj", todayKey: "2026-10-19", nowMin: 500 });
    expect(week.map((d) => [d.key, d.rows.map((r) => r.key), d.nowBefore])).toEqual([
      ["2026-10-19", ["b"], 1],
      ["2026-10-20", [], null],
      ["2026-10-21", ["c"], null],
    ]);
  });

  it("shows everyone's in the grid's column order when not narrowed", () => {
    const week = planWeekList({ days, mineOnly: null, todayKey: "2026-10-18", nowMin: 500 });
    expect(week[0].rows.map((r) => r.key)).toEqual(["b", "a"]);
    expect(week.map((d) => d.nowBefore)).toEqual([null, null, null]);
  });
});

describe("the headings", () => {
  it("says Today and Tomorrow by name, then the weekday and date, whatever the phone's zone", () => {
    expect(dayHeading("2026-10-19", "2026-10-19")).toBe("Today · Mon 19");
    expect(dayHeading("2026-10-20", "2026-10-19")).toBe("Tomorrow · Tue 20");
    expect(dayHeading("2026-10-25", "2026-10-19")).toBe("Sun 25");
    expect(dayHeading("2026-11-01", "2026-10-31")).toBe("Tomorrow · Sun 1");
  });

  it("counts in words, and says Nothing booked for none", () => {
    expect(countWords(0)).toBe("Nothing booked");
    expect(countWords(1)).toBe("1 booked");
    expect(countWords(4)).toBe("4 booked");
  });
});
