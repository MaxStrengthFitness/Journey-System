/**
 * The lists behind the header's Last session and Next session tiles (AJ, Oct
 * 20 2026: "'next session' should show the next few schedule sessions dates;
 * 'last session' should show the last few sessions dates and specifically the
 * time they started at"; his answers 1a 2b 3b).
 *
 *  - 1a  Five rows each (`SESSION_LIST_ROWS`).
 *  - 2b  A past session says when it started AND, when Finish matched it to a
 *        Mindbody booking, the booked time beside it: "Started 4:06 PM ·
 *        booked 4:00 PM".
 *  - 3b  No trainer on a row: dates and times only.
 *
 * Read from what the profile already holds (its page of history and its read
 * of upcoming bookings): no new query, no index, no Mindbody call. Every date
 * and time is the studio's clock (lib/studio-time). A session with no start
 * on record (logged after the fact, imported from FileMaker) says so; a
 * guessed time is worse than none.
 */
import { formatStudioDate, formatStudioTime } from "../../lib/studio-time";
import { ERA_TAG_WORDS, isFileMakerSession } from "../../lib/session-era";
import { toEpochMs } from "../../lib/session-timing";
import { parseSessionDate } from "../../lib/utils";
import { stillBooked } from "./next-session-tile";

/** How many rows each list shows (AJ's 1a, Oct 20 2026). */
export const SESSION_LIST_ROWS = 5;

export interface SessionListRow {
  key: string;
  /** "Mon, Oct 13", with the year when it is not this year. */
  day: string;
  /** "4:00 PM", "Started 4:06 PM · booked 4:00 PM", or the no-start words. */
  time: string;
  /** True when the time could not be known: drawn in the quiet ink. */
  unknownTime?: boolean;
}

export const NO_START_WORDS = "No start time recorded";

interface ScheduleLike {
  id?: string;
  mindbodyAppointmentId?: string;
  startTime?: unknown;
  status?: string | null;
}

interface SessionLike {
  id?: string;
  date?: string;
  status?: string;
  startTime?: unknown;
  clientStartTime?: string;
  bookingStartTime?: unknown;
  /** The import's marks, read by lib/session-era.ts for the "from FileMaker" tag. */
  legacy_filemaker_id?: unknown;
  trainerId?: unknown;
  trainerInitials?: unknown;
}

function dayWords(ms: number, now: Date): string {
  const sameYear =
    formatStudioDate(new Date(ms), { year: "numeric" }) === formatStudioDate(now, { year: "numeric" });
  return formatStudioDate(new Date(ms), {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

/** The next bookings still booked, soonest first. */
export function upcomingSessionRows(
  scheduled: readonly ScheduleLike[],
  now: Date = new Date(),
  rows: number = SESSION_LIST_ROWS,
): SessionListRow[] {
  return stillBooked(scheduled)
    .map((b, i) => ({ b, i, ms: toEpochMs(b.startTime) }))
    .filter((x): x is { b: ScheduleLike; i: number; ms: number } => x.ms !== null)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, rows)
    .map(({ b, i, ms }) => ({
      key: b.id ?? b.mindbodyAppointmentId ?? `next-${i}-${ms}`,
      day: dayWords(ms, now),
      time: formatStudioTime(new Date(ms), undefined, ""),
    }));
}

/** When the session started: the server's stamp, else the iPad's clock. */
function startMsOf(s: SessionLike): number | null {
  return toEpochMs(s.startTime) ?? toEpochMs(s.clientStartTime ?? null);
}

/** The last finished sessions, newest first, each with the time it started. */
export function recentSessionRows(
  sessions: readonly SessionLike[],
  now: Date = new Date(),
  rows: number = SESSION_LIST_ROWS,
): SessionListRow[] {
  return sessions
    .filter((s) => s.status === "Completed")
    .map((s, i) => {
      const startMs = startMsOf(s);
      // The day the session was FOR: its start when there is one, else its date.
      const dayMs = startMs ?? (parseSessionDate(s.date) || null);
      return { s, i, startMs, dayMs };
    })
    .filter((x): x is typeof x & { dayMs: number } => x.dayMs !== null)
    .sort((a, b) => b.dayMs - a.dayMs)
    .slice(0, rows)
    .map(({ s, i, startMs, dayMs }) => {
      const bookedMs = toEpochMs(s.bookingStartTime);
      const booked = bookedMs !== null ? formatStudioTime(new Date(bookedMs), undefined, "") : "";
      const started = startMs !== null ? formatStudioTime(new Date(startMs), undefined, "") : "";
      // A FileMaker session's day is a fact and its time is not: the row says where it came from instead.
      const row: SessionListRow = {
        key: s.id ?? `last-${i}-${dayMs}`,
        day: dayWords(dayMs, now),
        time: isFileMakerSession(s) ? ERA_TAG_WORDS : started ? `Started ${started}${booked ? ` · booked ${booked}` : ""}` : NO_START_WORDS,
      };
      if (!started) row.unknownTime = true;
      return row;
    });
}
