/**
 * THE SEAT BELT'S NAME — the one test of whether a key or label is the belt,
 * on its own (Oct 19 2026). `lib/utils.ts` is on the first screen and sorts
 * the belt last on the Now Bar; importing `./seat-belt.ts` for this alone
 * brought its word lists along and took the first screen to its 480 KB
 * budget. `./seat-belt.ts` re-exports it, so there is still one definition.
 *
 * PURE, and nothing else in it.
 */

/** "Seat belt", "seat-belt", "Belt" → one spelling. */
export const foldBeltWord = (s: string): string =>
  String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");

/**
 * This key (or label) is the seat belt: the built-in one, or a dial a studio
 * named that way before it was built in (none was on Oct 19 2026). Either is
 * drawn and counted the same way.
 */
export function isSeatBelt(keyOrLabel: string | null | undefined): boolean {
  const word = foldBeltWord(keyOrLabel ?? "");
  return word === "seatbelt" || word === "belt";
}
