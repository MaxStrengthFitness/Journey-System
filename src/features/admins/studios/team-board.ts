/**
 * A STUDIO'S STAFF, ORGANISED — what Admins → Studios → a studio → Team
 * lists, and in what order (the sign-in email round, Oct 20 2026). PURE.
 *
 * AJ: "we need to have ultimate control over user profiles from the admin
 * screen, we need to be able to organize the studio staff list a better,
 * make sure emails are linked and synced with mindbody and also any names or
 * nicknames are easy to deal with." Strongsville's list showed Kyle and
 * Kayla twice each (an August record Mindbody's bookings point at, and the
 * record they sign in to), three Rotation rows among the trainers, and
 * nothing to say which was which.
 *
 * The groups, in the order a person needs to act on them:
 *
 *   needs     one person on two records (Merge), or a signed-in trainer with
 *             no Mindbody link (Link): bookings land on neither
 *   team      signed in, and linked to Mindbody (or never on the floor:
 *             someone hidden from the calendar, an administrator)
 *   waiting   on Mindbody's staff list with a Journey record nobody has
 *             signed in as yet: their bookings show, they haven't come in
 *   rotation  the studio's Rotation rows: bookings nobody in particular holds
 *   off       switched off
 *
 * Each person carries what Journey and Mindbody disagree on (name, email),
 * so the editor can offer Mindbody's with one tap. Never ranked: names A–Z.
 */

import type { Trainer } from "../../../types";
import type { MindbodyStaff } from "../../admin/staff/roster";
import { isRotationName } from "../../standing-week/check";
import { isSwitchedOff } from "../../sign-out/account-off";
import { neverSignedIn, normalEmail } from "../../sign-in-email/sign-in-email";

export type TeamGroup = "needs" | "team" | "waiting" | "rotation" | "off";

export interface TeamEntry {
  trainer: Trainer;
  group: TeamGroup;
  /** The Mindbody staff member this record is linked to, when Mindbody's list was read. */
  mindbody: MindbodyStaff | null;
  /** Needs: the other record for the same person (Merge), kept is the signed-in one. */
  mergeWith: Trainer | null;
  /** Needs: a Mindbody staff member with no record who could be this person (Link). */
  linkTo: MindbodyStaff | null;
  /** One short sentence for the row, or null. */
  note: string | null;
  /** Where Journey and Mindbody disagree, Mindbody's side. */
  mindbodyName: string | null;
  mindbodyEmail: string | null;
}

const nameKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const signedIn = (t: Trainer) => !neverSignedIn(t) && !t.supersededByUid && (Boolean(t.authUid) || t.id.length === 28);

function worksHere(t: Trainer, studioId: string): boolean {
  return (
    t.primaryHomeStudioId === studioId ||
    (t.accessibleStudioIds ?? []).includes(studioId) ||
    (t.activeGuestStudioIds ?? []).includes(studioId)
  );
}

/** A trainer the floor sees: on the calendar. An administrator hidden from it needs no Mindbody link. */
const onTheFloor = (t: Trainer) => t.isVisibleOnCalendar !== false;

