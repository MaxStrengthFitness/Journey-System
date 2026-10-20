/**
 * The notice's one read and its one write, both through the two callables
 * (functions/src/homeStudio.ts). The Functions SDK loads on the first ask, never
 * with the app. One ask per visit to Today: the answer is kept for half an hour
 * per studio, because the server reads a month of the studio's bookings to
 * give it. Kept in memory only, and forgotten at sign-out (names ride in it).
 */
import { useCallback, useEffect, useState } from "react";
import { forgetOnSignOut } from "../sign-out/memory";
import type { HomeStudioNotice, HomeStudioNoticesResult } from "./home-studio";

const KEEP_MS = 30 * 60 * 1000;
const kept = new Map<string, { at: number; value: HomeStudioNoticesResult }>();
forgetOnSignOut(() => kept.clear());

async function callable<T>(name: string, data: unknown): Promise<T> {
  const { getApp } = await import("firebase/app");
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const result = await httpsCallable(getFunctions(getApp(), "us-central1"), name)(data);
  return result.data as T;
}

export interface HomeStudioNoticesState {
  notices: HomeStudioNotice[];
  truncated: boolean;
  /** True until the first answer (or failure). */
  loading: boolean;
  /** The server could not be asked or refused: the notice stays quiet rather than saying "nothing". */
  failed: boolean;
  /** Files the client at this studio. Resolves with the server's sentence on a refusal, else null. */
  move: (clientId: string) => Promise<string | null>;
}

export function useHomeStudioNotices(studioId: string | null, enabled: boolean): HomeStudioNoticesState {
  const [state, setState] = useState<{ notices: HomeStudioNotice[]; truncated: boolean; loading: boolean; failed: boolean }>({ notices: [], truncated: false, loading: false, failed: false });

  useEffect(() => {
    if (!enabled || !studioId) {
      setState({ notices: [], truncated: false, loading: false, failed: false });
      return;
    }
    const hit = kept.get(studioId);
    if (hit && Date.now() - hit.at < KEEP_MS) {
      setState({ notices: hit.value.notices, truncated: hit.value.truncated, loading: false, failed: false });
      return;
    }
    let live = true;
    setState({ notices: [], truncated: false, loading: true, failed: false });
    callable<HomeStudioNoticesResult>("homeStudioNotices", { studioId })
      .then((value) => {
        kept.set(studioId, { at: Date.now(), value });
        if (live) setState({ notices: value.notices, truncated: value.truncated, loading: false, failed: false });
      })
      .catch(() => {
        if (live) setState({ notices: [], truncated: false, loading: false, failed: true });
      });
    return () => {
      live = false;
    };
  }, [studioId, enabled]);

  const move = useCallback(
    async (clientId: string): Promise<string | null> => {
      if (!studioId) return "No studio is chosen.";
      try {
        await callable("moveClientHome", { studioId, clientId });
      } catch (err) {
        const message = (err as { message?: string })?.message;
        return message && !/^internal$/i.test(message) ? message : "Couldn't move her just now. Check your connection and try again.";
      }
      // Gone from the list at once, and from the kept answer, so a re-visit does not bring her back.
      const hit = kept.get(studioId);
      if (hit) kept.set(studioId, { at: hit.at, value: { ...hit.value, notices: hit.value.notices.filter((n) => n.clientId !== clientId) } });
      setState((s) => ({ ...s, notices: s.notices.filter((n) => n.clientId !== clientId) }));
      return null;
    },
    [studioId],
  );

  return { ...state, move };
}
