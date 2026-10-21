import { describe, expect, it } from "vitest";
import type { DirectoryRow } from "../client-directory/row";
import type { RunSheetEntry } from "./moments-today";
import { LENS_DEFAULTS, daysBetween, lensRows, nextBookings } from "./lenses";

const entry = (clientId: string | null, start: number, over: Partial<RunSheetEntry> = {}) =>
  ({ key: `${clientId}-${start}`, clientId, name: clientId ?? "x", start, moments: [], ...over }) as unknown as RunSheetEntry;

const row = (over: Record<string, unknown>) => over as unknown as DirectoryRow;

describe("daysBetween", () => {
  it("counts whole studio days", () => {
    expect(daysBetween("2026-10-21", "2026-10-21")).toBe(0);
    expect(daysBetween("2026-10-21", "2026-11-04")).toBe(14);
    expect(daysBetween("2026-10-21", "2026-10-20")).toBe(-1);
  });
});

describe("nextBookings", () => {
  it("keeps each client's first booking in day order, and leaves out one with no client yet", () => {
    const byDay: Record<string, RunSheetEntry[]> = {
      a: [entry("amy", 1), entry(null, 2)],
      b: [entry("amy", 3), entry("bo", 4)],
    };
    const out = nextBookings(["a", "b"], (d) => byDay[d] ?? []);
    expect(out.map((e) => [e.clientId, e.start])).toEqual([
      ["amy", 1],
      ["bo", 4],
    ]);
  });
});

describe("lensRows", () => {
  const rows = new Map<string, DirectoryRow>([
    ["few", row({ left: { state: "known", value: 3, text: "3 left", sub: null, perPayment: false }, renews: { state: "known", day: "2026-10-30", text: "Oct 30", sub: "Billing ends" }, age: { daysToBirthday: 2, birthdayPhrase: "Birthday Fri" } })],
    ["many", row({ left: { state: "known", value: 40, text: "40 left", sub: null, perPayment: false }, renews: { state: "known", day: "2027-03-01", text: "Mar 1", sub: null }, age: { daysToBirthday: 200, birthdayPhrase: null } })],
    ["monthly", row({ left: { state: "known", value: 1, text: "1 on hand", sub: null, perPayment: true }, renews: { state: "none", day: null, text: "", sub: null }, age: { daysToBirthday: null, birthdayPhrase: null } })],
    ["unknown", row({ left: { state: "unknown", value: null, text: "", sub: null, perPayment: false }, renews: { state: "unknown", day: null, text: "", sub: null }, age: { daysToBirthday: null, birthdayPhrase: null } })],
  ]);
  const week = ["few", "many", "monthly", "unknown", "norow"].map((id, i) => entry(id, i));
  const today = "2026-10-21";

  it("Sessions ending: at or under the studio's number, fewest first, never a monthly contract or an unknown", () => {
    const out = lensRows("sessions", week, [], rows, today, LENS_DEFAULTS);
    expect(out.map((r) => [r.entry.clientId, r.stat])).toEqual([["few", "3 left"]]);
    expect(lensRows("sessions", week, [], rows, today, { ...LENS_DEFAULTS, sessionsLeft: 50 }).map((r) => r.entry.clientId)).toEqual(["few", "many"]);
  });

  it("Package ending: within the studio's days, with the date and what it is", () => {
    const out = lensRows("package", week, [], rows, today, LENS_DEFAULTS);
    expect(out.map((r) => [r.entry.clientId, r.stat])).toEqual([["few", "Oct 30 · Billing ends"]]);
    expect(lensRows("package", week, [], rows, today, { ...LENS_DEFAULTS, packageDays: 5 })).toEqual([]);
  });

  it("Birthday soon: within the studio's days, in the row's own words", () => {
    const out = lensRows("birthday", week, [], rows, today, LENS_DEFAULTS);
    expect(out.map((r) => [r.entry.clientId, r.stat])).toEqual([["few", "Birthday Fri"]]);
  });

  it("Critical note: the day on screen's clients with a Read first moment", () => {
    const flagged = entry("few", 1, { moments: [{ family: "read-first", kind: "critical", chip: "Read first", sentence: "" }] as never });
    const out = lensRows("critical", [], [flagged, entry("many", 2)], rows, today, LENS_DEFAULTS);
    expect(out.map((r) => [r.entry.clientId, r.stat])).toEqual([["few", "Read first"]]);
  });
});
