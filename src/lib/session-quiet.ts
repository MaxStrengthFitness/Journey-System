/**
 * WHY A SESSION WENT QUIET (the sessions round, Oct 12 2026; audit #6).
 *
 * The app's one staleness rule (`isSessionValid`, lib/utils.ts) calls an
 * In-Progress session with no heartbeat for an hour abandoned, and every
 * screen said "Left open". But a session can go quiet for a reason the
 * trainer chose: Pause was pressed, or End Session was pressed and Finish
 * never was. Those are said as what they are, on the day they happened:
 *
 *   - "at-end-session": `endTime` is set (End Session writes it) and the
 *     session's last sign of life is today;
 *   - "paused": `pausedAt` is set and it is today;
 *   - "left-open": anything else, and anything from an earlier day, whatever
 *     it was then.
 *
 * Words only: a paused session still reads as left open to the staleness
 * rule (the heartbeat while paused is parked). Pure.
 */
import { getMillis } from "./utils";
import { formatStudioTime, studioDateKey } from "./studio-time";
import { lastSignOfLife, type LiveSessionLike } from "./live-session";

export type QuietKind = "paused" | "at-end-session" | "left-open";

export interface QuietSessionLike extends LiveSessionLike {
  pausedAt?: unknown;
  endTime?: unknown;
}

export const QUIET_WORDS: Record<QuietKind, string> = {
  paused: "Paused",
  "at-end-session": "At End Session",
  "left-open": "Left open",
};

const isSet = (v: unknown) => v !== null && v !== undefined && v !== "";

/** A stamp's time; a stamp still being written (a pending server time) reads as now. */
const stampMs = (v: unknown, now: number) => getMillis(v) || now;

const dayOf = (ms: number, tz?: string) => studioDateKey(new Date(ms), tz) ?? "";

/**
 * Why an abandoned In-Progress session went quiet, said only on its own day.
 * At End Session only while nothing was saved after End Session was pressed
 * (the review, Oct 12 2026): `endTime` used to stay on a session taken back
 * from End Session into the session, so one left open later that day read
 * "At End Session" and dropped out of Needs you. Going back now clears it
 * (WorkoutTrackerView `backFromEndSession`); this holds for a session from
 * before that, and for a clear that hasn't landed.
 */
export function quietKindOf(session: QuietSessionLike, now: number = Date.now(), tz?: string): QuietKind {
  const today = dayOf(now, tz);
  if (
    isSet(session.endTime) &&
    dayOf(lastSignOfLife(session, now), tz) === today &&
    stampMs(session.endTime, now) >= getMillis(session.lastHeartbeatAt)
  ) {
    return "at-end-session";
  }
  if (isSet(session.pausedAt) && dayOf(stampMs(session.pausedAt, now), tz) === today) return "paused";
  return "left-open";
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9:40 AM" today, "Yesterday 9:40 AM", "Tue 9:40 AM" this week, "Sep 27 9:40 AM" before. */
export function lastActiveWords(ms: number, now: number, tz?: string): string {
  const day = dayOf(ms, tz);
  const today = dayOf(now, tz);
  const time = formatStudioTime(new Date(ms), tz);
  if (day === today) return time;
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  if (days === 1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) return `${WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${time}`;
  const [, m, d] = day.split("-").map(Number);
  return `${MONTH[m - 1]} ${d} ${time}`;
}

/** When it went quiet, for its kind: "2:10 PM" (paused, at End Session), "Tue 9:40 AM" (left open). */
function quietTime(session: QuietSessionLike, kind: QuietKind, now: number, tz?: string): string {
  if (kind === "paused") return formatStudioTime(new Date(stampMs(session.pausedAt, now)), tz);
  if (kind === "at-end-session") return formatStudioTime(new Date(stampMs(session.endTime, now)), tz);
  return lastActiveWords(lastSignOfLife(session, now), now, tz);
}

/**
 * A row's sentence where nothing else says the kind (the Directory's one
 * line): "Paused since 2:10 PM", "At End Session since 2:10 PM", "Left open ·
 * last active Tue 9:40 AM". It starts with the words of its badge.
 */
export function quietLine(session: QuietSessionLike, kind: QuietKind, now: number = Date.now(), tz?: string): string {
  const at = quietTime(session, kind, now, tz);
  if (kind === "paused") return `Paused since ${at}`;
  if (kind === "at-end-session") return `At End Session since ${at}`;
  return `Left open · last active ${at}`;
}

/**
 * The same, beside a badge that already says the kind (Operations → Today;
 * "Operations says it once"): "Since 2:10 PM", "Last active Tue 9:40 AM".
 */
export function quietDetail(session: QuietSessionLike, kind: QuietKind, now: number = Date.now(), tz?: string): string {
  const at = quietTime(session, kind, now, tz);
  return kind === "left-open" ? `Last active ${at}` : `Since ${at}`;
}
