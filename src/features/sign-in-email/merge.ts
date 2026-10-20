/**
 * MERGING TWO TRAINER RECORDS FOR ONE PERSON — the pure half of Merge on
 * Admins → Studios → Team (team-board.ts) and of the one-off
 * scripts/merge-trainer-records.ts (the sign-in email round, Oct 20 2026).
 *
 * The screen writes two documents (the kept record, the tombstone) and moves
 * no bookings: the Hub reads a booking naming a merged record as the kept
 * one's (hub-schedule/columns.ts mergedAliases), and the next sync rewrites
 * today onward. The script also moves every stored reference, for a record
 * with history behind it.
 *
 * Why: Kyle McManus and Kayla Sharratt each have an August record (an
 * auto-id, Mindbody's staff id, every Mindbody booking pointing at it) and,
 * since their first Microsoft sign-in, a record at their own uid that they
 * sign in to and that nothing points at. AJ: "i need a way to fix Austin
 * Kyle and Kayla so they are logging in and its logging into their profile
 * linked with their clients and mindbody and all their notes and such."
 *
 * The record KEPT is always the one at the person's uid: the rules know the
 * signed-in person only at trainers/{uid}. From the other it takes the
 * Mindbody link (and anything it lacks that the old one has), every
 * reference to the old id is repointed, and the old record becomes a
 * tombstone pointing at the kept one (supersededByUid, the claim's own
 * marker), with its staff id cleared so no sync ever sees two.
 *
 * "Bookings only" (--bookings-only) is AJ's own case: the gmail record stays
 * his administrator account, and only what he coached moves to his trainer
 * account.
 */

/** A field that stores a trainer DOCUMENT id (not an Auth uid). */
export interface Reference {
  collection: string;
  field: string;
}

/**
 * Where a trainer's document id is stored (the Oct 20 2026 sweep). Bookings
 * first: `schedules.trainerId` decides the Hub's column (hub-schedule/
 * columns.ts), and only today onward is rewritten by the next sync.
 * `sessions.rollupTrainerId` is left alone on purpose: it is the counter
 * the session was counted to (functions/src/trainerRollups.ts), and moving it
 * would not move the count.
 */
export const BOOKING_REFERENCES: Reference[] = [{ collection: "schedules", field: "trainerId" }];

export const SESSION_REFERENCES: Reference[] = [
  { collection: "sessions", field: "trainerId" },
  { collection: "sessions", field: "startedByTrainerId" },
];

export const OTHER_REFERENCES: Reference[] = [
  { collection: "routines", field: "trainerId" },
  { collection: "routineAdjustments", field: "trainerId" },
  { collection: "progressReports", field: "trainerId" },
  { collection: "clientFocuses", field: "trainerId" },
  { collection: "clinicalIncidents", field: "reportedByTrainerId" },
  { collection: "clients", field: "primaryTrainerId" },
  { collection: "clients", field: "topTrainerId" },
  { collection: "studios", field: "headTrainerId" },
  { collection: "studios", field: "ownerId" },
];

export type Mode = "merge" | "bookings-only";

export function referencesFor(mode: Mode): Reference[] {
  return mode === "merge"
    ? [...BOOKING_REFERENCES, ...SESSION_REFERENCES, ...OTHER_REFERENCES]
    : [...BOOKING_REFERENCES, ...SESSION_REFERENCES];
}

type Doc = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

export interface MergeCheck {
  ok: boolean;
  reason?: string;
}

/** Refuses anything but an old record folding into the person's own uid record. */
export function checkMerge(fromId: string, from: Doc | null, intoId: string, into: Doc | null, mode: Mode): MergeCheck {
  if (!from) return { ok: false, reason: `trainers/${fromId} doesn't exist.` };
  if (!into) return { ok: false, reason: `trainers/${intoId} doesn't exist.` };
  if (fromId === intoId) return { ok: false, reason: "That is the same record twice." };
  if (text(into.supersededByUid)) return { ok: false, reason: `trainers/${intoId} is itself merged away.` };
  if (intoId.length !== 28 || (text(into.authUid) && text(into.authUid) !== intoId)) {
    return { ok: false, reason: `trainers/${intoId} is not a signed-in account (the kept record must be at the person's uid).` };
  }
  if (into.isActive === false) return { ok: false, reason: `trainers/${intoId} is switched off.` };
  if (mode === "merge") {
    if (text(from.supersededByUid)) return { ok: false, reason: `trainers/${fromId} is already merged into ${text(from.supersededByUid)}.` };
    const a = text(from.mindbodyStaffId);
    const b = text(into.mindbodyStaffId);
    if (a && b && a !== b) return { ok: false, reason: `They carry different Mindbody staff ids (${a} and ${b}): check they are one person.` };
  }
  return { ok: true };
}

