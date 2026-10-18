/**
 * MERGING THE SCOPE'S LISTENERS INTO ONE LIST (the trainer lock, Oct 18 2026).
 *
 * A scoped read is five queries (`read.ts`), one per way a person is tied to
 * a studio, each its own listener. The app wants ONE list, with the same
 * meaning `useTrainers` always gave it: the whole answer, and whether any of
 * it is still the iPad's own copy rather than the server's.
 *
 *   - Nothing is handed on until EVERY listener has answered at least once:
 *     a list of the home-studio people alone would say "3 on the team" while
 *     the floaters were still on their way, and the picker and the greeting
 *     say what a list holds the moment it counts (front-door/boot-lookup.ts).
 *   - The merged list is `fromCache` while ANY listener is: the gate that
 *     decides whether a cache answer counts (`listAnswerCounts`) must not be
 *     told the server answered when only some of it has.
 *   - A person on two lists (home at Westlake, also works at Solon, both in
 *     the scope) is one entry; the newest answer wins (`dedupeById`).
 *   - The order is the one the app always sorted by: `order`, then the name.
 *
 * PURE MODULE: no React, no Firestore. `useTrainers` does the I/O.
 */
import { dedupeById } from "../../lib/tenancy";

/** What one listener last said. */
export interface ListenerAnswer<T> {
  docs: T[];
  fromCache: boolean;
}

export interface MergedAnswer<T> {
  docs: T[];
  /** True while any listener's latest answer is the iPad's own copy. */
  fromCache: boolean;
}

/** The merged list, or null until every listener has answered once. */
export function mergeAnswers<T extends { id: string }>(answers: ReadonlyArray<ListenerAnswer<T> | null>): MergedAnswer<T> | null {
  if (answers.length === 0 || answers.some((a) => a === null)) return null;
  const all = answers as ReadonlyArray<ListenerAnswer<T>>;
  return {
    docs: dedupeById(all.map((a) => a.docs)),
    fromCache: all.some((a) => a.fromCache),
  };
}

/** The list's order on every screen: `order` first, then the name. */
export function inListOrder<T extends { order?: number; fullName?: string }>(docs: readonly T[]): T[] {
  return [...docs].sort((a, b) => {
    const orderA = typeof a.order === "number" ? a.order : 999999;
    const orderB = typeof b.order === "number" ? b.order : 999999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.fullName || "").localeCompare(b.fullName || "");
  });
}
