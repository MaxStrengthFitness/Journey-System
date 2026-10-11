/**
 * Who may see and do what with renewals — the same answers firestore.rules
 * gives, so a button is never offered that the database will refuse.
 *
 *   Trainers (Life Transformers): the renewal chip and card on clients they
 *     can open, and logging a conversation.
 *   Studio leaders (StudioLeader, HeadTrainer, StudioOwner) of THIS studio:
 *     all of the above, plus the Operations → Renewals pipeline, stage, lead
 *     and outcome, the studio's renewal settings, and per-trainer renewal
 *     rates (AJ, Sep 10: rates are for studio leaders only).
 *   Franchise owners: as a studio's leaders, at their home and owned studios
 *     (the franchise partition, Oct 2026; ROADMAP Gate B).
 *   Administrators: everything, at every studio.
 *
 * See docs/business/roles-and-permissions.md.
 */

import type { Trainer } from "../../types";
import { hasRunOfDemo } from "../demo-mode/access";
import { isDemoStudioId } from "../demo-mode/is-demo";
import { LEADS_OWN_STUDIO_ROLES, SUPER_ROLES } from "../../lib/staff-access";

type TrainerLike = Pick<
  Trainer,
  "role" | "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds" | "ownedStudioIds"
> &
  Partial<Pick<Trainer, "managedStudioIds">>;

/**
 * The company tier: administrators, the founder, the overseer. Mirrors the
 * rules' roleIsSuper. A franchise owner is no longer an every-studio role
 * (the franchise partition, Oct 2026): they lead the studios they run.
 */
export function isEveryStudioRole(t: Pick<Trainer, "role"> | null | undefined): boolean {
  return Boolean(t && SUPER_ROLES.has(t.role));
}

/**
 * The roles that run their OWN studios (home and owned): the studio tier's
 * three and the franchise owner. Mirrors the rules' roleRunsOwnStudios.
 */
export function runsOwnStudios(role: string | null | undefined): boolean {
  return Boolean(role && LEADS_OWN_STUDIO_ROLES.has(role));
}

/** A list of studio ids, deduplicated, never "" and never Demo Mode's id. */
function realStudioIds(ids: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id === "" || isDemoStudioId(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * The studios this person runs as their own: home and owned, for a role that
 * runs its own studios; nothing for anyone else. Mirrors the rules'
 * ownStudiosOf, minus the empty home the rules tolerate, and never the demo
 * id (second review: an "" in an `in` list refuses the whole query).
 */
export function ownStudioIds(
  t: Pick<Trainer, "role" | "primaryHomeStudioId" | "ownedStudioIds"> | null | undefined,
): string[] {
  if (!t || !runsOwnStudios(t.role)) return [];
  return realStudioIds([t.primaryHomeStudioId, ...(t.ownedStudioIds ?? [])]);
}

/**
 * Every studio this person leads: their own (ownStudioIds) and the grant
 * (`managedStudioIds`). Mirrors the rules' ledStudios, never "" and never
 * the demo id.
 */
export function ledStudioIds(
  t:
    | (Pick<Trainer, "role" | "primaryHomeStudioId" | "ownedStudioIds"> &
        Partial<Pick<Trainer, "managedStudioIds">>)
    | null
    | undefined,
): string[] {
  if (!t) return [];
  return realStudioIds([...ownStudioIds(t), ...(t.managedStudioIds ?? [])]);
}

/** Works at this studio (home, accessible or guest). Mirrors trainerWorksAt(). */
export function worksAt(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  if (!t || !studioId) return false;
  return (
    t.primaryHomeStudioId === studioId ||
    (t.accessibleStudioIds ?? []).includes(studioId) ||
    (t.activeGuestStudioIds ?? []).includes(studioId)
  );
}

/**
 * Runs this studio. Mirrors trainerLeads(): a studio-leader role or (the
 * franchise partition, Oct 2026) a franchise owner at their home or an owned
 * studio -- or, since the My Studio round (Sep 2026), any trainer the
 * studio's leadership has granted `managedStudioIds` for it.
 */
export function leadsStudio(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  if (!t || !studioId) return false;
  if ((t.managedStudioIds ?? []).includes(studioId)) return true;
  if (!LEADS_OWN_STUDIO_ROLES.has(t.role)) return false;
  return t.primaryHomeStudioId === studioId || (t.ownedStudioIds ?? []).includes(studioId);
}

/**
 * The pipeline, stage / lead / outcome, settings and per-trainer rates.
 *
 * The demo clause is authorisation only -- everyone has the run of Demo Mode
 * (features/demo-mode/access.ts). Membership above is untouched, so the team
 * lists built by filtering all trainers through worksAt() still show Demo
 * Mode's own three trainers rather than the whole company.
 */
export function canManageRenewals(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  return isEveryStudioRole(t) || leadsStudio(t, studioId) || hasRunOfDemo(t, studioId);
}

/** Reading a studio's renewal cycles and settings, and logging a conversation. */
export function canTakePartInRenewals(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  return canManageRenewals(t, studioId) || worksAt(t, studioId);
}

/**
 * Setting the renewal plan (plan.ts; the renewals dashboard, Oct 7 2026):
 * anyone who works at the studio, as with a conversation. Mirrors the rules'
 * renewalPlanWrite branch, which asks renewalsReadable.
 */
export function canSetRenewalPlan(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  return canTakePartInRenewals(t, studioId);
}
