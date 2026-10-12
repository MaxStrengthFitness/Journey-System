import { describe, expect, it } from "vitest";
import {
  CLEAN_WORDS,
  careLines,
  checklistLine,
  choreParts,
  cleanStateOf,
  flagLine,
  isWipeChore,
  markAllTargets,
  rowsForWipe,
  shiftNowOf,
  undoTargetsOf,
  undoValuesOf,
  wipedToday,
  type CleanState,
} from "./cleaning";
import type { MachineCare, MachineWear } from "./machine-care";

/*
 * Run with TZ=America/New_York (the date trap): the studio's day is Eastern.
 * 11:58 PM Eastern on Oct 12 is 03:58 UTC on Oct 13.
 */
const TODAY = "2026-10-12";
const NOW = Date.parse("2026-10-12T20:00:00Z"); // 4:00 PM Eastern
const care = (over: Partial<MachineCare> = {}): MachineCare => ({
  machineId: "m-leg-press",
  lastWipedAt: null,
  lastWipedBy: null,
  lastDeepCleanAt: null,
  lastDeepCleanBy: null,
  flag: null,
  ...over,
});
const wear = (touches: number, wantsWipe = false): MachineWear => ({
  machineId: "m-leg-press",
  touches,
  heat: 0,
  sinceWipeMin: null,
  daysSinceDeep: null,
  deepFraction: 1,
  deepDue: false,
  wantsWipe,
  flag: null,
});
const MARINA = { id: "u-marina", name: "Marina Bell" };
const GLORF = { id: "u-glorf", name: "Glorfindel Ash" };

describe("wipedToday", () => {
  it("counts a wipe at 11:58 PM Eastern for that day, and not the next", () => {
    const late = Date.parse("2026-10-13T03:58:00Z");
    expect(wipedToday(care({ lastWipedAt: late }), "2026-10-12", late + 60_000)).toBe(true);
    expect(wipedToday(care({ lastWipedAt: late }), "2026-10-13", late + 8 * 3_600_000)).toBe(false);
  });

  it("is false with no wipe on record, and unknown for a wipe an hour in the future", () => {
    expect(wipedToday(undefined, TODAY, NOW)).toBe(false);
    expect(wipedToday(care(), TODAY, NOW)).toBe(false);
    expect(wipedToday(care({ lastWipedAt: NOW + 3_600_000 }), TODAY, NOW)).toBeNull();
    expect(wipedToday(care({ lastWipedAt: NOW + 5 * 60_000 }), TODAY, NOW)).toBe(true);
  });
});

describe("cleanStateOf", () => {
  const base = { careRead: "ready" as const, care: care(), wear: null, todayKey: TODAY, nowMs: NOW, outOfService: false };
  it("says every state", () => {
    expect(cleanStateOf({ ...base, care: care({ lastWipedAt: NOW - 3_600_000 }) })).toBe("wiped");
    expect(cleanStateOf({ ...base, wear: wear(2) })).toBe("used");
    expect(cleanStateOf(base)).toBe("open");
    expect(cleanStateOf({ ...base, outOfService: true })).toBe("out");
  });

  it("is unknown for a failed read, a read not yet answered, and a wipe in the future", () => {
    expect(cleanStateOf({ ...base, careRead: "failed" })).toBe("unknown");
    expect(cleanStateOf({ ...base, careRead: "loading" })).toBe("unknown");
    expect(cleanStateOf({ ...base, care: care({ lastWipedAt: NOW + 3_600_000 }) })).toBe("unknown");
  });

  it("never says used where there are no sessions to count", () => {
    expect(cleanStateOf({ ...base, wear: null })).toBe("open");
  });

  it("has words for the two looks and nothing for the rest", () => {
    expect(CLEAN_WORDS).toEqual({ wiped: "Wiped today", used: "Used since its wipe", open: "", out: "Out of service", unknown: "" });
  });
});

