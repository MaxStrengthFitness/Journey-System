/**
 * The one routine builder, the pure half (the routine builder round, Oct 19
 * 2026; docs/rounds/2026-10-19-routine-builder.md). AJ: "we dont even need
 * Routine B to have its own tab if you can come up with a design that allows
 * us to choose what machines are on A or B routine in one selector".
 *
 * The floor is one list of tiles; a tap adds the machine to the routine the
 * trainer is building into (A, B or both) or takes it out again. Each
 * routine is its own list, in order: B is never worked out from A, and a
 * change to one never moves the other.
 */

export type Target = "A" | "B" | "both";

/** Both routines as the builder holds them: the machines, in order. */
export interface Draft {
  a: readonly string[];
  b: readonly string[];
}

/** Which routines a floor machine is in: its tile's small mark. */
export type Mark = "A" | "B" | "AB" | null;

export const TARGET_WORDS: Record<Target, string> = { A: "Routine A", B: "Routine B", both: "Both" };

function without(list: readonly string[], id: string): string[] {
  return list.filter((x) => x !== id);
}

function withAdded(list: readonly string[], id: string): string[] {
  return list.includes(id) ? [...list] : [...list, id];
}

/**
 * A tap on a floor tile. Into A or into B: the machine joins the end of that
 * routine, or leaves it when it is already there. Into both: a machine in
 * both leaves both; otherwise it joins whichever lacks it, so one tap puts it
 * in both.
 */
export function tapFloor(draft: Draft, id: string, target: Target): Draft {
  if (target === "A") return { a: draft.a.includes(id) ? without(draft.a, id) : withAdded(draft.a, id), b: [...draft.b] };
  if (target === "B") return { a: [...draft.a], b: draft.b.includes(id) ? without(draft.b, id) : withAdded(draft.b, id) };
  const inBoth = draft.a.includes(id) && draft.b.includes(id);
  if (inBoth) return { a: without(draft.a, id), b: without(draft.b, id) };
  return { a: withAdded(draft.a, id), b: withAdded(draft.b, id) };
}

/** A floor machine's mark: which routines hold it. */
export function markOf(draft: Draft, id: string): Mark {
  const a = draft.a.includes(id);
  const b = draft.b.includes(id);
  return a && b ? "AB" : a ? "A" : b ? "B" : null;
}

/** The mark read aloud with the tile: "In Routine A and Routine B". */
export function markWords(mark: Mark): string | null {
  if (mark === "AB") return "In Routine A and Routine B";
  if (mark === "A") return "In Routine A";
  if (mark === "B") return "In Routine B";
  return null;
}

/** A machine moved one place up (-1) or down (1) in a routine; the list unchanged at either end. */
export function moved(list: readonly string[], id: string, dir: -1 | 1): string[] {
  const at = list.indexOf(id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** A routine's machines with one taken out. */
export function takenOut(list: readonly string[], id: string): string[] {
  return without(list, id);
}

/**
 * A machine swapped for another in its place, the rest of the order kept: the
 * way B is made a machine different from A. A machine already in the routine
 * is never put in twice.
 */
export function swapped(list: readonly string[], from: string, to: string): string[] {
  if (from === to || !list.includes(from) || list.includes(to)) return [...list];
  return list.map((id) => (id === from ? to : id));
}

/** B as a copy of A, the start for a B that differs by a machine or two. */
export function copiedAIntoB(draft: Draft): Draft {
  return { a: [...draft.a], b: [...draft.a] };
}

/**
 * A routine laid from Start from…: the routine's machines into the routine
 * being built into (both, for Both), in the routine's order, replacing what
 * was there. The other routine is left as it was.
 */
export function laidFrom(draft: Draft, machineIds: readonly string[], target: Target): Draft {
  const ids = machineIds.filter((id, i) => machineIds.indexOf(id) === i);
  return {
    a: target === "B" ? [...draft.a] : [...ids],
    b: target === "A" ? [...draft.b] : [...ids],
  };
}

/** The same machines in the same order. */
export function sameList(x: readonly string[], y: readonly string[]): boolean {
  return x.length === y.length && x.every((id, i) => y[i] === id);
}

/** Whether A and B hold different machines, or the same in a different order: when Phase it in has something to phase. */
export function differs(draft: Draft): boolean {
  return !sameList(draft.a, draft.b);
}
