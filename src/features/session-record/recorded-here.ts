/**
 * SESSIONS THIS iPAD RECORDED FROM THEIR START (F22, Oct 17 2026).
 *
 * The one case in which this iPad's own copy of a session's sets is the
 * whole of them before the server has said so: it made the session (Start,
 * or the Client Directory's Open session) and every set since was typed here.
 * Firestore's cache on the iPad holds each of those writes, through a reload
 * and offline, so a Finish offline (the studio's Wi-Fi gone) may stamp from
 * it exactly as before (`sets-heard.ts`).
 *
 * The mark comes off the moment the session goes anywhere else: this iPad
 * turning to watching it (a take-over, or the trainer's other device
 * recording it), after which a Continue on this iPad brings it back unmarked,
 * so its sets wait for the server. It lasts twelve hours at most (a session is
 * twenty minutes; anything older is finished as it was, from whatever iPad,
 * and the cache may no longer hold it all), and is forgotten at a sign-out.
 * Forgetting is always the safe side: an unmarked session only waits for the
 * server's answer.
 *
 * Kept in localStorage, because a reload mid-session (Safari putting the tab
 * away) must not make an offline Finish wait. A storage that refuses keeps
 * nothing, and the session waits for the server like any other.
 */
import { forgetOnSignOut } from "../sign-out/memory";

export const RECORDED_HERE_KEY = "journey_recorded_here";
/** How long a mark holds. */
export const RECORDED_HERE_MS = 12 * 60 * 60 * 1000;
/** How many marks are kept: a day's sessions on one iPad, with room. */
export const RECORDED_HERE_MAX = 30;

export interface MarkStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Mark = { id: string; at: number };

function browserStore(): MarkStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The marks still in force, newest last. Anything unreadable is no mark. */
export function readMarks(raw: string | null, now: number): Mark[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (m): m is Mark =>
        !!m && typeof m.id === "string" && m.id !== "" && typeof m.at === "number" && now - m.at >= 0 && now - m.at < RECORDED_HERE_MS,
    );
  } catch {
    return [];
  }
}

function write(store: MarkStore, marks: Mark[]): void {
  try {
    if (marks.length === 0) store.removeItem(RECORDED_HERE_KEY);
    else store.setItem(RECORDED_HERE_KEY, JSON.stringify(marks.slice(-RECORDED_HERE_MAX)));
  } catch {
    /* A storage that refuses: nothing kept, and the session waits for the server. */
  }
}

function read(store: MarkStore, now: number): Mark[] {
  try {
    return readMarks(store.getItem(RECORDED_HERE_KEY), now);
  } catch {
    return [];
  }
}

/** This iPad has just made the session: every set from here on is typed here. */
export function markRecordedHere(sessionId: string | null | undefined, now = Date.now(), store: MarkStore | null = browserStore()): void {
  if (!sessionId || !store) return;
  write(store, [...read(store, now).filter((m) => m.id !== sessionId), { id: sessionId, at: now }]);
}

/** The session is recorded somewhere else now (this iPad watches it): its sets are no longer all here. */
export function unmarkRecordedHere(sessionId: string | null | undefined, now = Date.now(), store: MarkStore | null = browserStore()): void {
  if (!sessionId || !store) return;
  const marks = read(store, now);
  if (!marks.some((m) => m.id === sessionId)) return;
  write(store, marks.filter((m) => m.id !== sessionId));
}

export function wasRecordedHere(sessionId: string | null | undefined, now = Date.now(), store: MarkStore | null = browserStore()): boolean {
  if (!sessionId || !store) return false;
  return read(store, now).some((m) => m.id === sessionId);
}

// A sign-out forgets them: the next person's Finish waits for the server.
forgetOnSignOut(() => {
  try {
    browserStore()?.removeItem(RECORDED_HERE_KEY);
  } catch {
    /* nothing to forget */
  }
});
