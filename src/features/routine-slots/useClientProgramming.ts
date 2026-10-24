/**
 * The client's programming document, live (`programming.ts`): what they
 * can't do and their weak area, kept on the client (the routine library
 * round, Oct 23 2026). One document listener per client on screen, no query,
 * so no index.
 *
 * - `undefined` while it reads, or when the read failed (unknown: Routine A's
 *   own marks are read, never "none");
 * - `null` when the client has no document yet (Routine A's own, as before);
 * - the marks and focus once it answers from the server or the cache with a
 *   document in it.
 *
 * An empty answer from the iPad's cache alone is not "no document": only the
 * server says so (KNOWN-TRAPS: a snapshot the cache answered is not a read).
 */
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { programmingOf, type Programming } from "./programming";
import { programmingRef } from "./store";

export function useClientProgramming(clientId: string | null | undefined): Programming | null | undefined {
  const [state, setState] = useState<{ clientId: string | null; value: Programming | null | undefined }>({ clientId: null, value: undefined });
  useEffect(() => {
    if (!clientId) {
      setState({ clientId: null, value: undefined });
      return;
    }
    setState({ clientId, value: undefined });
    const unsubscribe = onSnapshot(
      programmingRef(db, clientId),
      { includeMetadataChanges: true },
      (snap) => {
        const fromCache = snap.metadata.fromCache;
        const data = snap.exists() ? snap.data() : null;
        if (!data) {
          if (fromCache) return;
          setState({ clientId, value: null });
          return;
        }
        setState({ clientId, value: programmingOf(data) });
      },
      () => setState({ clientId, value: undefined }),
    );
    return () => unsubscribe();
  }, [clientId]);
  return state.clientId === (clientId ?? null) ? state.value : undefined;
}
