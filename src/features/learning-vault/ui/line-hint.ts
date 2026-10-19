/**
 * THE ONE HINT THAT A LINE CAN BE TAPPED — said until the reader has tapped
 * one (review fix, Oct 19 2026).
 *
 * Every line of every page is the only door to Cross out, Note, Tell head
 * office and Ask in Teams, and at rest a line is plain prose: on an iPad,
 * with no hover, nothing said so ("hover is never the only way to find
 * something"). A mark on every line would be furniture on every line, so
 * ArticleBlocks says it ONCE, quietly, under the first line of a page, and
 * stops for good the first time the reader chooses a line anywhere.
 *
 * Remembered on this iPad (localStorage, wrapped: a private window or blocked
 * storage keeps the memory for this visit only), and forgotten at sign-out:
 * the next person to sign in on the studio iPad has not tapped a line yet.
 * Sign-out clears Journey's localStorage keys itself (features/sign-out); the
 * module's own memory registers its reset here, beside the variable.
 */

import { forgetOnSignOut } from "../../sign-out/memory";

export const LINE_HINT_KEY = "journey.learning.lineHint.v1";

let seen: boolean | null = null;
const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(LINE_HINT_KEY) === "seen";
  } catch {
    return false;
  }
}

/** True once this reader has chosen a line (on this iPad, or earlier this visit). */
export function lineHintSeen(): boolean {
  if (seen === null) seen = readStored();
  return seen;
}

/** The reader chose a line: the hint has done its job, everywhere at once. */
export function markLineHintSeen(): void {
  if (lineHintSeen()) return;
  seen = true;
  try {
    localStorage.setItem(LINE_HINT_KEY, "seen");
  } catch {
    /* blocked storage: remembered for this visit only */
  }
  for (const l of Array.from(listeners)) l();
}

/** For useSyncExternalStore. */
export function subscribeLineHint(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forget this visit's memory (sign-out, and tests). Storage is read again next time. */
export function resetLineHint(): void {
  seen = null;
  for (const l of Array.from(listeners)) l();
}

forgetOnSignOut(resetLineHint);
