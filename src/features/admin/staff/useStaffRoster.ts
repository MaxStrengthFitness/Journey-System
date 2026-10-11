/**
 * THE STAFF ROSTER, LIVE — one hook for both doors.
 *
 * My Studio round, Sep 2026. Staff & Roles (Operations) and My Studio → Team
 * both need the same three sources merged the same way: the trainer
 * documents the app already streams, the pending access requests (a live
 * listener — never a Force Refresh button), and the staff list Mindbody
 * holds for the studio's site. buildStaffRoster (roster.ts) does the merge;
 * this is the plumbing around it, lifted out of AdminStaffTab so the Team
 * section could not drift into a second copy.
 *
 * THE MINDBODY MATCH IS PER STUDIO (voice review follow-up, Sep 27 2026).
 * Mindbody's staff list belongs to one studio's site, so under Operations'
 * "All my studios" it is not read, and the page says exactly that — it used
 * to say "No Mindbody Site ID on this studio yet" and put every account at
 * every studio under "No Mindbody match". `mindbodyChecked` is false until
 * a list has actually been read, and the rows say "Has an account" rather
 * than claim a match nobody looked for.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { authedFetch } from "../../../lib/authed-fetch";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import type { Studio, Trainer } from "../../../types";
import { buildStaffRoster, summariseRoster, type AccessRequest, type MindbodyStaff, type StaffRow } from "./roster";
import { mergeRequests, requestQueryPlan, type RequestReader } from "./request-readers";

/** What the page says about Mindbody under "All my studios". */
const MINDBODY_PER_STUDIO =
  "The Mindbody match is per studio: choose one studio above to see who is on its Mindbody staff list and who has no match.";

export interface StaffRosterState {
  rows: StaffRow[];
  summary: ReturnType<typeof summariseRoster>;
  requests: AccessRequest[];
  mindbodyStaff: MindbodyStaff[];
  /** Plain English about the Mindbody side: loading, offline, no site id, an error. Empty when fine. */
  staffStatus: string;
  /** Mindbody's staff list was read, so "No Mindbody match" can be said. */
  mindbodyChecked: boolean;
}

