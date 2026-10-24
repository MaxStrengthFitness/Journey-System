import type { Routine } from "../types";

export type RoutineLetter = "A" | "B";

/**
 * Matching a client's A/B routines by name, safely.
 *
 * Two problems this solves:
 *
 * 1. Call sites did `routines.find(r => r.name.includes("Routine A"))`. A routine
 *    document without a `name` field made that throw during render, blanking the
 *    whole session screen.
 *
 * 2. Routines are not named consistently. Most code writes "Routine A"/"Routine B",
 *    but the demo seeder in AppContent writes plain "A"/"B". A strict lookup missed
 *    those, so a demo-seeded client showed an empty sequence and the session start
 *    created a duplicate routine alongside the existing one.
 *
 * Both spellings are accepted, comparison is case- and whitespace-insensitive, and
 * a missing name simply fails to match rather than throwing.
 */
export function matchesRoutineLetter(
  routine: (Pick<Routine, "name"> & Partial<Pick<Routine, "inSlot">>) | null | undefined,
  letter: RoutineLetter,
): boolean {
  // The routine library round (Oct 23 2026): a routine read with the client's
  // slots carries the slot it is equipped in (`inSlot`, set by
  // features/routine-slots/slots.ts `withSlots`), and that is the answer, so a
  // routine renamed "Post-surgery" is still A and a stashed "Routine A" is not.
  // A routine read without them falls back to its name, as before.
  if (routine && routine.inSlot !== undefined) return routine.inSlot === letter;
  const name = typeof routine?.name === "string" ? routine.name.trim().toLowerCase() : "";
  if (!name) return false;
  const target = letter.toLowerCase();
  return name === target || name === `routine ${target}`;
}

/** The A/B letter a routine represents, or null if it is neither. */
export function routineLetterOf(
  routine: (Pick<Routine, "name"> & Partial<Pick<Routine, "inSlot">>) | null | undefined,
): RoutineLetter | null {
  if (matchesRoutineLetter(routine, "A")) return "A";
  if (matchesRoutineLetter(routine, "B")) return "B";
  return null;
}

/** Finds a client's Routine A or B, tolerating either naming convention. */
export function findRoutineByLetter<T extends Pick<Routine, "name"> & Partial<Pick<Routine, "inSlot">>>(
  routines: T[] | null | undefined,
  letter: RoutineLetter,
): T | undefined {
  return (routines || []).find((r) => matchesRoutineLetter(r, letter));
}
