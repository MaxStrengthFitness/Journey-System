/**
 * DISCARDING A SESSION LEFT OPEN (the sessions round, Oct 12 2026; AJ:
 * "Anyone can clear a session").
 *
 * Anyone who works at the studio a session runs at may discard it once it is
 * left open (no sign of life for an hour). Two halves:
 *
 *   - `checkStillLeftOpen`, when the Discard question OPENS (the first tap,
 *     never after the final one): one bounded server read of the session.
 *     Only "ok" (still there, still In-Progress, still quiet, and nothing
 *     newer than what the screen showed) lets the final Discard through. A
 *     discard is a delete, not a save, so refusing it on an unknown answer
 *     is right. Skipped for the trainer's own session.
 *   - `discardStaleSession`, on the final tap: ONE batch, issued at once and
 *     never awaited by the tap, holding every set id known (the sets the
 *     screen holds and every id the session's machines write under) and the
 *     session itself, so a dropped connection never leaves a session with
 *     no sets or sets with no session. A read AFTER the commit sweeps any
 *     set the batch didn't know, as the in-session Discard does. It never
 *     touches `sessionNotes` (nothing writes them; only administrators may
 *     delete one, so a trainer's discard used to stop there).
 *
 * The review and attack (Oct 12 2026) added three things: the session's set
 * ids are read when the question opens (`readSetIds`), so every set goes in
 * the one batch even for an older session with no machine list; a session
 * Paused or At End Session says so above Discard; and someone else's session
 * left open today waits for the next studio day to be discarded
 * (`discardWaitsToday`), because a Finish queued on an offline iPad is lost
 * if the session is deleted first.
 */
import { collection, doc, getDocs, query, where, writeBatch, type Firestore } from "firebase/firestore";
import type { ExerciseLog } from "../../types";
import { getMillis, isSessionValid } from "../../lib/utils";
import { quietLine, type QuietKind, type QuietSessionLike } from "../../lib/session-quiet";
import { discardLogIds } from "./start-plan";
import { readFromServer, type ServerRead } from "./finish-once";
import { withinOrNull } from "./finish-wait";

/** Every set id a discard deletes: the screen's, the machines', and what a read found. No duplicates. */
export function discardIds(
  sessionId: string,
  held: Record<string, Pick<ExerciseLog, "id" | "sessionId">>,
  machineIds: readonly string[],
  readIds: readonly string[] | null,
): string[] {
  const ids = new Set(discardLogIds(sessionId, held, [...machineIds]));
  for (const id of readIds ?? []) if (id) ids.add(id);
  return [...ids];
}

export type StillLeftOpen = "ok" | "active" | "gone" | "done" | "unknown";

export interface LeftOpenSession {
  id?: string;
  status?: string;
  lastHeartbeatAt?: unknown;
  createdAt?: unknown;
}

/** What the server's read of the session says, judged against the heartbeat the screen showed. */
export function judgeStillLeftOpen(
  read: ServerRead<LeftOpenSession>,
  shownHeartbeat: unknown,
  now: number = Date.now(),
): StillLeftOpen {
  if (read.kind === "missing") return "gone";
  if (read.kind !== "found") return "unknown";
  const s = read.data ?? {};
  if (s.status === "Completed") return "done";
  // Any spelling but Completed is still unfinished; the staleness rule reads it as In-Progress.
  if (isSessionValid({ ...s, status: "In-Progress" }, now)) return "active";
  const seen = getMillis(shownHeartbeat);
  const stored = getMillis(s.lastHeartbeatAt);
  if (stored > 0 && stored > seen) return "active";
  return "ok";
}

/** One bounded server read of the session, judged. */
export async function checkStillLeftOpen(
  db: Firestore,
  session: { id?: string },
  shownHeartbeat: unknown,
  opts: { now?: number; read?: (ref: ReturnType<typeof doc>) => Promise<ServerRead<LeftOpenSession>> } = {},
): Promise<StillLeftOpen> {
  if (!session.id) return "unknown";
  const ref = doc(db, "sessions", session.id);
  const read = opts.read ? await opts.read(ref).catch((): ServerRead<LeftOpenSession> => ({ kind: "failed" })) : await readFromServer<LeftOpenSession>(ref);
  return judgeStillLeftOpen(read, shownHeartbeat, opts.now);
}

/** The sentence for an answer that holds the final Discard back; null for "ok". */
export function stillLeftOpenWords(answer: StillLeftOpen, trainer?: string | null): string | null {
  const who = (trainer || "").trim();
  switch (answer) {
    case "ok":
      return null;
    case "active":
      return who
        ? `It's been active since you opened this. Check with ${who} first.`
        : "It's been active since you opened this. Check with whoever is running it first.";
    case "gone":
      return "That session was already discarded.";
    case "done":
      return "That session was finished on another iPad.";
    default:
      return "Couldn't check that session. Try again.";
  }
}

