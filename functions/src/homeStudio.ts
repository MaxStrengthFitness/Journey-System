/**
 * homeStudioNotices and moveClientHome — "booked here, home studio elsewhere".
 *
 * Oct 20 2026 (Meg Pauly; the reasoning is in home-studio-logic.ts and
 * docs/DECISIONS.md#home-studio-notice). Two HTTPS callables, run with the
 * Admin SDK because the rules, on purpose, stop a leader opening or editing a
 * client filed at another studio:
 *
 *   homeStudioNotices({ studioId })  the clients with live bookings at this
 *       studio and none at the studio they are filed at, on this studio's
 *       Mindbody site. Names, counts and dates only: no clinical data.
 *   moveClientHome({ studioId, clientId })  files one of them at this studio.
 *       Writes `homeStudioId` and nothing else, after re-checking the same
 *       evidence, so a stale list can never move someone it should not.
 *
 * Both need a head trainer, studio leader, studio owner or franchise owner OF
 * THAT STUDIO (or the grant, or an administrator): mayMoveClientsTo.
 *
 * COST. One read per booking at the studio in the last 30 days (a few thousand
 * at the busiest), field-masked, plus one per client and a small query per
 * candidate. The app asks once per visit to Today and caches the answer.
 *
 * Nothing here calls Mindbody and nothing here runs on a timer.
 *
 * DEPLOY: firebase deploy --only functions:homeStudioNotices,functions:moveClientHome
 */

import { Firestore, Timestamp, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  NOTICE_CANDIDATE_CAP,
  NOTICE_WINDOW_DAYS,
  homeOf,
  mayMoveClientsTo,
  noEvidenceBecause,
  tallyBookings,
} from "./home-studio-logic";

const REGION = "us-central1";
const JOURNEY_DATABASE = "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa";

function firestore(): Firestore {
  return getFirestore(JOURNEY_DATABASE);
}

export interface HomeStudioNotice {
  clientId: string;
  name: string;
  /** Live bookings at the asking studio in the window, and the latest start (ISO). */
  here: number;
  lastAt: string | null;
  /** The studio she is filed at, or null when none yet. */
  homeStudioId: string | null;
  homeStudioName: string | null;
}

export interface HomeStudioNoticesResult {
  studioName: string;
  notices: HomeStudioNotice[];
  /** True when there were more candidates than one answer holds. */
  truncated: boolean;
}

async function callerMayMoveTo(uid: string, studioId: string): Promise<void> {
  const snap = await firestore().collection("trainers").doc(uid).get();
  if (!snap.exists || !mayMoveClientsTo(snap.data(), studioId)) {
    throw new HttpsError("permission-denied", "Only this studio's leaders can see or move these clients.");
  }
}

function studioIdArg(data: unknown): string {
  const id = (data as { studioId?: unknown } | null)?.studioId;
  if (typeof id !== "string" || id.trim() === "") throw new HttpsError("invalid-argument", "A studio is required.");
  return id.trim();
}

function sinceStamp(): Timestamp {
  return Timestamp.fromMillis(Date.now() - NOTICE_WINDOW_DAYS * 86400000);
}

async function studioInfo(fs: Firestore, studioId: string): Promise<{ name: string; site: string }> {
  const s = await fs.collection("studios").doc(studioId).get();
  if (!s.exists) throw new HttpsError("not-found", "No such studio.");
  const d = s.data() ?? {};
  return { name: String(d.name ?? studioId), site: d.mindbodySiteId == null ? "" : String(d.mindbodySiteId).trim() };
}

/** Live bookings the client has in the window at one studio. */
async function liveBookingsAt(fs: Firestore, clientId: string, studioId: string, since: Timestamp): Promise<number> {
  const snap = await fs
    .collection("schedules")
    .where("clientId", "==", clientId)
    .where("startTime", ">=", since)
    .select("studioId", "status")
    .get();
  return snap.docs.filter((d) => d.get("studioId") === studioId && d.get("status") !== "Cancelled").length;
}

