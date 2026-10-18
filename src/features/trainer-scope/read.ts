/**
 * THE SCOPED READS (the trainer lock, Oct 18 2026): a scope turned into
 * Firestore queries, and read once.
 *
 * Five queries for a studio scope, one per way a person is tied to a studio,
 * written out in full so `src/lib/firestore-indexes.test.ts` can read each
 * one and hold its composite index (`firestore.indexes.json`: each leads
 * with its field). The company tier reads the whole collection, as before.
 * The rules accept exactly these shapes (`trainerRecordReadable` in
 * firestore.rules): an `in` on the home studio and an `array-contains-any`
 * on each list, every value a studio the caller is tied to.
 *
 * Firestore caps `in` and `array-contains-any` at thirty values and throws
 * on none; `trainerScopeFor` caps the list and always holds at least Demo
 * Mode's studio, so a studio scope is never empty here.
 */
import {
  collection,
  getDocs,
  getDocsFromCache,
  query,
  where,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Trainer } from "../../types";
import { mergeAnswers, type MergedAnswer } from "./merge";
import type { TrainerScope } from "./scope";

/** The queries a scope reads: the whole collection, or the five. */
export function trainerQueriesFor(scope: TrainerScope): Query[] {
  const trainers = collection(db, "trainers");
  if (scope.kind === "all") return [trainers];
  const ids = scope.ids;
  if (ids.length === 0) return [];
  return [
    query(trainers, where("primaryHomeStudioId", "in", ids)),
    query(trainers, where("accessibleStudioIds", "array-contains-any", ids)),
    query(trainers, where("activeGuestStudioIds", "array-contains-any", ids)),
    query(trainers, where("ownedStudioIds", "array-contains-any", ids)),
    query(trainers, where("managedStudioIds", "array-contains-any", ids)),
  ];
}

/** A trainer record as the app holds it. */
export function trainerOf(d: QueryDocumentSnapshot): Trainer {
  return { id: d.id, ...d.data() } as Trainer;
}

/** The documents of several answers, one per id, the later answer's copy winning. */
export function uniqueDocs(snaps: ReadonlyArray<QuerySnapshot>): QueryDocumentSnapshot[] {
  const byId = new Map<string, QueryDocumentSnapshot>();
  for (const snap of snaps) for (const d of snap.docs) byId.set(d.id, d);
  return [...byId.values()];
}

/**
 * Read the scope once. "cache" asks the iPad's own copy and throws when a
 * query has nothing stored (the caller then asks the server); "server" asks
 * Firestore, which answers from the copy when offline and says so.
 */
export async function readTrainers(scope: TrainerScope, source: "cache" | "server"): Promise<MergedAnswer<Trainer>> {
  const queries = trainerQueriesFor(scope);
  const read = source === "cache" ? getDocsFromCache : getDocs;
  const snaps = await Promise.all(queries.map((q) => read(q)));
  const merged = mergeAnswers(snaps.map((s) => ({ docs: s.docs.map(trainerOf), fromCache: s.metadata.fromCache })));
  // Only an empty scope merges to nothing, and that reads as the server's empty answer.
  return merged ?? { docs: [], fromCache: false };
}