export const DISCARDED_WORDS = "Session discarded.";
export const DISCARD_REFUSED_WORDS = "That session couldn't be discarded. Try again from the same place.";
/** Both Discard questions say this, the same way (the review, Oct 12 2026). */
export const DISCARD_BODY_WORDS = "Every set logged in it will be deleted. This can't be undone.";

/**
 * "Sam was last on it at 2:14 PM and may still be with the client. Check
 * with Sam first." Said the same way by both Discard questions (the review,
 * Oct 12 2026: it named the trainer three times).
 */
export function lastOnItWords(trainer: string | null | undefined, lastActive: string): string {
  const who = (trainer || "").trim();
  return who
    ? `${who} was last on it at ${lastActive} and may still be with the client. Check with ${who} first.`
    : `It was last used at ${lastActive}. Someone may still be with the client, so check first.`;
}

/**
 * Why a session went quiet, above Discard (the review, Oct 12 2026): a
 * session paused, or at End Session, for over an hour is left open to the
 * staleness rule, so anyone may clear it, and the question says what it is.
 * Null for one simply left open.
 */
export function quietNoteWords(kind: QuietKind, session: QuietSessionLike, now: number = Date.now(), tz?: string): string | null {
  return kind === "left-open" ? null : `${quietLine(session, kind, now, tz)}.`;
}

/**
 * SOMEONE ELSE'S SESSION IS DISCARDED FROM THE NEXT STUDIO DAY (the review
 * and attack, Oct 12 2026). A Finish tapped on an iPad that was offline
 * waits there to be sent; if the session is discarded meanwhile, that finish
 * is refused when it arrives and the session is lost. So a colleague's
 * session left open today can be resumed (taken over) or finished as it was,
 * which an offline finish still lands over (finish-once.ts "correct"), and
 * can be discarded only once its last sign of life is on an earlier studio
 * day. The trainer's own session can always be discarded: they know whether
 * they finished it.
 */
export function discardWaitsToday(a: { mine: boolean; lastSignOfLifeDay: string | null; todayKey: string }): boolean {
  if (a.mine) return false;
  return !a.lastSignOfLifeDay || a.lastSignOfLifeDay >= a.todayKey;
}

export function discardWaitsWords(trainer: string | null | undefined, opts: { openSession?: boolean } = {}): string {
  const who = (trainer || "").trim();
  const today = opts.openSession ? "Today it can be resumed." : "Today it can be resumed or finished as it was.";
  return who
    ? `${who}'s session can be discarded from tomorrow, in case it was finished on an iPad that's offline. ${today}`
    : `Someone else's session can be discarded from tomorrow, in case it was finished on an iPad that's offline. ${today}`;
}

/** How long the set read before a discard may take. */
export const SET_READ_MS = 3_000;

/**
 * Every set id the session has, read when the Discard question OPENS (the
 * review, Oct 12 2026: the profile's discard held only the ids it could work
 * out, and an older session's other sets waited on a sweep that may never
 * run). The iPad's own copy answers offline; a read that doesn't answer in
 * time is null, never "none", and the discard then goes with what is known
 * and the sweep.
 */
export async function readSetIds(
  db: Firestore,
  sessionId: string | undefined,
  ms: number = SET_READ_MS,
): Promise<string[] | null> {
  if (!sessionId) return null;
  let asked: Promise<string[]>;
  try {
    asked = getDocs(query(collection(db, "exerciseLogs"), where("sessionId", "==", sessionId))).then((snap) =>
      snap.docs.map((d) => d.id),
    );
  } catch {
    return null;
  }
  return withinOrNull(
    asked.catch(() => null),
    ms,
  );
}

/**
 * Discard a session and every set in it: ONE batch, issued now (the caller
 * never awaits it at the tap), then a sweep of any set the batch didn't
 * know. `readIds` is what `readSetIds` found when the question opened.
 * Returns the batch's commit, for a toast.
 */
export function discardStaleSession(
  db: Firestore,
  session: { id?: string; sessionMachineIds?: readonly string[] | null },
  held: Record<string, Pick<ExerciseLog, "id" | "sessionId">> = {},
  machineIds: readonly string[] = [],
  readIds: readonly string[] | null = null,
): Promise<void> {
  const sessionId = session.id;
  if (!sessionId) return Promise.reject(new Error("No session to discard."));
  const machines = Array.from(new Set([...machineIds, ...(session.sessionMachineIds ?? [])]));
  const ids = discardIds(sessionId, held, machines, readIds);
  const batch = writeBatch(db);
  for (const id of ids) batch.delete(doc(db, "exerciseLogs", id));
  batch.delete(doc(db, "sessions", sessionId));
  const committed = batch.commit();
  void committed.then(
    () =>
      getDocs(query(collection(db, "exerciseLogs"), where("sessionId", "==", sessionId)))
        .then((snap) => {
          const left = snap.docs.filter((d) => !ids.includes(d.id));
          if (left.length === 0) return;
          const sweep = writeBatch(db);
          for (const d of left) sweep.delete(d.ref);
          return sweep.commit();
        })
        .catch((error) => console.error("[discard] leftover sets were not swept", error)),
    () => {},
  );
  return committed;
}