export function useStaffRoster({
  reader,
  trainers,
  studio,
  studioId,
  studioIds = null,
}: {
  /**
   * The signed-in person. The pending access requests are read only for
   * someone the rules let read them (request-readers.ts, Oct 10 2026): a
   * request carries a stranger's email and phone. Everyone else's roster
   * simply has no requests in it.
   */
  reader: RequestReader | null | undefined;
  trainers: Trainer[];
  /** The studio whose Mindbody site the staff list comes from. */
  studio: Studio | null;
  /** Restricts the rows to one studio when set. */
  studioId: string | null;
  /**
   * With no studio: the studios to list — Operations' "All my studios", the
   * reader's studios. Null (and no studio) lists everyone.
   */
  studioIds?: readonly string[] | null;
}): StaffRosterState {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [mindbodyStaff, setMindbodyStaff] = useState<MindbodyStaff[]>([]);
  const [staffStatus, setStaffStatus] = useState("");
  const [mindbodyChecked, setMindbodyChecked] = useState(false);
  const hasStudio = Boolean(studio);
  const spanning = !hasStudio && studioIds !== null;

  /* ---- access requests: a live stream, for those who may read it ----
   *
   * The franchise partition (Oct 2026): administrators read every pending
   * request with one query; a leader or owner reads the requests that NAME a
   * studio they lead, through queries that name those studios, because the
   * rules now prove a list only that way (a status-only query is refused for
   * anyone but an administrator). Two queries a chunk of up to 30 studios:
   * `requestedStudioId` (a new person, front-door/my-request.ts) and
   * `studioId` (a studio-access request, studio-access-request.ts). Each is
   * written out as its own query with its field named LITERALLY: the index
   * guard (lib/firestore-index-guard.ts) reads this source, and a field it
   * can't follow is "unreadable", which fails firestore-indexes.test.ts. */
  const plan = requestQueryPlan(reader);
  const planKey = plan.kind === "studios" ? `studios:${plan.studioIds.join("|")}` : plan.kind;
  useEffect(() => {
    if (plan.kind === "none") {
      setRequests([]);
      return;
    }
    const toRequests = (docs: { id: string; data: () => unknown }[]): AccessRequest[] =>
      docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AccessRequest, "id">) }));
    const onError = (err: unknown) => handleFirestoreError(err, OperationType.GET, "access_requests");
    if (plan.kind === "all") {
      const unsub = onSnapshot(
        query(collection(db, "access_requests"), where("status", "==", "Pending")),
        (snap) => setRequests(toRequests(snap.docs)),
        onError,
      );
      return () => unsub();
    }
    // One slot per listener, merged by id on every snapshot.
    const groups: AccessRequest[][] = [];
    const unsubs: (() => void)[] = [];
    const publish = () => setRequests(mergeRequests(groups));
    plan.chunks.forEach((chunk, i) => {
      groups[2 * i] = [];
      groups[2 * i + 1] = [];
      unsubs.push(
        onSnapshot(
          query(collection(db, "access_requests"), where("status", "==", "Pending"), where("requestedStudioId", "in", chunk)),
          (snap) => {
            groups[2 * i] = toRequests(snap.docs);
            publish();
          },
          onError,
        ),
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, "access_requests"), where("status", "==", "Pending"), where("studioId", "in", chunk)),
          (snap) => {
            groups[2 * i + 1] = toRequests(snap.docs);
            publish();
          },
          onError,
        ),
      );
    });
    return () => unsubs.forEach((u) => u());
    // The plan is keyed on its joined ids, so a new trainer object with the
    // same studios keeps the listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  /* ---- Mindbody staff for this studio's site ------------------------ */
  const siteId = studio?.mindbodySiteId;
  const mode = studio?.mindbodyMode;
  useEffect(() => {
    setMindbodyChecked(false);
    if (spanning) {
      setMindbodyStaff([]);
      setStaffStatus(MINDBODY_PER_STUDIO);
      return;
    }
    if (!siteId) {
      setMindbodyStaff([]);
      setStaffStatus(
        !hasStudio
          ? ""
          : mode === "offline"
            ? "This studio runs offline — nobody arrives from Mindbody."
            : "No Mindbody Site ID on this studio yet.",
      );
      return;
    }
    let cancelled = false;
    setStaffStatus("Loading staff from Mindbody…");
    void (async () => {
      try {
        const res = await authedFetch("/api/mindbody/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: String(siteId) }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (cancelled) return;
          setMindbodyStaff([]);
          setStaffStatus(err?.error || "Mindbody did not return a staff list.");
          return;
        }
        const data = await res.json();
        // Reading the body is a second wait: the studio may have changed
        // during it, and the old studio's list must not land as checked.
        if (cancelled) return;
        setMindbodyStaff(data.staff || []);
        setStaffStatus("");
        setMindbodyChecked(true);
      } catch {
        if (!cancelled) {
          setMindbodyStaff([]);
          setStaffStatus("Could not reach Mindbody.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, mode, spanning, hasStudio]);

  const idsKey = studioIds ? studioIds.join("|") : null;
  const rows = useMemo(
    () =>
      buildStaffRoster({
        trainers,
        mindbodyStaff,
        requests,
        studioId,
        studioIds: studioId ? null : idsKey === null ? null : idsKey ? idsKey.split("|") : [],
        mindbodyChecked,
      }),
    [trainers, mindbodyStaff, requests, studioId, idsKey, mindbodyChecked],
  );
  const summary = useMemo(() => summariseRoster(rows), [rows]);

  return { rows, summary, requests, mindbodyStaff, staffStatus, mindbodyChecked };
}