export function teamBoard(input: {
  trainers: readonly Trainer[];
  studioId: string;
  /** The studio site's staff list; empty when not read (no link is then judged). */
  mindbodyStaff: readonly MindbodyStaff[];
  mindbodyRead: boolean;
}): TeamEntry[] {
  const { studioId, mindbodyStaff, mindbodyRead } = input;
  const here = input.trainers.filter((t) => !t.supersededByUid && !t.id.startsWith("demo-trainer-") && worksHere(t, studioId));
  const staffById = new Map(mindbodyStaff.map((s) => [String(s.id), s]));
  const linkedStaff = new Set(here.map((t) => String(t.mindbodyStaffId ?? "")).filter(Boolean));

  // One person on two records: the same name, or the same Mindbody staff id
  // (Mike Palko, Oct 20 2026: "Michael Palko" and "Mike Palko Strongsville"
  // both carried 100000062, so the sync matched neither and his bookings
  // went to Unassigned). Two different staff ids are two people.
  const staffOf = (t: Trainer) => String(t.mindbodyStaffId ?? "").trim();
  // Two accounts people sign in to pair only on a shared staff id, never on a
  // name: AJ keeps a gmail administrator account and a trainer account, both
  // "Austin Jurgens", on purpose.
  const samePerson = (a: Trainer, b: Trainer) =>
    !(staffOf(a) && staffOf(b) && staffOf(a) !== staffOf(b)) &&
    ((staffOf(a) !== "" && staffOf(a) === staffOf(b)) ||
      (!(signedIn(a) && signedIn(b)) && nameKey(a.fullName) !== "" && nameKey(a.fullName) === nameKey(b.fullName)));
  const pairOf = new Map<string, Trainer>();
  const live = here.filter((t) => !isSwitchedOff(t) && !isRotationName(t.fullName));
  for (const a of live) {
    if (pairOf.has(a.id)) continue;
    const b = live.find((o) => o.id !== a.id && !pairOf.has(o.id) && samePerson(a, o));
    if (b) {
      pairOf.set(a.id, b);
      pairOf.set(b.id, a);
    }
  }
  const why = (a: Trainer, b: Trainer) =>
    staffOf(a) && staffOf(a) === staffOf(b) ? `both linked to Mindbody staff ${staffOf(a)}` : "the same name";

  const entries: TeamEntry[] = [];
  for (const t of here) {
    const staffId = String(t.mindbodyStaffId ?? "");
    const mb = staffId ? (staffById.get(staffId) ?? null) : null;
    const base = {
      trainer: t,
      mindbody: mb,
      mergeWith: null as Trainer | null,
      linkTo: null as MindbodyStaff | null,
      note: null as string | null,
      mindbodyName: mb && nameKey(mb.fullName) !== nameKey(t.fullName) ? mb.fullName : null,
      mindbodyEmail: mb?.email && normalEmail(mb.email) !== normalEmail(t.email) ? normalEmail(mb.email) : null,
    };
    if (isSwitchedOff(t)) {
      entries.push({ ...base, group: "off" });
      continue;
    }
    if (isRotationName(t.fullName)) {
      entries.push({ ...base, group: "rotation" });
      continue;
    }
    const pair = pairOf.get(t.id);
    if (pair) {
      // One signs in and one doesn't: listed once, on the record they sign in
      // to, and Merge folds the other in. Otherwise both are listed, each
      // with "Keep this one": an administrator chooses.
      if (signedIn(t) !== signedIn(pair)) {
        if (!signedIn(t)) continue;
        entries.push({
          ...base,
          group: "needs",
          mergeWith: pair,
          note: `Two records: the one they sign in to, and ${pair.mindbodyStaffId ? `one linked to Mindbody (staff ${pair.mindbodyStaffId})` : "an older one"}. Merge keeps this one.`,
        });
      } else {
        entries.push({
          ...base,
          group: "needs",
          mergeWith: pair,
          note: `Also on the record "${pair.fullName}" (${why(t, pair)})${signedIn(pair) ? `, which signs in as ${pair.email || "another account"}` : ""}. Keep this one folds that one in${signedIn(pair) ? " and switches its sign-in off" : ""}.`,
        });
      }
      continue;
    }
    if (signedIn(t) && !staffId && onTheFloor(t)) {
      const fit = mindbodyStaff.find((s) => !linkedStaff.has(String(s.id)) && nameKey(s.fullName) === nameKey(t.fullName)) ?? null;
      entries.push({
        ...base,
        group: "needs",
        linkTo: fit,
        note: fit
          ? `Signed in, but not linked to Mindbody. Mindbody has ${fit.fullName} (staff ${fit.id}).`
          : mindbodyRead
            ? "Signed in, but not linked to Mindbody, and Mindbody's staff list has nobody of that name."
            : "Signed in, but not linked to Mindbody.",
      });
      continue;
    }
    if (!signedIn(t) && staffId) {
      entries.push({
        ...base,
        group: "waiting",
        note: t.email ? `Hasn't signed in yet. Their first sign-in with ${t.email} opens this record.` : "Hasn't signed in yet, and has no sign-in address set.",
      });
      continue;
    }
    entries.push({ ...base, group: "team" });
  }

  const order: TeamGroup[] = ["needs", "team", "waiting", "rotation", "off"];
  return entries.sort(
    (a, b) => order.indexOf(a.group) - order.indexOf(b.group) || (a.trainer.fullName || "").localeCompare(b.trainer.fullName || "") || a.trainer.id.localeCompare(b.trainer.id),
  );
}

/** Mindbody staff at this site with no Journey record at the studio: who could still be let in. */
export function mindbodyNotInJourney(trainers: readonly Trainer[], mindbodyStaff: readonly MindbodyStaff[]): MindbodyStaff[] {
  const linked = new Set(trainers.filter((t) => !t.supersededByUid).map((t) => String(t.mindbodyStaffId ?? "")).filter(Boolean));
  return mindbodyStaff
    .filter((s) => !linked.has(String(s.id)) && !isRotationName(s.fullName))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** The groups' headings. */
export const GROUP_TITLES: Record<TeamGroup, string> = {
  needs: "Needs fixing",
  team: "The team",
  waiting: "On Mindbody, not signed in yet",
  rotation: "Rotation",
  off: "Switched off",
};
