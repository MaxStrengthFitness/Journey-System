/**
 * SESSIONS NOT FINISHED (the Atlas answers, Oct 2 2026; the sessions round,
 * Oct 12 2026). Pure: left-open.test.ts.
 *
 * AJ: "Unfinished sessions for leaders — a Needs-you line on Operations →
 * Today, and head office across every studio." A session is listed by the
 * app's one staleness rule (`isSessionValid`, lib/utils.ts): still
 * In-Progress with no heartbeat for an hour. That is what the Hub's card
 * says too, so the two never disagree.
 *
 * Each row says whose session it is, why it went quiet and how far it got,
 * so a leader can find it without hunting for the client by name:
 *
 *   - a client's session is named by the client, "started by" its trainer;
 *   - an open session (started before a client was chosen) is "Open session
 *     · Sam", never "A client", and its sentence doesn't name Sam twice;
 *   - why it went quiet (lib/session-quiet.ts): Paused or At End Session
 *     on the day it happened, else Left open. Only Left open counts in
 *     Needs you (`needsYouCount`); a pause the trainer chose today is said,
 *     not counted.
 *
 * Every row's door is Open (AJ, Oct 12 2026: "Anyone can clear a session"):
 * a client's opens her session, an open session opens itself, and the Active
 * Session asks there (resume it, finish it as it was, or discard it).
 *
 * Read from what the page already holds: Today's last 14 days of the
 * studio's sessions (useSessionsInRange), and on the Admins dashboard one
 * bounded query across the company (useLeftOpenEverywhere).
 */
import { isSessionValid } from "../../../lib/utils";
import { isOpenSession } from "../../../lib/live-session";
import { lastActiveWords, quietKindOf, quietLine, type QuietKind } from "../../../lib/session-quiet";
import type { WorkoutSession } from "../../../types";

export { lastActiveWords };

export interface LeftOpenRow {
  id: string;
  /** "open": started before a client was chosen. */
  kind: "client" | "open";
  clientId: string | null;
  /** The row's name: the client's, or "Open session · Sam". */
  clientName: string;
  studioId: string;
  /** Who started it: the trainer's name, or their initials, or null. */
  trainer: string | null;
  /** When it last showed a sign of life (the heartbeat, else its start). */
  lastMs: number | null;
  machines: number;
  /** Why it went quiet. */
  quiet: QuietKind;
  /** "Left open · last active Tue 9:40 AM · 3 machines logged · started by Sam". */
  detail: string;
}

const millisOf = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
};

const firstWord = (name: string | null) => (name || "").trim().split(/\s+/)[0] || "";

/** The sessions not finished, most recently active first. */
export function leftOpenSessions(
  sessions: readonly WorkoutSession[],
  now: number,
  opts: { trainerNameOf?: (id: string) => string | null | undefined; tz?: string } = {},
): LeftOpenRow[] {
  const rows: LeftOpenRow[] = [];
  const seen = new Set<string>();
  const nameOf = (id: string | null | undefined, initials?: string) =>
    (id ? opts.trainerNameOf?.(id) : null) || (initials || "").trim() || null;
  for (const s of sessions) {
    if (!s?.id || seen.has(s.id)) continue;
    if (s.status !== "In-Progress" || isSessionValid(s, now)) continue;
    seen.add(s.id);
    const open = isOpenSession(s);
    const lastMs = millisOf(s.lastHeartbeatAt) ?? millisOf(s.createdAt);
    const trainer = nameOf(s.startedByTrainerId || s.trainerId || null, s.trainerInitials);
    // An open session is named by whose it is now (a take-over makes it the new trainer's).
    const runner = nameOf(s.trainerId || s.startedByTrainerId || null, s.trainerInitials);
    const machines = Array.isArray(s.sessionMachineIds) ? s.sessionMachineIds.length : 0;
    const quiet = quietKindOf(s, now, opts.tz);
    const parts = [
      quietLine(s, quiet, now, opts.tz),
      machines > 0 ? `${machines} machine${machines === 1 ? "" : "s"} logged` : null,
      !open && trainer ? `started by ${firstWord(trainer)}` : null,
    ].filter(Boolean) as string[];
    rows.push({
      id: s.id,
      kind: open ? "open" : "client",
      clientId: open ? null : (s.clientId ?? null),
      clientName: open
        ? runner
          ? `Open session · ${firstWord(runner)}`
          : "Open session"
        : (s.clientName ?? "").trim() || "A client",
      studioId: s.hostedAtStudioId,
      trainer,
      lastMs,
      machines,
      quiet,
      detail: parts.join(" · "),
    });
  }
  return rows.sort((a, b) => (b.lastMs ?? 0) - (a.lastMs ?? 0) || a.clientName.localeCompare(b.clientName));
}

/** What Needs you counts: only the sessions left open, never a pause the trainer chose today. */
export function needsYouCount(rows: readonly LeftOpenRow[]): number {
  return rows.filter((r) => r.quiet === "left-open").length;
}

/** The rows' heading. */
export function leftOpenHeading(n: number): string {
  return `Not finished (${n})`;
}

/** The (i) on a client's row. */
export const LEFT_OPEN_HINT = "Never finished. Open it to resume, finish it as it was, or discard it.";
/** The (i) on an open session's row. */
export const OPEN_SESSION_HINT = "No client was chosen. Open it to carry on with it or discard it.";
