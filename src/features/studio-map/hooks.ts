/**
 * THE LAYOUT'S READS (the studio map, Oct 2026) — React hooks, no JSX.
 *
 *   useFloorPlan(studioId, { enabled })   the layout itself (`current`), by
 *                                          id: every door that draws the
 *                                          map.
 *   useFloorPlans(studioId, { enabled })  the whole collection (at most six
 *                                          documents: `current` and five
 *                                          draft slots): the editor only.
 *
 * Both listen with metadata changes, the house pattern
 * (machine-totals/useMachineTotals.ts): a missing document, or an empty
 * collection, that only the iPad's cache answered for stays "loading", and
 * only the server's answer that there is none is "empty". Without metadata
 * changes the server's "still none" would differ from the cache's only in
 * metadata and never arrive. Both reset to loading when the studio changes.
 */

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { CURRENT_ID, loadedPlanOf, readPlan, type FloorPlanDoc, type LoadedPlan } from "./layout";
import { planStateOf, type PlanReadState } from "./states";

export interface FloorPlanRead {
  state: PlanReadState;
  plan: FloorPlanDoc | null;
  fromCache: boolean;
  /** Boxes, places or placements the reader dropped as junk. */
  dropped: number;
}

const OFF: FloorPlanRead = { state: "off", plan: null, fromCache: false, dropped: 0 };
const LOADING: FloorPlanRead = { state: "loading", plan: null, fromCache: false, dropped: 0 };

/** A Firestore Timestamp (or its estimate) as milliseconds; 0 when unknown. */
function msOf(v: unknown): number {
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

/** The layout: one listener on studios/{s}/floorPlans/current. */
export function useFloorPlan(studioId: string | null | undefined, opts: { enabled: boolean }): FloorPlanRead {
  const enabled = opts.enabled && !!studioId;
  const [read, setRead] = useState<FloorPlanRead>(enabled ? LOADING : OFF);
  useEffect(() => {
    if (!enabled || !studioId) {
      setRead(OFF);
      return;
    }
    setRead(LOADING);
    return onSnapshot(
      doc(db, "studios", studioId, "floorPlans", CURRENT_ID),
      { includeMetadataChanges: true },
      (snap) => {
        const fromCache = snap.metadata.fromCache;
        const exists = snap.exists();
        const parsed = exists ? readPlan(snap.data(), { planId: CURRENT_ID }) : null;
        const state = planStateOf({ enabled: true, loading: false, failed: false, exists, fromCache, usable: !!parsed });
        setRead({ state, plan: parsed?.plan ?? null, fromCache, dropped: parsed?.dropped ?? 0 });
      },
      (error) => {
        console.warn("[studio map] the layout couldn't be read:", error?.message ?? error);
        setRead({ state: "unreadable", plan: null, fromCache: false, dropped: 0 });
      },
    );
  }, [enabled, studioId]);
  return read;
}

export interface FloorPlansRead {
  state: PlanReadState;
  current: LoadedPlan | null;
  /** The live drafts, newest first (a pending write sorts as newest). */
  drafts: LoadedPlan[];
  /** Every slot that exists, retired ones included (Try a change needs their revs). */
  slots: LoadedPlan[];
}

const PLANS_OFF: FloorPlansRead = { state: "off", current: null, drafts: [], slots: [] };
const PLANS_LOADING: FloorPlansRead = { state: "loading", current: null, drafts: [], slots: [] };

/** The editor's read: the whole floorPlans collection (no query, so no index). */
export function useFloorPlans(studioId: string | null | undefined, opts: { enabled: boolean }): FloorPlansRead {
  const enabled = opts.enabled && !!studioId;
  const [read, setRead] = useState<FloorPlansRead>(enabled ? PLANS_LOADING : PLANS_OFF);
  useEffect(() => {
    if (!enabled || !studioId) {
      setRead(PLANS_OFF);
      return;
    }
    setRead(PLANS_LOADING);
    return onSnapshot(
      collection(db, "studios", studioId, "floorPlans"),
      { includeMetadataChanges: true },
      (snap) => {
        const fromCache = snap.metadata.fromCache;
        let current: LoadedPlan | null = null;
        let currentUnusable = false;
        const slots: LoadedPlan[] = [];
        for (const d of snap.docs) {
          const parsed = readPlan(d.data(), { planId: d.id });
          if (!parsed) {
            if (d.id === CURRENT_ID) currentUnusable = true;
            continue;
          }
          const loaded = loadedPlanOf(d.id, parsed.plan, msOf(d.get("updatedAt", { serverTimestamps: "estimate" })));
          if (d.id === CURRENT_ID) current = loaded;
          else slots.push(loaded);
        }
        const drafts = slots.filter((s) => !s.retired).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        const exists = snap.docs.length > 0 && (current !== null || drafts.length > 0 || currentUnusable);
        const state = planStateOf({ enabled: true, loading: false, failed: false, exists, fromCache, usable: !currentUnusable });
        setRead({ state, current, drafts, slots });
      },
      (error) => {
        console.warn("[studio map] the layouts couldn't be read:", error?.message ?? error);
        setRead({ state: "unreadable", current: null, drafts: [], slots: [] });
      },
    );
  }, [enabled, studioId]);
  return read;
}