describe("checklistLine", () => {
  const states = (wiped: number, open: number, out = 0): CleanState[] => [
    ...Array<CleanState>(wiped).fill("wiped"),
    ...Array<CleanState>(open).fill("open"),
    ...Array<CleanState>(out).fill("out"),
  ];
  it("counts the wiped of the counted, never out of service on either side", () => {
    expect(checklistLine(states(12, 8))).toBe("12 of 20 wiped today");
    expect(checklistLine(states(12, 7, 1))).toBe("12 of 19 wiped today");
    expect(checklistLine(states(19, 0, 1))).toBe("All 19 wiped today");
    expect(checklistLine(states(0, 20))).toBe("None wiped yet today");
    expect(checklistLine(["used", "wiped"])).toBe("1 of 2 wiped today");
  });

  it("is null with an unknown, and with nothing to count", () => {
    expect(checklistLine(["wiped", "unknown"])).toBeNull();
    expect(checklistLine(["out"])).toBeNull();
    expect(checklistLine([])).toBeNull();
  });
});

describe("markAllTargets", () => {
  it("is every counted machine not wiped today, in order, never one out of service", () => {
    expect(
      markAllTargets([
        { machineId: "a", state: "wiped" },
        { machineId: "b", state: "used" },
        { machineId: "c", state: "out" },
        { machineId: "d", state: "open" },
        { machineId: "e", state: "unknown" },
      ]),
    ).toEqual(["b", "d", "e"]);
  });
});

describe("careLines and flagLine", () => {
  it("say the wipe and the deep clean in days, never a name or a minute", () => {
    const deepAt = Date.parse("2026-10-04T15:00:00Z");
    const lines = careLines(
      care({ lastWipedAt: NOW - 3_600_000, lastWipedBy: MARINA, lastDeepCleanAt: deepAt, lastDeepCleanBy: GLORF }),
      wear(5, true),
      TODAY,
      14,
      NOW,
    );
    expect(lines).toEqual(["Wiped today", "Deep cleaned Oct 4 · due in 6 days", "Wants a wipe: 5 sessions since the last one."]);
    const text = lines.join(" ");
    for (const bad of ["Marina", "Glorfindel", "min", "AM", "PM", "ago"]) expect(text).not.toContain(bad);
  });

  it("say an older wipe by its day, a due deep clean, and what's never been done", () => {
    expect(careLines(care({ lastWipedAt: Date.parse("2026-10-09T14:00:00Z"), lastDeepCleanAt: Date.parse("2026-09-01T14:00:00Z") }), null, TODAY, 14, NOW)).toEqual([
      "Last wiped Oct 9",
      "Deep clean due",
    ]);
    expect(careLines(undefined, null, TODAY, 14, NOW)).toEqual(["No wipe on record", "No deep clean on record"]);
    expect(careLines(care({ lastDeepCleanAt: NOW - 60_000 }), null, TODAY, 14, NOW)).toEqual(["No wipe on record", "Deep cleaned today"]);
  });

  it("says a wipe time an hour in the future can't be told, never that there is no wipe", () => {
    expect(careLines(care({ lastWipedAt: NOW + 3_600_000 }), null, TODAY, 14, NOW)[0]).toBe("Can't tell when it was last wiped");
  });

  it("flagLine says the words and never who", () => {
    expect(flagLine(care({ flag: { note: "torn pad on the seat", by: GLORF, at: NOW } }))).toBe("Flagged: torn pad on the seat.");
    expect(flagLine(care({ flag: { note: "Squeaks!", by: GLORF, at: NOW } }))).toBe("Flagged: Squeaks!");
    expect(flagLine(care())).toBeNull();
    expect(flagLine(undefined)).toBeNull();
  });
});

describe("isWipeChore", () => {
  it("is the starter Wipe down every machine, and a studio's own cleaning category", () => {
    expect(isWipeChore({ kind: "machine", category: "cleaning" })).toBe(true);
    expect(isWipeChore({ kind: "machine", category: "towels" }, [{ id: "towels", label: "Towels", color: "x", order: 4, upkeepRole: "cleaning" } as never])).toBe(true);
    expect(isWipeChore({ kind: "machine", category: "maintenance" })).toBe(false);
    expect(isWipeChore({ kind: "studio", category: "cleaning" } as never)).toBe(false);
    expect(isWipeChore(undefined)).toBe(false);
  });
});

