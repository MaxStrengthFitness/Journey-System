/**
 * HOURS' SESSIONS NOT FINISHED (the sessions round, Oct 12 2026; audit #1).
 *
 * Hours counts only completed sessions, and said "N sessions are still open"
 * with no way to find them. Now, when Hours opens on ONE studio, one bounded
 * server read lists that studio's In-Progress sessions, in two groups:
 *
 *   Running now      still alive by the app's one staleness rule
 *                    (`isSessionValid`): a trainer is on it;
 *   Not running now  not, with why it went quiet (lib/session-quiet.ts:
 *                    Paused, At End Session, or simply last active at).
 *
 * Each row has Open (AJ, Oct 12 2026: "Anyone can clear a session"), where
 * the Active Session asks. Not drawn under "All my studios".
 *
 * The read is `getDocsFromServer`, bounded at 5 seconds: an answer only this
 * iPad's cache gave, a timeout or an error is "couldn't check", never "none"
 * (a failed read is unknown, never empty). Its index:
 * sessions hostedAtStudioId ASC, status ASC, createdAt DESC.
 */
import { useCallback, useEffect, useState } from "react";
import { collection, getDocsFromServer, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import type { WorkoutSession } from "../../../types";
import { isSessionValid } from "../../../lib/utils";
import { isOpenSession, lastSignOfLife } from "../../../lib/live-session";
import { lastActiveWords, quietKindOf, quietLine, type QuietKind } from "../../../lib/session-quiet";
import { withinOrNull } from "../../session-record/finish-wait";

/** At most this many In-Progress sessions are read; a studio has a handful. */
export const OPEN_SESSIONS_LIMIT = 50;
const READ_WAIT_MS = 5_000;

export type OpenSessionsRead =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ok"; sessions: WorkoutSession[] };

export interface OpenSessionRow {
  id: string;
  kind: "client" | "open";
  clientId: string | null;
  /** The client's name, or "Open session". */
  name: string;
  /** The trainer running it: their name, else initials, else null. */
  trainer: string | null;
  /** "started 9:40 AM", "started yesterday 9:40 AM". */
  started: string | null;
  /** Why it went quiet; null while it is running. */
  quiet: QuietKind | null;
  /**
   * The row's last words, null while it is running: "Paused since 10:02 AM",
   * "At End Session since 10:02 AM", or for one simply left open "last active
   * Tue 9:52 AM" (the review, Oct 12 2026: the group is "Not running now", so
   * a pause the trainer chose is never called left open, and nothing is said
   * twice).
   */
  quietWords: string | null;
}

const startOf = (s: WorkoutSession): number | null => {
  for (const v of [s.startTime, s.createdAt] as unknown[]) {
    if (v == null) continue;
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000;
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && Number.isFinite(Date.parse(v))) return Date.parse(v);
  }
  return null;
};

/** The studio's In-Progress sessions, running and left open, newest first in each. */
export function groupOpenSessions(
  sessions: readonly WorkoutSession[],
  now: number,
  opts: { trainerNameOf?: (id: string) => string | null | undefined; tz?: string } = {},
): { running: OpenSessionRow[]; leftOpen: OpenSessionRow[] } {
  const running: Array<OpenSessionRow & { at: number }> = [];
  const leftOpen: Array<OpenSessionRow & { at: number }> = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    if (!s?.id || seen.has(s.id) || s.status !== "In-Progress") continue;
    seen.add(s.id);
    const open = isOpenSession(s);
    const live = isSessionValid(s, now);
    const at = startOf(s);
    const trainer = (s.trainerId ? opts.trainerNameOf?.(s.trainerId) : null) || (s.trainerInitials || "").trim() || null;
    const quiet = live ? null : quietKindOf(s, now, opts.tz);
    const quietWords =
      quiet === null
        ? null
        : quiet === "left-open"
          ? `last active ${lastActiveWords(lastSignOfLife(s, now), now, opts.tz).replace(/^Yesterday/, "yesterday")}`
          : quietLine(s, quiet, now, opts.tz);
    const row = {
      id: s.id,
      kind: open ? ("open" as const) : ("client" as const),
      clientId: open ? null : (s.clientId ?? null),
      name: open ? "Open session" : (s.clientName || "").trim() || "A client",
      trainer,
      started: at === null ? null : `started ${lastActiveWords(at, now, opts.tz).replace(/^Yesterday/, "yesterday")}`,
      quiet,
      quietWords,
      at: at ?? 0,
    };
    (live ? running : leftOpen).push(row);
  }
  const strip = (rows: Array<OpenSessionRow & { at: number }>) =>
    rows.sort((a, b) => b.at - a.at).map(({ at: _at, ...r }) => r);
  return { running: strip(running), leftOpen: strip(leftOpen) };
}

/** The month line under the table. */
export function notFinishedLine(n: number): string {
  return n === 1
    ? "1 session isn't finished, so its hours aren't counted yet."
    : `${n} sessions aren't finished, so their hours aren't counted yet.`;
}

/** The button beside it says Try again. */
export const OPEN_SESSIONS_FAILED = "Couldn't check for unfinished sessions.";
/** The two groups: a trainer is on it, or nothing has been saved in it for an hour. */
export const RUNNING_NOW = "Running now";
export const NOT_RUNNING_NOW = "Not running now";
export const OPEN_SESSIONS_NONE = "Every session here is finished.";

/** One bounded server read of a studio's In-Progress sessions, when Hours opens on it. */
export function useStudioOpenSessions(studioId: string | null): { read: OpenSessionsRead; again: () => void } {
  const [tries, setTries] = useState(0);
  const [read, setRead] = useState<{ key: string; value: OpenSessionsRead } | null>(null);
  const key = `${studioId ?? ""}:${tries}`;
  useEffect(() => {
    if (!studioId) return;
    let live = true;
    const q = query(
      collection(db, "sessions"),
      where("hostedAtStudioId", "==", studioId),
      where("status", "==", "In-Progress"),
      orderBy("createdAt", "desc"),
      limit(OPEN_SESSIONS_LIMIT),
    );
    let asked: Promise<Awaited<ReturnType<typeof getDocsFromServer>>>;
    try {
      asked = Promise.resolve(getDocsFromServer(q));
    } catch (error) {
      asked = Promise.reject(error);
    }
    void withinOrNull(asked, READ_WAIT_MS).then((snap) => {
      if (!live) return;
      // No answer, an error, or one only this iPad's cache gave: couldn't check, never none.
      if (!snap || !Array.isArray(snap.docs) || snap.metadata?.fromCache === true) {
        setRead({ key, value: { state: "failed" } });
        return;
      }
      const sessions = snap.docs.map((d) => ({ ...(d.data() as WorkoutSession), id: d.id }));
      setRead({ key, value: { state: "ok", sessions } });
    });
    return () => {
      live = false;
    };
  }, [studioId, key]);
  const again = useCallback(() => setTries((n) => n + 1), []);
  if (!studioId) return { read: { state: "failed" }, again };
  return { read: read?.key === key ? read.value : { state: "loading" }, again };
}
