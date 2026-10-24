/**
 * A trainer's own routines, read and written (the Firestore half of
 * `my-routines.ts`). One query on (tier, ownerUid), its index in
 * firestore.indexes.json; read once per mount, no listener, `reload()` after
 * a change. A read that failed is unknown (`null` with `failed`), never "none".
 */
import { useCallback, useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import type { RoutinePreset } from "../../types";
import { db } from "../../firebase";
import { myRoutineDoc, myRoutinesFromDocs, type MyRoutineWrite } from "./my-routines";

export interface MyRoutinesRead {
  routines: RoutinePreset[] | null;
  status: "loading" | "ready" | "failed" | "none";
  reload: () => void;
}

export function useMyRoutines(uid: string | null | undefined, opts: { enabled?: boolean } = {}): MyRoutinesRead {
  const enabled = opts.enabled !== false;
  const [state, setState] = useState<{ routines: RoutinePreset[] | null; status: MyRoutinesRead["status"] }>({
    routines: null,
    status: uid && enabled ? "loading" : "none",
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!uid || !enabled) {
      setState({ routines: null, status: "none" });
      return;
    }
    let live = true;
    setState((s) => ({ routines: s.routines, status: "loading" }));
    let read: Promise<Awaited<ReturnType<typeof getDocs>>>;
    try {
      read = getDocs(query(collection(db, "routinePresets"), where("tier", "==", "trainer"), where("ownerUid", "==", uid)));
    } catch {
      setState({ routines: null, status: "failed" });
      return;
    }
    read
      .then((snap) => {
        if (!live) return;
        setState({ routines: myRoutinesFromDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })), uid), status: "ready" });
      })
      .catch(() => {
        if (live) setState({ routines: null, status: "failed" });
      });
    return () => {
      live = false;
    };
  }, [uid, enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** One of the trainer's own, made: its id made on the iPad, the write never awaited by the tap. */
export function saveMyRoutine(
  input: MyRoutineWrite,
  who: { uid: string; name?: string | null },
  studioId: string,
): { id: string; commit: Promise<void> } {
  const ref = doc(collection(db, "routinePresets"));
  const commit = setDoc(ref, { ...myRoutineDoc(input, who, studioId), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { id: ref.id, commit };
}

/** A change to one of the trainer's own: only the fields that changed. */
export function updateMyRoutine(id: string, fields: Partial<Pick<RoutinePreset, "name" | "machineIds" | "description">>, uid: string): Promise<void> {
  return updateDoc(doc(db, "routinePresets", id), { ...fields, updatedAt: serverTimestamp(), updatedBy: uid });
}

/** One of the trainer's own taken off their list (theirs alone, never a client's routine). */
export function removeMyRoutine(id: string): Promise<void> {
  return deleteDoc(doc(db, "routinePresets", id));
}
