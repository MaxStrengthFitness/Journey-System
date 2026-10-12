/**
 * A FINISH IS COUNTED ONCE (the sessions round, Oct 12 2026; AJ: "2 and 3 I
 * will trust your decision please be sure!").
 *
 * Finish writes two batches (lib/sync-utils.ts `completeWorkoutSession`). The
 * SESSION batch sets the session to Completed and writes every set and every
 * machine setting; it now also creates `sessions/{id}/finish/once`
 * ({ finishId, by, at, clientId }), which the rules allow only when the same
 * request moves the session from not Completed to Completed (firestore.rules
 * `finishOnceOk`). The TOTALS batch, queued straight after it, moves the
 * client's counters and machine totals and marks the marker counted once,
 * with the same finishId, by the same person (`countedOnceOk`). A second
 * finish of the same session, from another iPad, the same trainer's second
 * iPad, a second "Finish it as it was" or a late offline iPad, is refused
 * whole, and its counts with it.
 *
 * Never block a save: the marker refuses only a SECOND finish. When a session
 * batch is refused, the app asks the server what happened (`readFromServer`,
 * bounded) and `judgeFinishRefusal` decides:
 *
 *   - "mine": the marker is this finish's (a resend of a batch that landed).
 *   - "elsewhere": another finish got there first. Said, never retried.
 *   - "gone": the session doesn't exist any more (discarded elsewhere).
 *   - "unmarked": the session is there and NOT Completed, and the marker is
 *     missing or its read was refused by the rules (the marker's rules not
 *     deployed, or a rule bug). A server answer of "not Completed" proves no
 *     finish of this session has landed, so the session batch is sent again
 *     without the marker (the old app's finish).
 *   - "refused": anything else, including any read that failed or timed out.
 *     Reported, and nothing more is written.
 *
 * Every read is three-state plus one: failed, denied (the rules said no),
 * missing, found. Never null for two meanings: a read that didn't answer is
 * never "no marker".
 */
import { doc, getDocFromServer, type DocumentReference, type DocumentSnapshot, type Firestore } from "firebase/firestore";
import { withinOrNull } from "./finish-wait";

export const FINISH_ONCE_ID = "once";
/** How long a refusal's server read may take. */
export const FINISH_READ_MS = 3_000;

export function finishOnceRef(db: Firestore, sessionId: string): DocumentReference {
  return doc(db, "sessions", sessionId, "finish", FINISH_ONCE_ID);
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const FINISH_ID_LENGTH = 20;

/** A 20-character random id, in the style of a Firestore auto id. Never empty, never undefined. */
export function newFinishId(random: () => number = defaultRandom()): string {
  let id = "";
  for (let i = 0; i < FINISH_ID_LENGTH; i += 1) {
    const n = Math.floor(random() * ID_ALPHABET.length);
    id += ID_ALPHABET[Math.min(Math.max(n, 0), ID_ALPHABET.length - 1)];
  }
  return id;
}

function defaultRandom(): () => number {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.getRandomValues === "function") {
      return () => c.getRandomValues(new Uint32Array(1))[0] / 4_294_967_296;
    }
  } catch {
    /* fall through */
  }
  return Math.random;
}

export interface FinishOnceDoc {
  finishId: string;
  by: string;
  at: unknown;
  clientId: string;
  countedAt?: unknown;
  countedBy?: string;
}

/** What the session batch creates. `stamp` is the server's time (serverTimestamp()). */
export function finishOncePayload(finishId: string, uid: string, clientId: string, stamp: unknown): FinishOnceDoc {
  return { finishId, by: uid, at: stamp, clientId };
}

/** What the totals batch writes on the marker: counted, once, by this finish. */
export function countedPatch(finishId: string, stamp: unknown): { countedAt: unknown; countedBy: string } {
  return { countedAt: stamp, countedBy: finishId };
}

/* ------------------------------------------------------------------ *
 * Reads that say what they know.
 * ------------------------------------------------------------------ */

export type ServerRead<T> =
  /** No answer: offline, a timeout, a network error. Never "missing". */
  | { kind: "failed" }
  /** The rules refused the read: an answer, but not about the document. */
  | { kind: "denied" }
  /** The server answered: there is no such document. */
  | { kind: "missing" }
  | { kind: "found"; data: T };

function isDenied(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "permission-denied";
}

/**
 * One read from the SERVER (never the iPad's copy), bounded to `ms`.
 * `read` is getDocFromServer; passed in for the tests.
 */
export async function readFromServer<T>(
  ref: DocumentReference,
  ms: number = FINISH_READ_MS,
  read: (ref: DocumentReference) => Promise<DocumentSnapshot> = getDocFromServer,
): Promise<ServerRead<T>> {
  let answer: Promise<ServerRead<T>>;
  try {
    answer = read(ref).then(
      (snap): ServerRead<T> => (snap.exists() ? { kind: "found", data: snap.data() as T } : { kind: "missing" }),
      (err): ServerRead<T> => (isDenied(err) ? { kind: "denied" } : { kind: "failed" }),
    );
  } catch {
    return { kind: "failed" };
  }
  return (await withinOrNull(answer, ms)) ?? { kind: "failed" };
}

