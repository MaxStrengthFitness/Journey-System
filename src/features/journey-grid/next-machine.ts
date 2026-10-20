/**
 * WHAT NEXT POINTS AT (the Now Bar pad round, Oct 20 2026; AJ: "lets say you
 * start with machine 5/6 when you finish 6/6 it should wrap the now bar back
 * to any machines not performed rather than offering to add more").
 *
 * Next is the first machine after the one in hand that is still to do, going
 * round from the bottom of today's order to the top. A machine is done once
 * it has a count, or was Practice or Skipped (the tracker's `isDone`, the
 * same test that seeds the first machine in hand). `wraps` says the machine
 * sits above the one in hand, so the bar can say "Back to".
 *
 * Pure: ids in today's order, the machine in hand, and the done test.
 */
export function nextToDo(
  ids: readonly string[],
  focusId: string | null | undefined,
  isDone: (id: string) => boolean,
): { id: string; wraps: boolean } | null {
  const at = focusId ? ids.indexOf(focusId) : -1;
  for (let step = 1; step <= ids.length; step++) {
    const i = (at + step) % ids.length;
    const id = ids[i];
    if (id === focusId) continue;
    if (!isDone(id)) return { id, wraps: at >= 0 && i < at };
  }
  return null;
}

/** Every machine in today's order is done: the bar offers End Session. Never for an empty order. */
export function everyMachineDone(ids: readonly string[], isDone: (id: string) => boolean): boolean {
  return ids.length > 0 && ids.every(isDone);
}
