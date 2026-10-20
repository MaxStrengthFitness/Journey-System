/**
 * "BOOKED HERE, HOME STUDIO ELSEWHERE" — the rules, with no Firebase in them.
 *
 * Oct 20 2026. westlake, Strongsville and Willoughby share one Mindbody site,
 * and a client event on a shared site names no location, so a client's home
 * studio comes from Mindbody's "Home location" field and is never moved
 * afterwards. Meg Pauly's Home location said westlake while she trained at
 * Strongsville: she was filed at westlake, absent from Strongsville's
 * directory, and unreadable to Strongsville's leaders (the rules decide who
 * may open a record by its home studio, on purpose).
 *
 * Only an administrator could move her. These rules let a leader of the
 * studio she trains at do it, and only on evidence: she has live bookings
 * here and none at the studio she is filed at, in the same recent window,
 * on the same Mindbody site. Nothing here moves anyone by itself.
 */

/** How far back a booking counts as "she trains here". Future bookings count too. */
export const NOTICE_WINDOW_DAYS = 30;

/** More candidates than this in one answer are cut off and the answer says so. */
export const NOTICE_CANDIDATE_CAP = 60;

const DEMO_STUDIO_ID = "demo-studio";

const SUPER_ROLES: ReadonlySet<string> = new Set(["Admin", "Founder", "Overseer"]);
/** The roles that run their OWN studios (home and owned). Mirrors the rules' roleRunsOwnStudios. */
const RUNS_OWN_STUDIOS: ReadonlySet<string> = new Set(["StudioOwner", "HeadTrainer", "StudioLeader", "FranchiseOwner", "Owner"]);

export interface TrainerLike {
  role?: unknown;
  primaryHomeStudioId?: unknown;
  ownedStudioIds?: unknown;
  managedStudioIds?: unknown;
}

function idList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];
}

/**
 * May this person move a client TO this studio: an administrator; a head
 * trainer, studio leader, studio owner or franchise owner at their home or an
 * owned studio; or a trainer given the grant (`managedStudioIds`). The same
 * answer the rules' `trainerLeads` gives, and never Demo Mode (a practice
 * studio takes no real client).
 */
export function mayMoveClientsTo(t: TrainerLike | null | undefined, studioId: string): boolean {
  if (!t || !studioId || studioId === DEMO_STUDIO_ID) return false;
  const role = typeof t.role === "string" ? t.role : "";
  if (SUPER_ROLES.has(role)) return true;
  if (RUNS_OWN_STUDIOS.has(role) && (t.primaryHomeStudioId === studioId || idList(t.ownedStudioIds).includes(studioId))) return true;
  return idList(t.managedStudioIds).includes(studioId);
}

export interface EvidenceInput {
  /** The studio the client is booked at, and the one Mindbody site it is on. */
  studioId: string;
  studioSite: string;
  /** The client's filed studio (null when none yet) and their Mindbody site. */
  home: string | null;
  clientSite: string;
  /** Live (not cancelled) bookings in the window, at this studio and at the filed one. */
  here: number;
  atHome: number;
  /** She is approved to train here as a visitor (approvedCrossTrainStudioIds): a decision already made. */
  approvedHere?: boolean;
}

/**
 * Why a client should NOT be offered or moved, or null when the evidence
 * holds. A sentence, because a leader reads it when a move is refused.
 */
export function noEvidenceBecause(e: EvidenceInput): string | null {
  if (e.home === e.studioId) return "She is already filed at this studio.";
  if (e.home === DEMO_STUDIO_ID) return "A practice-studio record is never moved.";
  if (!e.studioSite || !e.clientSite || e.clientSite !== e.studioSite) {
    return "Journey can't tell that this client is on this studio's Mindbody site, so it won't move her.";
  }
  if (e.approvedHere) return "She is approved to train here as a visitor, which is a decision already made.";
  if (e.here <= 0) return `No live booking at this studio in the last ${NOTICE_WINDOW_DAYS} days.`;
  if (e.atHome > 0) return "She also trains at the studio she is filed at, so there is nothing to correct.";
  return null;
}

/** A client's filed studio: `homeStudioId`, else the older `studioId`, else none. Mirrors the rules' getStudioIdFromData. */
export function homeOf(c: { homeStudioId?: unknown; studioId?: unknown }): string | null {
  for (const v of [c.homeStudioId, c.studioId]) if (typeof v === "string" && v !== "") return v;
  return null;
}

export interface BookingLike {
  clientId?: unknown;
  status?: unknown;
  startTime?: unknown;
}

/** Live bookings per client at one studio, and the latest start (ms) among them. Cancelled and client-less rows are not counted. */
export function tallyBookings(
  rows: ReadonlyArray<BookingLike & { startMs?: number }>,
): Map<string, { count: number; lastMs: number }> {
  const out = new Map<string, { count: number; lastMs: number }>();
  for (const r of rows) {
    if (r.status === "Cancelled" || typeof r.clientId !== "string" || r.clientId === "") continue;
    const cur = out.get(r.clientId) ?? { count: 0, lastMs: 0 };
    cur.count++;
    if (typeof r.startMs === "number" && r.startMs > cur.lastMs) cur.lastMs = r.startMs;
    out.set(r.clientId, cur);
  }
  return out;
}