/* ------------------------------------------------------------------ *
 * The verdicts.
 * ------------------------------------------------------------------ */

export type FinishVerdict = "mine" | "elsewhere" | "gone" | "unmarked" | "refused";

/** Why a session batch was refused, from the server's marker and session. */
export function judgeFinishRefusal(a: {
  marker: ServerRead<Partial<FinishOnceDoc>>;
  session: ServerRead<{ status?: string }>;
  finishId: string;
}): FinishVerdict {
  const { marker, session, finishId } = a;
  if (session.kind === "missing") return "gone";
  if (marker.kind === "found") return marker.data?.finishId === finishId ? "mine" : "elsewhere";
  if (session.kind === "found" && session.data?.status === "Completed") return "elsewhere";
  if (session.kind === "found" && (marker.kind === "missing" || marker.kind === "denied")) return "unmarked";
  return "refused";
}

export type TotalsVerdict = "mine" | "uncounted" | "refused";

/** Why a totals batch was refused, from the server's marker. */
export function judgeTotalsRefusal(marker: ServerRead<Partial<FinishOnceDoc>>, finishId: string): TotalsVerdict {
  if (marker.kind !== "found") return "refused";
  const m = marker.data ?? {};
  if (m.countedBy === finishId) return "mine";
  if (m.finishId === finishId && m.countedAt == null) return "uncounted";
  return "refused";
}

/* ------------------------------------------------------------------ *
 * What a refused finish throws.
 * ------------------------------------------------------------------ */

export class FinishedElsewhereError extends Error {
  readonly kind = "finished-elsewhere" as const;
  /** The refusal it was judged from. */
  readonly refusal: unknown;
  constructor(refusal?: unknown) {
    super("This session was already finished on another iPad.");
    this.name = "FinishedElsewhereError";
    this.refusal = refusal;
  }
}

export class SessionGoneError extends Error {
  readonly kind = "gone" as const;
  readonly refusal: unknown;
  constructor(refusal?: unknown) {
    super("This session was discarded on another iPad.");
    this.name = "SessionGoneError";
    this.refusal = refusal;
  }
}

export function isFinishedElsewhere(err: unknown): err is FinishedElsewhereError {
  return (err as { kind?: string } | null)?.kind === "finished-elsewhere";
}

export function isSessionGone(err: unknown): err is SessionGoneError {
  return (err as { kind?: string } | null)?.kind === "gone";
}

/* ------------------------------------------------------------------ *
 * The words. Reassurance, never system words; the button names match the
 * profile's ("Resume or finish").
 * ------------------------------------------------------------------ */

function firstOf(name: string | null | undefined): string {
  return (name || "").trim().split(/\s+/)[0] || "";
}

export function finishedElsewhereWords(name?: string | null): string {
  const first = firstOf(name);
  return first
    ? `${first}'s session was already finished on another iPad. It counts once.`
    : "This session was already finished on another iPad. It counts once.";
}

export function sessionGoneWords(name?: string | null): string {
  const first = firstOf(name);
  return first
    ? `${first}'s session was discarded on another iPad, so it couldn't be saved here.`
    : "This session was discarded on another iPad, so it couldn't be saved here.";
}

export function finishRefusedWords(name?: string | null): string {
  const first = firstOf(name);
  return first
    ? `${first}'s session didn't save. The sets are kept on this iPad. Open ${first}'s profile, tap Resume or finish, then Finish again.`
    : "This session didn't save. The sets are kept on this iPad. Open the client's profile, tap Resume or finish, then Finish again.";
}

/** The same session's Finish refused a second time on this iPad. */
export function finishRefusedAgainWords(name?: string | null): string {
  return `${finishRefusedWords(name)} If it still won't save, tell your studio leader.`;
}

/** How a Finish that reached the Wrap-up was refused, if it was. */
export type FinishRefused = "elsewhere" | "gone" | "refused";

/** The Wrap-up's one line under its header for a refused Finish. */
export function wrapUpRefusedLine(kind: FinishRefused, name?: string | null): string {
  if (kind === "elsewhere") return "Already finished on another iPad · it counts once";
  if (kind === "gone") return "Not saved · this session was discarded on another iPad.";
  const first = firstOf(name);
  return first
    ? `Not saved yet · open ${first}'s profile and tap Resume or finish.`
    : "Not saved yet · open the client's profile and tap Resume or finish.";
}

/** "Finish it as it was" on a session another iPad already finished. */
export function staleFinishedElsewhereWords(name?: string | null): string {
  const first = firstOf(name);
  return first
    ? `${first}'s unfinished session was already finished on another iPad. Nothing more to do.`
    : "That unfinished session was already finished on another iPad. Nothing more to do.";
}
