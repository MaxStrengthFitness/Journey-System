/**
 * The client's Completed sessions since the last InBody scan, counted by the
 * server (the history-ready round, Oct 12 2026).
 *
 * The session screen reads a window of the client's sessions (the newest 40),
 * so past it the list handed to the briefing is only a page, and a count from
 * it could say "at least 40" to a studio whose number is 50. When the list is
 * a page, this asks the server instead: an aggregation over the index the
 * sessions already have (clientId, status, date), billed by the index entries
 * it reads, never the documents. With no scan, it counts every Completed
 * session (asked only when Journey holds the client's whole story; due.ts).
 *
 * Null while asking, when not asked, and when the count failed: unknown is
 * never zero, and due.ts then counts the page it was given, as a floor.
 */
import { useEffect, useState } from "react";
import { collection, getCountFromServer, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";

export function useInBodyCount(clientId: string | null | undefined, scanDay: string | null | undefined, enabled: boolean): number | null {
  const day = scanDay ? scanDay.slice(0, 10) : null;
  const key = enabled && clientId ? `${clientId}|${day ?? ""}` : null;
  const [answer, setAnswer] = useState<{ key: string; count: number } | null>(null);

  useEffect(() => {
    if (!key || !clientId) return;
    let live = true;
    const failed = (err: unknown) => console.warn("[inbody] the count since the last scan was not read", err);
    try {
      const completed = [where("clientId", "==", clientId), where("status", "==", "Completed")];
      // Ordered as the index is (date descending): a range on date is otherwise ordered ascending.
      const q = day
        ? query(collection(db, "sessions"), ...completed, where("date", ">", day), orderBy("date", "desc"))
        : query(collection(db, "sessions"), ...completed);
      getCountFromServer(q)
        .then((snap) => {
          if (live) setAnswer({ key, count: snap.data().count });
        })
        .catch(failed);
    } catch (err) {
      // A count that can't even be asked is unknown too, never zero.
      failed(err);
    }
    return () => {
      live = false;
    };
  }, [key, clientId, day]);

  return answer && answer.key === key ? answer.count : null;
}
