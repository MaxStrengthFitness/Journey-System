import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { instancesRef } from "../../studio-tasks/mutations";
import { useStudioTaskCategories } from "../../studio-tasks/useStudioTaskCategories";
import type { TaskInstance } from "../../studio-tasks/types";
import { mergeUpkeepHistory, type UpkeepEvent, type UpkeepLogEntry } from "./upkeepLog";

/**
 * One studio's upkeep timeline, from both sources.
 *
 * Two listeners, read whole rather than per machine: one subscription for a
 * studio beats twenty-two that re-subscribe every time someone taps a row,
 * which is the same call useMachineUpkeep already made and for the same
 * reason.
 *
 * `state` (the studio map, phase 4, Oct 2026): a failed read used to set the
 * lists to [] and say nothing, so an unreadable log showed as an empty one.
 * Either read failing is "failed" now, and the machine's card says it
 * can't read the upkeep record rather than "no upkeep". The lists stay as
 * they were for the screens that read them.
 */
export type UpkeepReadState = "loading" | "ready" | "failed";

export function useStudioUpkeep(studioId: string | null): {
  events: UpkeepEvent[];
  loading: boolean;
  state: UpkeepReadState;
} {
  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [logged, setLogged] = useState<UpkeepLogEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(studioId));
  const [failed, setFailed] = useState(false);
  const { categories } = useStudioTaskCategories(studioId);

  useEffect(() => {
    if (!studioId) {
      setInstances([]);
      setLogged([]);
      setFailed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    let done = 0;
    const settle = () => {
      done += 1;
      if (done >= 2) setLoading(false);
    };

    const unsubTasks = onSnapshot(
      query(instancesRef(studioId), where("kind", "==", "machine")),
      (snap) => {
        setInstances(
          snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })),
        );
        settle();
      },
      () => {
        setInstances([]);
        setFailed(true);
        settle();
      },
    );

    const unsubLog = onSnapshot(
      collection(db, "studios", studioId, "upkeepLog"),
      (snap) => {
        setLogged(snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })));
        settle();
      },
      () => {
        setLogged([]);
        setFailed(true);
        settle();
      },
    );

    return () => {
      unsubTasks();
      unsubLog();
    };
  }, [studioId]);

  const events = useMemo(
    () => mergeUpkeepHistory(instances, logged, categories),
    [instances, logged, categories],
  );

  const state: UpkeepReadState = failed ? "failed" : loading ? "loading" : "ready";
  return { events, loading, state };
}
