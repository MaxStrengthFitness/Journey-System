/**
 * WHAT THE STAFF EDITOR MAY OFFER ON A PERSON'S ROW — the app's mirror of the
 * rules' trainer update (firestore.rules `trainerUpdateAllowed` and
 * `othersDocChangeAllowed`; the franchise partition, Oct 2026).
 *
 * The review that found it (Oct 10 2026): My Studio → Team opened the live
 * StudioLeader's OWN row with the role select and the "helps run the studio"
 * switch live, and Operations → People offered an owner's own row a Home
 * studio select. Under the partition's rules every one of those saves is
 * refused, with the "Firestore Action Failed" toast. A screen that offers
 * what the database refuses is the bug this file prevents: it says which
 * fields are locked on this row, for this viewer, and one sentence why.
 *
 * The rules, in the order this file asks them:
 *   - an administrator changes anything, except the ROLE of someone who owns
 *     a studio: Admins → Change role (RoleDialog) is the one writer that
 *     changes an owner's role, because it takes the ownership off with it
 *     (second review: a demotion here left ownedStudioIds behind for a later
 *     promotion to revive);
 *   - your own row: never your role or your studios (only an administrator
 *     changes their own); your name, email, initials and the calendar stay
 *     yours;
 *   - someone else's: only when you lead their home studio
 *     (`trainerLeads(r, t, their home)`); otherwise the whole row is read
 *     only;
 *   - their role and email: only for someone within reach -- their current
 *     role is one you could hand out (a leader never demotes an administrator,
 *     an owner or a studio owner) and they own no studio; and their email
 *     only when every studio they work at is one you run (an email is who
 *     signs in as the document).
 */

import type { Trainer } from "../../../types";
import { SUPER_ROLES, FRANCHISE_ROLES } from "../../../lib/staff-access";
import { hasRunOfDemo } from "../../demo-mode/access";
import { isDemoStudioId } from "../../demo-mode/is-demo";
import { leadsStudio, ledStudioIds } from "../../renewals/permissions";

export interface EditLimits {
  /** Nothing on the row can be saved by this viewer (they don't lead the person's home studio). */
  readOnly: boolean;
  roleLocked: boolean;
  homeLocked: boolean;
  grantHidden: boolean;
  emailLocked: boolean;
  /** One sentence for the locked fields, or null. */
  reason: string | null;
}

const OPEN: EditLimits = {
  readOnly: false,
  roleLocked: false,
  homeLocked: false,
  grantHidden: false,
  emailLocked: false,
  reason: null,
};

/** The rules' studioTierRole: what a studio's own leaders hand out. A missing role is "not set yet". */
const STUDIO_TIER = new Set(["LifeTransformer", "Trainer", "HeadTrainer", "StudioLeader"]);

/** The role as the rules read it from a document: none set is a LifeTransformer. */
function roleOf(t: Pick<Trainer, "role"> | null | undefined): string {
  const r = t?.role as unknown;
  return typeof r === "string" && r.trim() ? r.trim() : "LifeTransformer";
}

/**
 * A copy of the rules' mayHandOut: an administrator anything; a franchise
 * owner anything but an administrator; everyone else the studio tier (and a
 * person with no role yet).
 */
export function mayHandOutRole(viewerRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  const v = typeof viewerRole === "string" && viewerRole ? viewerRole : "LifeTransformer";
  if (SUPER_ROLES.has(v)) return true;
  if (FRANCHISE_ROLES.has(v)) return !(targetRole && SUPER_ROLES.has(targetRole));
  return targetRole == null || targetRole === "" || STUDIO_TIER.has(targetRole);
}

/** The rules' ownsTrainerDoc, from the app's side: the same document, the same Auth uid, or the same email. */
export function isOwnRow(viewer: Trainer, target: Trainer): boolean {
  if (viewer.id && viewer.id === target.id) return true;
  if (viewer.authUid && target.authUid && viewer.authUid === target.authUid) return true;
  const a = (viewer.email ?? "").trim().toLowerCase();
  const b = (target.email ?? "").trim().toLowerCase();
  return a !== "" && a === b;
}