/** What the kept record takes from the old one: only what it lacks. */
export function keptPatch(from: Doc, into: Doc, fromId: string, mode: Mode): Doc {
  const patch: Doc = {};
  if (mode === "bookings-only") {
    // Only the pointer, so screens that read claimedFromId count the old id as theirs.
    if (!text(into.claimedFromId)) patch.claimedFromId = fromId;
    return patch;
  }
  const staff = text(from.mindbodyStaffId);
  if (staff && !text(into.mindbodyStaffId)) {
    patch.mindbodyStaffId = staff;
    patch.mindbodyLinked = true;
  }
  if (from.mindbody && typeof from.mindbody === "object" && !into.mindbody) patch.mindbody = from.mindbody;
  for (const key of ["initials", "nickname", "photoUrl", "order", "brandColor"] as const) {
    if (from[key] != null && from[key] !== "" && (into[key] == null || into[key] === "")) patch[key] = from[key];
  }
  const roster = (v: unknown) => (Array.isArray(v) ? (v as Doc[]) : []);
  const kept = roster(into.kaizenRoster);
  const extra = roster(from.kaizenRoster).filter((e) => !kept.some((k) => text(k.clientId) && text(k.clientId) === text(e.clientId)));
  if (extra.length > 0) patch.kaizenRoster = [...kept, ...extra];
  if (!text(into.claimedFromId)) patch.claimedFromId = fromId;
  const merged = Array.isArray(into.mergedFromIds) ? (into.mergedFromIds as string[]) : [];
  if (!merged.includes(fromId)) patch.mergedFromIds = [...merged, fromId];
  return patch;
}

/**
 * Someone signs in as this record: it is at their uid (a Firebase Auth uid is
 * 28 characters, an auto-id 20) or carries their authUid.
 */
export function isSignedInRecord(id: string, d: Doc): boolean {
  return id.length === 28 || (text(d.authUid) !== "" && text(d.authUid) === id);
}

/**
 * What the old record becomes: a pointer at the kept one, holding no staff
 * id. When someone signs in AS it (Mike Palko's gmail, Oct 20 2026), it is
 * also switched off, so that sign-in is refused with a sentence instead of
 * opening a record nothing points at any more (AJ: "Switch it off").
 */
export function tombstonePatch(
  from: Doc,
  intoId: string,
  nowIso: string,
  switchOff?: { fromId: string; by: { uid: string; name: string } },
): Doc {
  return {
    supersededByUid: intoId,
    supersededAt: nowIso,
    systemStatus: "superseded",
    isVisibleOnCalendar: false,
    ...(text(from.mindbodyStaffId) ? { mindbodyStaffId: "", mindbodyLinked: false, mergedMindbodyStaffId: text(from.mindbodyStaffId) } : {}),
    ...(from.pendingClaim === true ? { pendingClaim: false } : {}),
    ...(switchOff && isSignedInRecord(switchOff.fromId, from)
      ? { isActive: false, switchedOffAt: nowIso, switchedOffBy: { uid: switchOff.by.uid, name: switchOff.by.name.trim().slice(0, 80) || "An administrator" } }
      : {}),
  };
}

/** What never travels to the record at someone's uid: who it was, and dead credentials. */
const NOT_CARRIED = [
  "id",
  "pendingClaim",
  "supersededByUid",
  "supersededAt",
  "systemStatus",
  "authUid",
  "email",
  "claimedFromId",
  "claimedAt",
  "mergedFromIds",
  "mergedMindbodyStaffId",
  "isActive",
  "switchedOffAt",
  "switchedOffBy",
  // Trainer PINs were removed in Sep 2026; the rules refuse a record that
  // still carries pinHash (isValidTrainer).
  "pin",
  "pinHash",
  "requiresPinReset",
];

/**
 * The record written at a person's sign-in uid, made from the profile they
 * already have (an administrator linking a sign-in to it, or the script):
 * the same role, studios, Mindbody link and roster, signed in as `email`,
 * pointing back at where it came from. Nothing waits for them to sign in
 * again, and it works for any role: a claim can't hand anyone Admin
 * (selfCreatedRoleIsAllowed), an administrator's write can.
 */
export function movedRecord(source: Doc, sourceId: string, uid: string, opts: { email: string; nowIso: string; fullName?: string }): Doc {
  const out: Doc = {};
  for (const [k, v] of Object.entries(source)) if (!NOT_CARRIED.includes(k) && v !== undefined) out[k] = v;
  out.authUid = uid;
  out.email = opts.email.trim().toLowerCase();
  out.claimedFromId = sourceId;
  out.claimedAt = opts.nowIso;
  out.mergedFromIds = [sourceId];
  out.systemStatus = "active";
  if (text(out.mindbodyStaffId)) out.mindbodyLinked = true;
  if (opts.fullName && opts.fullName.trim()) out.fullName = opts.fullName.trim().replace(/\s+/g, " ");
  return out;
}

/** Writes in Firestore's batch limit, leaving room. */
export function chunks<T>(items: readonly T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
