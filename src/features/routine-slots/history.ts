/**
 * The history strip (the routine library round, §2 and §10.8 phase 7): which
 * routine ran over time, from the sessions Journey recorded with a routine
 * (`session.routineId`). AJ: "its possible a client has 6 different routine
 * variations in 9 months due to a surgery, variety and experimentation".
 *
 * Consecutive completed sessions on the same routine make one stretch, oldest
 * first. A session with no routine recorded (a Free session, an open
 * session, a FileMaker session) is skipped, never read as "no routine"
 * (docs/business/migration-and-prior-history.md): the strip says only what
 * Journey saw, and says so.
 *
 * Sentences, not scores: the strip is drawn only with at least two routines
 * and at least `HISTORY_MIN_SESSIONS` sessions behind them; below that,
 * nothing (the routine's own "Used last on" says enough). Pure.
 */
import type { Routine, WorkoutSession } from "../../types";
import { parseSessionDate } from "../../lib/utils";

/** The named minimum: fewer sessions with a routine than this and the strip is not drawn. */
export const HISTORY_MIN_SESSIONS = 6;

export interface HistoryStretch {
  routineId: string;
  /** The routine's name now, or a sentence for one Journey no longer holds. */
  name: string;
  /** First and last session of the stretch, epoch ms. */
  from: number;
  to: number;
  sessions: number;
  /** The stretch runs to the newest session (still going). */
  current: boolean;
}

function whenOf(s: WorkoutSession): number {
  const fromDate = parseSessionDate(typeof s.date === "string" ? s.date : undefined);
  if (fromDate) return fromDate;
  const start = (s as { startTime?: unknown }).startTime;
  const t = start ? new Date(start as string).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * The stretches, oldest first. A–B alternation is one story, not dozens of
 * one-session stretches: the two routines that alternate in the same weeks
 * are read as a pair ("Strength + Upper") while they alternate.
 */
export function historyOf(sessions: readonly WorkoutSession[], routines: readonly Pick<Routine, "id" | "name">[]): HistoryStretch[] {
  const ran = sessions
    .filter((s) => s.status === "Completed" && typeof s.routineId === "string" && !!s.routineId)
    .map((s) => ({ id: s.routineId as string, at: whenOf(s) }))
    .filter((s) => s.at > 0)
    .sort((a, b) => a.at - b.at);
  const nameOf = (id: string) => routines.find((r) => r.id === id)?.name?.trim() || "A routine no longer on file";
  const out: HistoryStretch[] = [];
  for (const s of ran) {
    const last = out[out.length - 1];
    const members = last ? last.routineId.split("+") : [];
    // Alternation: a stretch of one routine that meets a second within it becomes the pair; a third routine starts a new stretch.
    if (last && members.includes(s.id)) {
      last.to = s.at;
      last.sessions += 1;
      continue;
    }
    if (last && members.length === 1 && last.sessions >= 1 && alternates(ran, last.routineId, s.id, s.at)) {
      last.routineId = `${last.routineId}+${s.id}`;
      last.name = `${last.name} + ${nameOf(s.id)}`;
      last.to = s.at;
      last.sessions += 1;
      continue;
    }
    out.push({ routineId: s.id, name: nameOf(s.id), from: s.at, to: s.at, sessions: 1, current: false });
  }
  if (out.length > 0) out[out.length - 1].current = true;
  return out;
}

/** The next routine back after `id`'s first session from `at` on is `prev` again: the two alternate. */
function alternates(ran: readonly { id: string; at: number }[], prev: string, id: string, at: number): boolean {
  const after = ran.filter((r) => r.at > at);
  const next = after.find((r) => r.id !== id);
  return !!next && next.id === prev;
}

/** Whether the strip is drawn: at least two stretches and the named minimum of sessions. */
export function historyShown(stretches: readonly HistoryStretch[]): boolean {
  const total = stretches.reduce((n, s) => n + s.sessions, 0);
  return stretches.length >= 2 && total >= HISTORY_MIN_SESSIONS;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthWords(ms: number, withYear: boolean): string {
  const d = new Date(ms);
  return withYear ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : MONTHS[d.getMonth()];
}

/** "Strength · Jan–Jun 2026 · 31 sessions", "Post-surgery · Jun– · 9 sessions" (still going). */
export function stretchWords(s: HistoryStretch): string {
  const fromYear = new Date(s.from).getFullYear();
  const toYear = new Date(s.to).getFullYear();
  const from = monthWords(s.from, fromYear !== toYear);
  const span = s.current ? `${from}–` : monthWords(s.from, true) === monthWords(s.to, true) ? monthWords(s.to, true) : `${from}–${monthWords(s.to, true)}`;
  return `${s.name} · ${span} · ${s.sessions === 1 ? "1 session" : `${s.sessions} sessions`}`;
}
