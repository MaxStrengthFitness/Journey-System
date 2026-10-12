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

/** Why an abandoned In-Progress session went quiet, said only on its own day. */
export function quietKindOf(session: QuietSessionLike, now: number = Date.now(), tz?: string): QuietKind {
  const today = dayOf(now, tz);
  if (isSet(session.endTime) && dayOf(lastSignOfLife(session, now), tz) === today) return "at-end-session";
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

/**
 * Each row's sentence: "Paused at 2:10 PM", "Stopped at End Session at 2:10
 * PM", "Left open · last active Tue 9:40 AM".
 */
export function quietLine(session: QuietSessionLike, kind: QuietKind, now: number = Date.now(), tz?: string): string {
  if (kind === "paused") return `Paused at ${formatStudioTime(new Date(stampMs(session.pausedAt, now)), tz)}`;
  if (kind === "at-end-session") return `Stopped at End Session at ${formatStudioTime(new Date(stampMs(session.endTime, now)), tz)}`;
  return `Left open · last active ${lastActiveWords(lastSignOfLife(session, now), now, tz)}`;
}
