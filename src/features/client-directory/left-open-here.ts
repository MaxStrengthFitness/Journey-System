/**
 * OPEN SESSIONS LEFT OPEN HERE — the trainer's door (the sessions round, Oct
 * 12 2026; AJ: "Anyone can clear a session").
 *
 * An open session (started from Open session before a client was chosen)
 * that nobody finished was reachable only by the trainer who started it, and
 * only from the Active Session. The Directory now lists this studio's open
 * sessions left open, beside Open session, each with Open: the Active
 * Session asks there (resume it, or discard it), for anyone who works here.
 *
 * One bounded server read when the Directory opens, with the Active
 * Session's own query (its index exists): this studio, `isUnassigned`,
 * In-Progress, newest twenty. A cache answer, a timeout or an error is
 * "couldn't check", said in one quiet line, never "none".
 */
import { useCallback, useEffect, useState } from "react";
import { collection, getDocsFromServer, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { WorkoutSession } from "../../types";
import { isSessionValid } from "../../lib/utils";
import { isOpenSession } from "../../lib/live-session";
import { quietKindOf, quietLine } from "../../lib/session-quiet";
import { withinOrNull } from "../session-record/finish-wait";

const READ_WAIT_MS = 5_000;

export type LeftHereRead = { state: "loading" } | { state: "failed" } | { state: "ok"; sessions: WorkoutSession[] };

export const LEFT_HERE_FAILED = "Couldn't check for open sessions nobody finished.";

export interface LeftHereRow {
  id: string;
  /** "Open session · Sam · Left open · last active Tue 9:40 AM". */
  line: string;
}

/** The open sessions left open (the staleness rule), in the order given. Pure. */
export function openSessionsLeftHere(
  sessions: readonly WorkoutSession[],
  now: number,
  opts: { trainerNameOf?: (id: string) => string | null | undefined; tz?: string } = {},
): LeftHereRow[] {
  const seen = new Set<string>();
  const out: LeftHereRow[] = [];
  for (const s of sessions) {
    if (!s?.id || seen.has(s.id)) continue;
    if (s.status !== "In-Progress" || !isOpenSession(s) || isSessionValid(s, now)) continue;
    seen.add(s.id);
    const named = (s.trainerId ? opts.trainerNameOf?.(s.trainerId) : null) || "";
    const trainer = named.trim().split(/\s+/)[0] || (s.trainerInitials || "").trim();
    const quiet = quietKindOf(s, now, opts.tz);
    out.push({
      id: s.id,
      line: ["Open session", trainer || null, quietLine(s, quiet, now, opts.tz)].filter(Boolean).join(" · "),
    });
  }
  // The read is newest first already.
  return out;
}

/** One bounded server read of this studio's open sessions, when the Directory opens. Null studio: no read. */
export function useOpenSessionsLeftHere(studioId: string | null): { read: LeftHereRead; again: () => void } {
  const [tries, setTries] = useState(0);
  const [read, setRead] = useState<{ key: string; value: LeftHereRead } | null>(null);
  const key = `${studioId ?? ""}:${tries}`;
  useEffect(() => {
    if (!studioId) return;
    let live = true;
    let asked: Promise<Awaited<ReturnType<typeof getDocsFromServer>>>;
    try {
      asked = Promise.resolve(
        getDocsFromServer(
          query(
            collection(db, "sessions"),
            where("hostedAtStudioId", "==", studioId),
            where("isUnassigned", "==", true),
            where("status", "==", "In-Progress"),
            orderBy("createdAt", "desc"),
            limit(20),
          ),
        ),
      );
    } catch (error) {
      asked = Promise.reject(error);
    }
    void withinOrNull(asked, READ_WAIT_MS).then((snap) => {
      if (!live) return;
      if (!snap || !Array.isArray(snap.docs) || snap.metadata?.fromCache === true) {
        setRead({ key, value: { state: "failed" } });
        return;
      }
      setRead({ key, value: { state: "ok", sessions: snap.docs.map((d) => ({ ...(d.data() as WorkoutSession), id: d.id })) } });
    });
    return () => {
      live = false;
    };
  }, [studioId, key]);
  const again = useCallback(() => setTries((n) => n + 1), []);
  if (!studioId) return { read: { state: "ok", sessions: [] }, again };
  return { read: read?.key === key ? read.value : { state: "loading" }, again };
}
