/**
 * WHO CAN SEE WHAT ON A TRAINER'S PROFILE.
 *
 * Trainers can now open each other's profiles, so this file answers the one
 * question that follows: which parts.
 *
 * THE LINE THAT MATTERS
 * ---------------------
 * Client names require a SHARED STUDIO.
 *
 * A trainer's certifications, tenure and session counts are professional
 * credentials -- fine for anyone in the company to see, and useful when a
 * franchise owner is looking at a studio they have never visited. But the
 * Kaizen Roster, today's schedule and recently-coached list are all lists of
 * CLIENTS, and a trainer at another location has no business reading them.
 *
 * Four tiers, each adding to the one before:
 *
 *   outside     someone with no studio in common: identity, about, tenure,
 *               the aggregate numbers, and where they work. No client names.
 *   peer        shares a studio: the client-facing sections as well. This is
 *               the tier the "let other trainers view a profile" ask created.
 *   leadership  can already edit this person: contact details and the
 *               Mindbody integration state on top.
 *   self        everything.
 *
 * Deliberately a pure function over two Trainer objects. Firestore rules are
 * what actually protect the data (trainer documents are readable by any
 * authenticated user, which is what makes a team-visible roster work at all);
 * this decides what is worth PUTTING ON SCREEN, and being pure is what lets
 * the interesting combinations be tested instead of clicked through.
 *
 * THE FRANCHISE PARTITION (Oct 2026). Two answers that used to be one:
 * who SEES a colleague's contact and Mindbody link ("leadership": the
 * company tier everywhere, and anyone who runs studios -- the studio tier and
 * now the franchise owner too -- over someone they share a studio with,
 * unchanged for a studio leader and a head trainer), and who gets the EDIT
 * button, which is the rules' answer: yourself, an administrator, or someone
 * who leads the person's HOME studio. A studio owner and a franchise owner
 * are no longer leadership over every trainer in the company.
 */
import type { Trainer, UserRole } from "../../types";
import { LEADS_OWN_STUDIO_ROLES } from "../../lib/staff-access";
import { leadsStudio } from "../renewals/permissions";

export type ProfileScope = "self" | "leadership" | "peer" | "outside";

export interface ProfileVisibility {
  scope: ProfileScope;
  /** Edit Profile button, and every inline editing affordance. */
  canEdit: boolean;
  /** Email address and any other way to contact this person directly. */
  showContact: boolean;
  /** Mindbody staff id, sync state, calendar feed url. Operator detail. */
  showIntegration: boolean;
  /** Aggregate session numbers. A credential, not client data. */
  showCoachingLoad: boolean;
  /** Everything below names clients, and needs a studio in common. */
  showRoster: boolean;
  showSchedule: boolean;
  showRecentlyCoached: boolean;
  /**
   * Whether the Recently coached card may run its own query (a trainer's
   * sessions by trainerId). The rules answer it only for yourself and an
   * administrator (docs/rounds/2026-09-27-openings.md:850), so on a
   * colleague's profile the card lists what the loaded window already holds
   * and sends no query, which raised a toast for leaders (the franchise
   * partition, second review).
   */
  fetchRecentlyCoached: boolean;
}

/** Roles whose authority is company-wide, not per studio: the rules' roleIsSuper. */
const GLOBAL_LEADERSHIP: UserRole[] = ["Admin", "Founder", "Overseer"];

/**
 * Roles that run their OWN studios: the studio tier and (the franchise
 * partition, Oct 2026) the franchise owner. Leadership over a trainer only
 * where they actually share a studio -- the same distinction
 * `isStudioOwnerOrHeadTrainer` draws in firestore.rules, kept in step here so
 * the UI never offers an affordance the rules will refuse.
 */
const STUDIO_LEADERSHIP: ReadonlySet<string> = LEADS_OWN_STUDIO_ROLES;

/** Every studio a trainer is attached to, in any capacity. */
export function studioIdsFor(trainer: Trainer | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!trainer) return ids;
  const add = (value?: string | null) => {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  };
  add(trainer.primaryHomeStudioId);
  trainer.accessibleStudioIds?.forEach(add);
  trainer.activeGuestStudioIds?.forEach(add);
  trainer.ownedStudioIds?.forEach(add);
  return ids;
}

export function sharesStudio(a: Trainer | null | undefined, b: Trainer | null | undefined): boolean {
  const mine = studioIdsFor(a);
  if (mine.size === 0) return false;
  for (const id of studioIdsFor(b)) {
    if (mine.has(id)) return true;
  }
  return false;
}

export function resolveProfileScope(
  viewer: Trainer | null | undefined,
  subject: Trainer | null | undefined,
): ProfileScope {
  if (!viewer || !subject) return "outside";
  if (viewer.id && viewer.id === subject.id) return "self";
  if (GLOBAL_LEADERSHIP.includes(viewer.role)) return "leadership";
  if (STUDIO_LEADERSHIP.has(viewer.role) && sharesStudio(viewer, subject)) {
    return "leadership";
  }
  return sharesStudio(viewer, subject) ? "peer" : "outside";
}

export function resolveProfileVisibility(
  viewer: Trainer | null | undefined,
  subject: Trainer | null | undefined,
): ProfileVisibility {
  const scope = resolveProfileScope(viewer, subject);
  const privileged = scope === "self" || scope === "leadership";
  const sharesFloor = privileged || scope === "peer";
  const global = Boolean(viewer && GLOBAL_LEADERSHIP.includes(viewer.role));

  return {
    scope,
    // The rules let someone else edit a trainer document only when they lead
    // that person's home studio (the franchise partition, Oct 2026): sharing
    // any studio is enough to SEE, not to edit.
    canEdit:
      scope === "self" ||
      global ||
      (scope === "leadership" && leadsStudio(viewer, subject?.primaryHomeStudioId ?? null)),
    showContact: privileged,
    showIntegration: privileged,
    showCoachingLoad: true,
    showRoster: sharesFloor,
    showSchedule: sharesFloor,
    showRecentlyCoached: sharesFloor,
    fetchRecentlyCoached: scope === "self" || global,
  };
}

/** One line for the banner a read-only viewer sees at the top of the page. */
export function scopeNotice(scope: ProfileScope, firstName: string): string | null {
  switch (scope) {
    case "peer":
      return `Read-only — you're viewing ${firstName}'s profile.`;
    case "outside":
      return `Read-only — you don't share a studio with ${firstName}, so their clients are hidden.`;
    default:
      return null;
  }
}
