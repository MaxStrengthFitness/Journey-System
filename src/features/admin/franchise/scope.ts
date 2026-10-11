/**
 * WHICH PEOPLE STAND IN A SET OF STUDIOS, AND WHAT NEEDS THE OWNER TODAY.
 *
 * Round: Admin Overhaul, Round 2 Phase 4 (Section 15). The Franchise
 * dashboard it was written for is gone; Operations → All my studios
 * (network/NetworkOverview.tsx) reads the helpers that are left.
 *
 * OWNERSHIP IS `ownedStudioIds` ALONE (the franchise partition, Oct 2026;
 * ROADMAP Gate B). This header used to say a studio reached an owner three
 * ways -- `studio.ownerId`, `trainer.ownedStudioIds`, or sitting in a network
 * they own -- that "none is authoritative", and so took the union. That was
 * the bug: `studio.ownerId` is the administrator who created the studio, and
 * a network's owners had no screen that edited them, so the union handed out
 * studios nobody had decided. Now an administrator marks each studio an owner
 * runs ("Owns this studio", Admins → Studios → a studio → Team → Studios),
 * and every screen asks admin/scope.ts's operationsStudios, which reads that
 * through leadsStudio. `visibleNetworks` and `resolveScope`, the union's two
 * halves, were deleted with no caller left.
 */

import type { Trainer } from "../../../types";

const SUPER_ROLES = new Set(["Founder", "Admin", "Overseer"]);

export function isSuperAdminRole(role: string | undefined): boolean {
  return SUPER_ROLES.has(role ?? "");
}

/** Whether this trainer stands in any of the given studios. */
export function trainerIsIn(trainer: Trainer, studioIds: string[]): boolean {
  if (studioIds.length === 0) return false;
  const set = new Set(studioIds);
  if (trainer.primaryHomeStudioId && set.has(trainer.primaryHomeStudioId)) {
    return true;
  }
  return (
    (trainer.accessibleStudioIds ?? []).some((id) => set.has(id)) ||
    (trainer.activeGuestStudioIds ?? []).some((id) => set.has(id))
  );
}

/* ------------------------------------------------------------------ *
 * WHAT NEEDS THE OWNER TODAY
 * ------------------------------------------------------------------ */

export interface AttentionCounts {
  /** Signed in, no role assigned yet: waiting for someone to let them in. */
  awaitingApproval: number;
  /** Profiles an admin created that nobody has signed in to claim. */
  unclaimed: number;
  /** Temporary records with no Mindbody counterpart yet. */
  provisional: number;
  /** Staff with no Mindbody staff id, so the schedule cannot attribute them. */
  unlinkedStaff: number;
}

/**
 * Counted from the scoped staff, not the whole platform.
 *
 * "Awaiting approval" is the Round 1 model: signing in creates a trainer
 * document at the auth uid with no role, and a head trainer or above assigns
 * one. A document with no role is therefore a person standing in the doorway,
 * and it is the single most time-sensitive number on this screen.
 */
export function attentionCounts(staff: Trainer[]): AttentionCounts {
  return {
    awaitingApproval: staff.filter((t) => !t.role && !t.pendingClaim).length,
    unclaimed: staff.filter((t) => t.pendingClaim === true).length,
    provisional: staff.filter((t) => t.provisional === true).length,
    unlinkedStaff: staff.filter(
      (t) => Boolean(t.role) && !t.pendingClaim && !t.mindbodyStaffId,
    ).length,
  };
}

/** Trainers per studio, counted by `trainerIsIn`. */
export function staffCountByStudio(
  staff: Trainer[],
  studioIds: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of studioIds) {
    out[id] = staff.filter((t) => trainerIsIn(t, [id])).length;
  }
  return out;
}