export const homeStudioNotices = onCall({ region: REGION }, async (request): Promise<HomeStudioNoticesResult> => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const studioId = studioIdArg(request.data);
  await callerMayMoveTo(request.auth.uid, studioId);

  const fs = firestore();
  const since = sinceStamp();
  const studio = await studioInfo(fs, studioId);
  // Only a studio that shares its Mindbody site with another can have this problem.
  // (All studios are read and counted here: the collection is a handful of documents, and a
  // filtered query would need an index of its own.)
  const sharing = studio.site
    ? (await fs.collection("studios").get()).docs.filter((s) => String(s.get("mindbodySiteId") ?? "").trim() === studio.site).length > 1
    : false;
  if (!sharing) return { studioName: studio.name, notices: [], truncated: false };

  const rows = await fs
    .collection("schedules")
    .where("studioId", "==", studioId)
    .where("startTime", ">=", since)
    .select("clientId", "status", "startTime")
    .get();
  const here = tallyBookings(
    rows.docs.map((d) => ({ clientId: d.get("clientId"), status: d.get("status"), startMs: (d.get("startTime") as Timestamp | undefined)?.toMillis?.() })),
  );

  const ids = [...here.keys()];
  const clientDocs: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    clientDocs.push(
      ...(await fs.getAll(...ids.slice(i, i + 300).map((id) => fs.collection("clients").doc(id)), {
        fieldMask: ["firstName", "lastName", "homeStudioId", "studioId", "mindbodySiteId", "approvedCrossTrainStudioIds"],
      })),
    );
  }

  // Candidates: filed elsewhere (or nowhere), on this site. Whether she ALSO trains at the
  // filed studio is one small query each, so only these are asked.
  const candidates = clientDocs.filter((c) => c.exists && homeOf(c.data()!) !== studioId);
  const truncated = candidates.length > NOTICE_CANDIDATE_CAP;
  const names = new Map<string, string>();
  const notices: HomeStudioNotice[] = [];
  for (const c of candidates.slice(0, NOTICE_CANDIDATE_CAP)) {
    const d = c.data()!;
    const home = homeOf(d);
    const tally = here.get(c.id)!;
    const atHome = home ? await liveBookingsAt(fs, c.id, home, since) : 0;
    const clientSite = d.mindbodySiteId == null ? "" : String(d.mindbodySiteId).trim();
    const approvedHere = Array.isArray(d.approvedCrossTrainStudioIds) && d.approvedCrossTrainStudioIds.includes(studioId);
    if (noEvidenceBecause({ studioId, studioSite: studio.site, home, clientSite, here: tally.count, atHome, approvedHere }) !== null) continue;
    let homeName: string | null = null;
    if (home) {
      if (!names.has(home)) names.set(home, (await studioInfo(fs, home).catch(() => ({ name: home, site: "" }))).name);
      homeName = names.get(home)!;
    }
    notices.push({
      clientId: c.id,
      name: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || "A client",
      here: tally.count,
      lastAt: tally.lastMs ? new Date(tally.lastMs).toISOString() : null,
      homeStudioId: home,
      homeStudioName: homeName,
    });
  }
  notices.sort((a, b) => a.name.localeCompare(b.name));
  return { studioName: studio.name, notices, truncated };
});

export const moveClientHome = onCall({ region: REGION }, async (request): Promise<{ clientId: string; from: string | null; to: string }> => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const studioId = studioIdArg(request.data);
  const clientId = (request.data as { clientId?: unknown } | null)?.clientId;
  if (typeof clientId !== "string" || clientId.trim() === "") throw new HttpsError("invalid-argument", "A client is required.");
  await callerMayMoveTo(request.auth.uid, studioId);

  const fs = firestore();
  const since = sinceStamp();
  const [studio, snap] = await Promise.all([studioInfo(fs, studioId), fs.collection("clients").doc(clientId).get()]);
  if (!snap.exists) throw new HttpsError("not-found", "No such client.");
  const d = snap.data()!;
  const home = homeOf(d);
  const [here, atHome] = await Promise.all([
    liveBookingsAt(fs, clientId, studioId, since),
    home ? liveBookingsAt(fs, clientId, home, since) : Promise.resolve(0),
  ]);
  const clientSite = d.mindbodySiteId == null ? "" : String(d.mindbodySiteId).trim();
  const approvedHere = Array.isArray(d.approvedCrossTrainStudioIds) && d.approvedCrossTrainStudioIds.includes(studioId);
  const why = noEvidenceBecause({ studioId, studioSite: studio.site, home, clientSite, here, atHome, approvedHere });
  if (why) throw new HttpsError("failed-precondition", why);

  // The one field. Not the rest of the record, not Mindbody.
  await snap.ref.update({ homeStudioId: studioId });
  console.log(`moveClientHome: ${clientId} ${home ?? "(none)"} -> ${studioId} by ${request.auth.uid}`);
  return { clientId, from: home, to: studioId };
});
