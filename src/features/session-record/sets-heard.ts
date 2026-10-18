/**
 * HAS THIS iPAD HEARD THE SESSION'S SETS? (F22, AJ's "a", Oct 16 2026:
 * "Finish waits for the sets".)
 *
 * Finish writes every set it holds back with a merge, adds a "not reached"
 * row for each machine it holds nothing for (under the set's own id), and
 * counts the client's totals from what it holds (`commitEndSession`,
 * `completeWorkoutSession`). That is right only when what it holds is the
 * session's sets. A session that reached this iPad by Resume, a take-over or
 * Continue on this iPad was recorded, at least in part, somewhere else; until
 * the server has answered for it, this iPad may hold none of its sets, or old
 * copies of them, and a Finish then stamped real sets "not reached" and left
 * them out of the totals (the Atlas, Sep 26; the three-day review's F22).
 *
 * So Finish, and "Finish it as it was", go ahead only once the sets are
 * heard: the tracker's sets listener has had the SERVER's answer for a window
 * holding the session (`logsWindow` "ready"; it stays ready if the Wi-Fi goes
 * after, because the cache then holds what the server confirmed), or every set
 * was written on this iPad, which recorded the session from its Start
 * (`recorded-here.ts`), so its own copy is the whole of it, offline included.
 * Until then the Finish question waits, and says why. Nothing is refused and
 * nothing is lost: every set is already saved, and a session left open is
 * finished later, here once the sets arrive or as it was by anyone at the
 * studio.
 *
 * PURE — no React, no Firestore, no clock.
 */

export type LogsWindowState = "ready" | "cache-only" | "failed";

/** The tracker's `logsWindow`: which sessions' sets its listener holds, and how they were answered. */
export interface LogsWindowLike {
  ids: readonly string[];
  state: LogsWindowState;
}

/**
 * heard    — Finish may stamp from this iPad's copy.
 * getting  — online, the server's answer for them is on its way.
 * offline  — this iPad is offline and hasn't heard them.
 * failed   — the read of them failed (a refusal, an error): try again.
 */
export type SetsHeard = "heard" | "getting" | "offline" | "failed";

export function setsHeardFor(
  sessionId: string | null | undefined,
  input: {
    window: LogsWindowLike | null | undefined;
    /** Did this iPad record the session from its Start (recorded-here.ts)? */
    recordedHere: (sessionId: string) => boolean;
    online: boolean;
  },
): SetsHeard {
  // No session: nothing to stamp.
  if (!sessionId) return "heard";
  if (input.recordedHere(sessionId)) return "heard";
  const w = input.window;
  const holds = !!w && w.ids.includes(sessionId);
  if (holds && w!.state === "ready") return "heard";
  if (holds && w!.state === "failed") return "failed";
  return input.online ? "getting" : "offline";
}

/**
 * The machines the Finish question asks about ("Started, no count"), kept in
 * step with the sets as they arrive: a machine the trainer already answered
 * keeps the answer, one newly found without a count starts at Skipped (the
 * default, which changes no number), and one that turned out to have a count
 * is no longer asked about. Unchanged, the same object comes back, so a
 * React state update stops there.
 */
export function refreshEndChoices<C extends string>(
  prev: Record<string, C>,
  uncounted: readonly string[],
  fallback: C,
): Record<string, C> {
  const next: Record<string, C> = {};
  for (const id of uncounted) next[id] = prev[id] ?? fallback;
  const prevKeys = Object.keys(prev);
  if (prevKeys.length === uncounted.length && uncounted.every((id) => prev[id] === next[id])) return prev;
  return next;
}

/** The Finish question's line while it waits; null once the sets are heard. */
export function setsWaitWords(state: SetsHeard): string | null {
  switch (state) {
    case "getting":
      return "Getting this session's sets from the server…";
    case "offline":
      return "This iPad is offline and hasn't got all of this session's sets. Finish once it's back online. Every set is saved.";
    case "failed":
      return "This iPad couldn't read this session's sets. Try again, or finish it on the iPad that recorded it. Every set is saved.";
    case "heard":
    default:
      return null;
  }
}

/** The Finish button's words while it waits. */
export const SETS_WAIT_BUTTON = "Getting the sets…";
