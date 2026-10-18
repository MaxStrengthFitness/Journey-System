import { useEffect, useRef } from "react";
import { onSnapshot } from "firebase/firestore";
import { Trainer } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { listDeliveryGate } from "../features/front-door/boot-lookup";
import { withoutSuperseded } from "../features/trainer-identity/claim";
import { inListOrder, mergeAnswers, type ListenerAnswer } from "../features/trainer-scope/merge";
import { trainerOf, trainerQueriesFor } from "../features/trainer-scope/read";
import { scopeKey, type TrainerScope } from "../features/trainer-scope/scope";

/**
 * The live list of trainers this iPad may hold (the trainer lock, Oct 18
 * 2026): the people of the studios the signed-in person works at or runs,
 * or everyone for the company tier. `features/trainer-scope/README.md`.
 *
 * One listener per query of the scope, merged into one answer; nothing is
 * handed on until every listener has answered, and the answer is from the
 * cache while any of them is. The listeners restart only when the scope's
 * STUDIOS change (`scopeKey`), not on every copy of the record.
 */
export function useTrainers(
  isReady: boolean,
  scope: TrainerScope | null,
  setTrainers: (trainers: Trainer[], meta?: { fromCache?: boolean }) => void,
) {
  const key = scopeKey(scope);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    const current = scopeRef.current;
    if (!isReady || !current) return;

    const queries = trainerQueriesFor(current);
    if (queries.length === 0) {
      // Nothing to read: the server's empty answer, so the list is known.
      setTrainers([], { fromCache: false });
      return;
    }
    const answers: (ListenerAnswer<Trainer> | null)[] = queries.map(() => null);
    const deliver = listDeliveryGate();
    const unsubscribes = queries.map((q, n) =>
      onSnapshot(
        q,
        // Metadata changes too: the server confirming the iPad's copy raises no
        // event otherwise (front-door/boot-lookup.ts, listDeliveryGate).
        { includeMetadataChanges: true },
        (snap) => {
          answers[n] = { docs: snap.docs.map(trainerOf), fromCache: snap.metadata.fromCache };
          const merged = mergeAnswers(answers);
          if (!merged) return;
          if (!deliver(snap.docChanges().length, merged.fromCache)) return;
          // A claimed placeholder stays in the collection as a tombstone, so
          // without this the same person appears twice — once under a document
          // nobody can write. See features/trainer-identity/claim.ts.
          setTrainers(inListOrder(withoutSuperseded(merged.docs)), { fromCache: merged.fromCache });
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "trainers");
        },
      ),
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [isReady, key, setTrainers]);
}
