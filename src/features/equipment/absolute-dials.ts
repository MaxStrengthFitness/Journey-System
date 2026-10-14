/**
 * Dials that are identical for every client on a machine, so pre-filling them
 * is a fact rather than a guess. Keep this list short and evidence-based —
 * everything NOT here stays a ghost the trainer has to confirm.
 *
 * It says WHICH dial only. Until Oct 9 2026 it also held a value, "0", that
 * the dial fell back to when the machine had none, so the first save on any
 * machine with no Gap standard (the Chest Press, the Leg Press and eight more
 * of the twenty) wrote "Gap 0" for a client nobody had set a gap for (the
 * open session round, finding 5). A machine with no gap of its own now
 * leaves the dial empty, "Not set", like every other dial.
 *
 * Its own module since Oct 13 2026 (the studio machines round), with nothing
 * heavy in it, so the floor (lib/floor-machines.ts) can keep a fixed dial's
 * value the machine's own without loading the machine database
 * (`./adapters.ts` re-exports `isAbsoluteDial` for everyone else).
 */
const ABSOLUTE_DIALS: ReadonlySet<string> = new Set(["gap"]);

/** The same "Back Pad" / "back-pad" folding as adapters.ts `slug`. */
const fold = (s: string): string =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The dial is the same for every client on a machine (today, the gap). */
export function isAbsoluteDial(key: string, label: string): boolean {
  return ABSOLUTE_DIALS.has(fold(key)) || ABSOLUTE_DIALS.has(fold(label));
}
