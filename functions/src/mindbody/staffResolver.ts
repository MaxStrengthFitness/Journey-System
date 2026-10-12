/**
 * STAFF RESOLVER — which trainer document a Mindbody staff event belongs to.
 *
 * WHY THIS IS NOT `doc(staffId)`
 * ------------------------------
 * Clients are stored at a canonical path keyed by their Mindbody id, so
 * `clientResolver` can look one up directly. Trainers cannot work that way:
 * a trainer document id is the FIREBASE AUTH UID, because that id is what the
 * security rules compare against `request.auth.uid`. The Mindbody staff id is
 * therefore a field, and finding a trainer means a query.
 *
 * THE RULE
 * --------
 * A staff webhook NEVER creates a trainer document.
 *
 * `ensureCanonicalClient` may create a client, and that is safe: a client
 * document grants nothing. A trainer document is an RBAC principal -- it
 * carries `role` and studio access -- so letting an external system
 * mint one is precisely the privilege-escalation shape the rules audit already
 * caught once. An unmatched staff member goes to the limbo queue and waits for
 * a human to link them in Edit Trainer.
 *
 * THE SITE (Oct 12 2026)
 * ----------------------
 * Each Mindbody site numbers its own staff, so a staff id alone is not a
 * person. A staff event is matched only to a trainer whose staff id is on the
 * event's site (`resolveStaffAtSite`, the rule in ./staffSite.ts), and a
 * booking's trainer is looked up AT the booking's studio
 * (`resolveTrainerAtStudio`), never company-wide and never with a limit that
 * other sites' trainers can fill. `resolveTrainerByStaffId` is left exactly as
 * it was, for a staff event that names no site.
 * docs/rounds/2026-10-12-staff-webhook.md.
 */
import { Firestore } from "firebase-admin/firestore";
import {
  candidateOf,
  decideStaffAtSite,
  staffIdForms,
  StaffCandidate,
  SiteStaffResolution,
  StudioSite,
} from "./staffSite";

export type StaffResolution =
  | { kind: "matched"; trainerId: string }
  | { kind: "unlinked" }
  /** Two or more trainers claim the same staff id: a data error, not a guess. */
  | { kind: "ambiguous"; trainerIds: string[] };

/**
 * Finds the trainer carrying this Mindbody staff id.
 *
 * Queries the string form first, then the numeric form. Both exist in the
 * wild: the trainer modals used to write whatever the picker handed them, so
 * older documents can hold `100000012` as a number and newer ones the string
 * "100000012". Firestore's `==` is type-strict, so one query cannot find both.
 * The modals now normalise on write and the backfill repairs old rows -- this
 * second query is what keeps the sync working in the meantime.
 *
 * Single-field equality, served by the trainers (mindbodyStaffId,
 * primaryHomeStudioId) composite. This database is the Enterprise edition: it
 * builds no index by itself, and before that composite every webhook booking
 * read the whole trainers collection (Query Insights, Oct 5 2026).
 */
export async function resolveTrainerByStaffId(
  firestore: Firestore,
  staffId: string | number,
): Promise<StaffResolution> {
  const asString = String(staffId).trim();
  if (!asString) return { kind: "unlinked" };

  const candidates: (string | number)[] = [asString];
  const asNumber = Number(asString);
  if (Number.isFinite(asNumber) && String(asNumber) === asString) {
    candidates.push(asNumber);
  }

  const found = new Set<string>();
  for (const value of candidates) {
    const snap = await firestore
      .collection("trainers")
      .where("mindbodyStaffId", "==", value)
      .limit(3)
      .get();
    snap.forEach((doc) => found.add(doc.id));
    if (found.size > 1) break;
  }

  if (found.size === 0) return { kind: "unlinked" };
  if (found.size > 1) return { kind: "ambiguous", trainerIds: [...found] };
  return { kind: "matched", trainerId: [...found][0] };
}

/**
 * Every live trainer carrying this staff id, in string and number form, with
 * NO limit (a cap is the blind spot this replaces: at 75 sites one number can
 * be held once per site). Merged-away documents are dropped. Staff events are
 * rare, a handful a week.
 *
 * Single-field equality, served by the trainers (mindbodyStaffId,
 * primaryHomeStudioId) composite, which leads with it.
 */
export async function findTrainersByStaffId(
  firestore: Firestore,
  staffId: string | number,
): Promise<StaffCandidate[]> {
  const forms = staffIdForms(staffId);
  const snaps = await Promise.all(
    forms.map((value) =>
      firestore.collection("trainers").where("mindbodyStaffId", "==", value).get(),
    ),
  );
  const found = new Map<string, StaffCandidate>();
  for (const snap of snaps) {
    snap.forEach((doc) => {
      if (found.has(doc.id)) return;
      const candidate = candidateOf(doc.id, doc.data() as Record<string, unknown> | undefined);
      if (candidate) found.set(doc.id, candidate);
    });
  }
  return [...found.values()];
}

/**
 * A staff event's trainer on its site (./staffSite.ts decideStaffAtSite).
 * A site no studio is linked to is answered without reading trainers.
 */
export async function resolveStaffAtSite(
  firestore: Firestore,
  staffId: string | number,
  siteId: string,
  studios: readonly StudioSite[],
  eventNames: readonly string[] = [],
): Promise<SiteStaffResolution> {
  const site = siteId.trim();
  if (!studios.some((s) => s.siteId.trim() === site)) return { kind: "unmapped-site" };
  const candidates = await findTrainersByStaffId(firestore, staffId);
  return decideStaffAtSite(candidates, site, studios, eventNames);
}

/**
 * The trainer a booking's staff id names AT this studio, or null.
 *
 * For each form of the id, two studio-scoped queries, all in parallel:
 *   mindbodyStaffId == id AND primaryHomeStudioId == studio
 *     (the trainers (mindbodyStaffId, primaryHomeStudioId) composite, exactly)
 *   mindbodyStaffId == id AND accessibleStudioIds array-contains studio
 *     (the trainers (mindbodyStaffId, accessibleStudioIds CONTAINS) composite)
 * Merged-away documents are dropped; the rest are joined by id. Exactly one
 * trainer at the studio is the answer; none or two-plus is null, today's rule
 * (and the keep-the-row's-trainer fallback in index.ts decides from there).
 * No limit: each query is one staff id at one studio, a handful at most, and
 * no other site's trainer can crowd the studio's own out of the answer.
 */
export async function resolveTrainerAtStudio(
  firestore: Firestore,
  staffId: string | number,
  studioId: string,
): Promise<{ id: string; fullName: string } | null> {
  const forms = staffIdForms(staffId);
  if (forms.length === 0 || !studioId) return null;
  const snaps = await Promise.all([
    ...forms.map((value) =>
      firestore
        .collection("trainers")
        .where("mindbodyStaffId", "==", value)
        .where("primaryHomeStudioId", "==", studioId)
        .get(),
    ),
    ...forms.map((value) =>
      firestore
        .collection("trainers")
        .where("mindbodyStaffId", "==", value)
        .where("accessibleStudioIds", "array-contains", studioId)
        .get(),
    ),
  ]);
  const here = new Map<string, StaffCandidate>();
  for (const snap of snaps) {
    snap.forEach((doc) => {
      if (here.has(doc.id)) return;
      const candidate = candidateOf(doc.id, doc.data() as Record<string, unknown> | undefined);
      if (candidate) here.set(doc.id, candidate);
    });
  }
  if (here.size !== 1) return null;
  const [only] = [...here.values()];
  return { id: only.id, fullName: only.fullName };
}
