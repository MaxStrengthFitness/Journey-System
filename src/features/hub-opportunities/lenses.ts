/**
 * THE LIST VIEW'S LENSES (Oct 21 2026; AJ: "who's coming in, who has sessions
 * ending soon, or whose packages are ending soon, or who has a birthday
 * coming up, or who has any active notes that are critical").
 *
 * One row of lenses replaces the sort row and the family chips. Each lens
 * picks the clients and says ONE stat in the row's fixed column:
 *
 *   Coming in        the day on screen's bookings, by time (the engine's own list)
 *   Sessions ending  booked in the Hub's week, sessions left at or under the studio's number
 *   Package ending   booked in the Hub's week, the package up for renewal within the studio's days
 *   Birthday soon    booked in the Hub's week, a birthday within the studio's days
 *   Critical note    booked on the day on screen, with a Critical note that matters that day
 *
 * "The next 7 days" is the Hub's strip (AJ, Oct 21 2026). Every fact comes from
 * the directory's rows (`DirectoryRow`) the Hub already builds, so there is no
 * new read; the Critical lens stays on the day on screen because the Hub's
 * Critical read is that day's clients only. A client with no row, or whose
 * fact is unknown, claims nothing (a confident wrong number is worse than a
 * missing one).
 */
import type { DirectoryRow } from "../client-directory/row";
import { hasFamily, type RunSheetEntry } from "./moments-today";

export type LensId = "coming" | "sessions" | "package" | "birthday" | "critical";

export const LENSES: ReadonlyArray<{ id: LensId; label: string; empty: string }> = [
  { id: "coming", label: "Coming in", empty: "Nobody is booked on this day." },
  { id: "sessions", label: "Sessions ending", empty: "Nobody booked this week is near the end of their sessions." },
  { id: "package", label: "Package ending", empty: "No booked client's package is up for renewal soon." },
  { id: "birthday", label: "Birthday soon", empty: "No booked client has a birthday coming up." },
  { id: "critical", label: "Critical note", empty: "No client booked on this day has a Critical note that matters." },
];

export interface LensThresholds {
  /** Sessions left, or fewer. */
  sessionsLeft: number;
  /** Days to the package's renewal, or fewer. */
  packageDays: number;
  /** Days to the birthday, or fewer. */
  birthdayDays: number;
}

/** The app's own numbers (the registry's `appDefault`s), for a studio whose settings haven't answered. */
export const LENS_DEFAULTS: LensThresholds = { sessionsLeft: 6, packageDays: 14, birthdayDays: 14 };

export interface LensRow {
  entry: RunSheetEntry;
  /** The one stat the row says. */
  stat: string;
  /** What the lens sorts by (lower first). */
  value: number;
}

/** Whole days from one studio day key to another (`yyyy-mm-dd`). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * One entry per client over the days, in day order: a client booked on
 * Thursday and again on Monday is Thursday's. A booking with no client yet
 * (not synced) is kept out: the lenses speak about people Journey can name.
 */
export function nextBookings(days: ReadonlyArray<string>, entriesOn: (day: string) => ReadonlyArray<RunSheetEntry>): RunSheetEntry[] {
  const seen = new Set<string>();
  const out: RunSheetEntry[] = [];
  for (const day of days) {
    for (const e of entriesOn(day)) {
      if (!e.clientId || seen.has(e.clientId)) continue;
      seen.add(e.clientId);
      out.push(e);
    }
  }
  return out;
}

const byValue = (a: LensRow, b: LensRow) => a.value - b.value || a.entry.start - b.entry.start || a.entry.name.localeCompare(b.entry.name);

/**
 * The rows of a lens that picks clients by a fact (never "coming", which is
 * the engine's own list). `week` is `nextBookings` over the strip; `dayEntries`
 * is the day on screen's, for Critical.
 */
export function lensRows(
  lens: Exclude<LensId, "coming">,
  week: ReadonlyArray<RunSheetEntry>,
  dayEntries: ReadonlyArray<RunSheetEntry>,
  rowsById: ReadonlyMap<string, DirectoryRow>,
  today: string,
  t: LensThresholds,
): LensRow[] {
  const rows: LensRow[] = [];
  if (lens === "critical") {
    for (const e of dayEntries) {
      if (!hasFamily(e, "read-first")) continue;
      const m = e.moments.find((x) => x.family === "read-first");
      rows.push({ entry: e, stat: m?.chip ?? "Critical note", value: 0 });
    }
    return rows.sort(byValue);
  }
  for (const e of week) {
    const row = e.clientId ? rowsById.get(e.clientId) : undefined;
    if (!row) continue;
    if (lens === "sessions") {
      const left = row.left;
      if (left.state !== "known" || left.perPayment || left.value === null || left.value > t.sessionsLeft) continue;
      rows.push({ entry: e, stat: [left.text, left.sub].filter(Boolean).join(" · "), value: left.value });
    } else if (lens === "package") {
      const renews = row.renews;
      if (renews.state !== "known" || !renews.day) continue;
      const days = daysBetween(today, renews.day);
      if (days < 0 || days > t.packageDays) continue;
      rows.push({ entry: e, stat: [renews.text, renews.sub].filter(Boolean).join(" · "), value: days });
    } else {
      const days = row.age.daysToBirthday;
      if (days === null || days < 0 || days > t.birthdayDays) continue;
      const stat = row.age.birthdayPhrase ?? (days === 0 ? "Birthday today" : `Birthday in ${days} ${days === 1 ? "day" : "days"}`);
      rows.push({ entry: e, stat, value: days });
    }
  }
  return rows.sort(byValue);
}
