/**
 * THE TRAINER SCOPE — which trainer records this person's iPad may hold.
 *
 * Round: the trainer lock, Oct 18 2026 (docs/rounds/2026-10-18-trainer-lock.md;
 * AJ: "1a 2a 3a"). Until it, `useTrainers` subscribed to the whole `trainers`
 * collection and the rules let any signed-in account read any trainer
 * record: a person's name, email, role, photo, studios and Kaizen Roster
 * (clients' names with a reason and a note), on every iPad in the company.
 *
 * The scope is the set of studios whose people this person may hold, and
 * the rules (firestore.rules, `trainerRecordReadable`) ask the same
 * question of every document: two people read each other when they share a
 * studio in any of the ways a person is tied to one — home, also works at,
 * a guest, owns, the grant. "Works at" and "runs" are the words the rules
 * already use for clients and sessions (`src/lib/tenancy.ts`,
 * `src/lib/who-works-here.ts`), so nothing new is defined here:
 *
 *   - the company tier (`SUPER_ROLES`) holds everyone: `all`;
 *   - everyone else holds `readableStudioIds` (home, also works at, guests,
 *     and owned for a role that runs its own studios), plus the grant
 *     (`managedStudioIds`: the rules count it in `trainerLeads`), plus
 *     Demo Mode's studio, where everyone works in the rules and whose
 *     three practice trainers every screen inside Demo Mode lists;
 *   - nobody, when there is no record: a stranger's app never opens the
 *     list (the front door reads one record, by email).
 *
 * Capped at Firestore's thirty values for an `in` or `array-contains-any`
 * clause (`capStudioIds`): a person tied to more than thirty studios is not a
 * case this product has, and an administrator, who might be, reads `all`.
 *
 * `scopeKey` is what a listener's effect depends on: the self-watch takes the
 * server's copy of the record whole when anything differs (a photo, a
 * nickname), and the five listeners must restart only when the STUDIOS
 * change.
 *
 * PURE MODULE: no React, no Firestore. `read.ts` turns a scope into queries.
 */
import type { Trainer } from "../../types";
import { SUPER_ROLES } from "../../lib/staff-access";
import { capStudioIds, readableStudioIds } from "../../lib/tenancy";
import { DEMO_STUDIO_ID } from "../demo-mode/constants";

export type TrainerScope = { kind: "all" } | { kind: "studios"; ids: string[] };

/** The record fields the scope reads: what tenancy reads, plus the grant. */
export type ScopeSource = Pick<
  Trainer,
  "role" | "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds" | "ownedStudioIds" | "managedStudioIds"
>;

/** The scope for this record, or null with no record (nothing to read). */
export function trainerScopeFor(trainer: ScopeSource | null | undefined): TrainerScope | null {
  if (!trainer) return null;
  if (SUPER_ROLES.has(trainer.role)) return { kind: "all" };
  const ids = [...readableStudioIds(trainer), ...(trainer.managedStudioIds ?? []), DEMO_STUDIO_ID].filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
  // Stable order (first appearance), no duplicates: the same person gives the
  // same key, so the listeners restart only when the studios change.
  return { kind: "studios", ids: capStudioIds([...new Set(ids)]) };
}

/** One string per scope, equal for equal scopes, for effects and memos. */
export function scopeKey(scope: TrainerScope | null | undefined): string {
  if (!scope) return "";
  if (scope.kind === "all") return "all";
  return `studios:${[...scope.ids].sort().join(",")}`;
}

/**
 * The record fields a scoped query filters on, one listener each
 * (`read.ts` writes the five queries out in full, so the index guard can
 * read them). Named here so the rules' notes, the README and the tests say
 * the same five.
 */
export const SCOPE_FIELDS = [
  "primaryHomeStudioId",
  "accessibleStudioIds",
  "activeGuestStudioIds",
  "ownedStudioIds",
  "managedStudioIds",
] as const;

/**
 * Does this record fall inside the scope? The app's mirror of the rules'
 * `sharesAStudio`, for a screen that wants to say "a trainer from another
 * studio" about an id it holds rather than a record it can't read.
 */
export function inScope(scope: TrainerScope | null | undefined, record: ScopeSource | null | undefined): boolean {
  if (!scope || !record) return false;
  if (scope.kind === "all") return true;
  const mine = new Set(scope.ids);
  if (record.primaryHomeStudioId && mine.has(record.primaryHomeStudioId)) return true;
  for (const field of SCOPE_FIELDS) {
    if (field === "primaryHomeStudioId") continue;
    if ((record[field] ?? []).some((id) => mine.has(id))) return true;
  }
  return false;
}