function firstName(t: Trainer): string {
  const nick = ((t as { nickname?: string }).nickname ?? "").trim();
  if (nick) return nick;
  const first = (t.fullName ?? "").trim().split(/\s+/)[0];
  return first || "This person";
}

export function staffEditLimits(input: {
  viewer: Trainer | null;
  target: Trainer | null;
  viewerIsAdmin: boolean;
  /** To name the person's home studio in the read-only sentence. */
  studios?: readonly { id?: string; name?: string }[];
}): EditLimits {
  const { viewer, target, viewerIsAdmin } = input;
  if (!target) return OPEN;
  const first = firstName(target);
  const ownsAStudio = (target.ownedStudioIds ?? []).length > 0;

  if (viewerIsAdmin) {
    if (!ownsAStudio) return OPEN;
    return {
      ...OPEN,
      roleLocked: true,
      reason: `Change ${first}'s role on Admins → Studios → their studio → Team → Change role: they own a studio, and that screen takes the ownership off with it.`,
    };
  }

  // No viewer given (a door that doesn't pass one): nothing is locked here,
  // and the rules still decide. Both of the app's doors pass the viewer.
  if (!viewer) return OPEN;

  // Your own row: the self branch. Never read only: the calendar switch,
  // initials, name and email are yours to keep.
  if (isOwnRow(viewer, target)) {
    return {
      ...OPEN,
      roleLocked: true,
      homeLocked: true,
      grantHidden: true,
      reason: "Your own role and studios are set by head office.",
    };
  }

  // Someone else's: the rules ask first that you lead their home studio
  // (trainerLeads, which counts Demo Mode for everyone).
  const home = target.primaryHomeStudioId || null;
  if (!(leadsStudio(viewer, home) || hasRunOfDemo(viewer, home))) {
    const homeName = (input.studios ?? []).find((s) => s.id && s.id === home)?.name || "another studio";
    return {
      readOnly: true,
      roleLocked: true,
      homeLocked: true,
      grantHidden: true,
      emailLocked: true,
      reason: `${first} is based at ${homeName}, so that studio's leaders make changes.`,
    };
  }

  const limits: EditLimits = { ...OPEN };
  const reasons: string[] = [];
  // A Demo Mode trainer never carries the grant (the franchise partition's
  // attack review, Oct 10 2026). The rules pin a demo trainer's document to
  // an empty managedStudioIds (isDemoTrainerPayload), and the grant a leader
  // may hand out is limited to the studios they lead by role or grant
  // (ledStudios), which never includes 'demo-studio' -- so My Studio → Team
  // in Demo Mode offered a switch whose every save was refused. Everyone
  // already has the run of the practice studio; there is nothing to grant.
  if (isDemoStudioId(home)) limits.grantHidden = true;
  if (ownsAStudio) {
    limits.roleLocked = true;
    limits.emailLocked = true;
    reasons.push(`Head office manages ${first}'s role and sign-in: they own a studio.`);
  }
  if (!mayHandOutRole(roleOf(viewer), (target.role as unknown as string) ?? null)) {
    limits.roleLocked = true;
    limits.emailLocked = true;
    reasons.push(`Head office manages ${first}'s role and sign-in.`);
  }
  const led = new Set(ledStudioIds(viewer));
  const worksElsewhere = [
    ...(target.accessibleStudioIds ?? []),
    ...(target.activeGuestStudioIds ?? []),
    ...(target.managedStudioIds ?? []),
  ].some((id) => id && !led.has(id));
  if (worksElsewhere) {
    limits.emailLocked = true;
    reasons.push(`${first} also works at another studio, so head office keeps their sign-in email.`);
  }
  limits.reason = reasons[0] ?? null;
  return limits;
}