describe("choreParts", () => {
  const rows = (ids: string[], status: "open" | "done" = "open") => ids.map((machineId) => ({ machineId, status }));
  const ids = Array.from({ length: 20 }, (_, i) => `m${i}`);

  it("counts a machine wiped on the map whose row is still open, and not a row marked done whose machine wasn't wiped", () => {
    const wiped = new Set(ids.slice(0, 12));
    const group = [...rows(ids.slice(0, 17)), ...rows(ids.slice(17), "done")];
    expect(choreParts(group, wiped, new Set())).toEqual({ done: 12, total: 20, complete: false });
  });

  it("leaves an out-of-service machine out of both sides", () => {
    expect(choreParts(rows(ids.slice(0, 20)), new Set(ids.slice(0, 12)), new Set(["m19"]))).toEqual({ done: 12, total: 19, complete: false });
  });

  it("is complete on a floor wiped entirely from the map", () => {
    expect(choreParts(rows(ids), new Set(ids.slice(0, 19)), new Set(["m19"]))).toEqual({ done: 19, total: 19, complete: true });
    expect(choreParts([], new Set(), new Set())).toEqual({ done: 0, total: 0, complete: false });
  });
});

describe("undoValuesOf", () => {
  it("keeps each machine's earlier wipe, nulls included", () => {
    expect(undoValuesOf({ a: care({ machineId: "a", lastWipedAt: 5, lastWipedBy: MARINA }) }, ["a", "b"])).toEqual([
      { machineId: "a", lastWipedAt: 5, lastWipedBy: MARINA },
      { machineId: "b", lastWipedAt: null, lastWipedBy: null },
    ]);
  });
});

describe("rowsForWipe (one row a machine per wipe)", () => {
  const r = (machineId: string, shift: "am" | "any" | "pm", status: "open" | "done" = "open") => ({ id: `${machineId}-${shift}`, machineId, shift, status, kind: "machine" });
  const rows = [r("a", "am"), r("a", "pm"), r("b", "pm"), r("c", "am", "done"), r("c", "pm")];

  it("takes the row of the shift it is now, else the earliest still open", () => {
    const opening = rowsForWipe(rows, ["a", "b", "c"], "am");
    expect([...opening.values()].map((x) => x.id)).toEqual(["a-am", "b-pm", "c-pm"]);
    const close = rowsForWipe(rows, ["a", "b", "c"], "pm");
    expect([...close.values()].map((x) => x.id)).toEqual(["a-pm", "b-pm", "c-pm"]);
    const midday = rowsForWipe(rows, ["a"], "any");
    expect(midday.get("a")?.id).toBe("a-am");
  });

  it("never takes a row of another machine, a done row or a non-machine row", () => {
    expect(rowsForWipe([...rows, { id: "x", machineId: "a", shift: "pm" as const, status: "open", kind: "studio" }], ["b"], "am").size).toBe(1);
  });

  it("follows the Board's part of the day", () => {
    expect([shiftNowOf("opening"), shiftNowOf("mid"), shiftNowOf("closing"), shiftNowOf("closed")]).toEqual(["am", "any", "pm", "pm"]);
  });
});

describe("undoTargetsOf (Undo puts back only what is still this wipe)", () => {
  const AT = NOW - 5_000;
  const live = {
    a: care({ machineId: "a", lastWipedAt: AT, lastWipedBy: MARINA }),
    b: care({ machineId: "b", lastWipedAt: AT + 1_000, lastWipedBy: GLORF }),
    c: care({ machineId: "c", lastWipedAt: AT, lastWipedBy: GLORF }),
  };

  it("keeps a later wipe from another iPad, and a wipe at the same time by someone else", () => {
    expect(undoTargetsOf(live, ["a", "b", "c", "d"], AT, MARINA.id)).toEqual(["a"]);
  });
});
