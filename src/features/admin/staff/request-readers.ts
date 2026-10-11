/**
 * WHO MAY READ OTHER PEOPLE'S ACCESS REQUESTS (Oct 10 2026), AND WHICH.
 *
 * An access request holds a stranger's name, email and phone, and anyone
 * with a Google account can sign in. The rules (firestore.rules,
 * `access_requests`) let the sender read their own, administrators read
 * every one, and -- since the franchise partition (Oct 2026) -- whoever runs
 * the studio a request NAMES read that one: `requestedStudioId` for a new
 * person (front-door/my-request.ts), `studioId` for a studio-access request
 * (studio-access-request.ts). A request that names no studio is
 * administrators' alone, and never Demo Mode's id: everyone has the run of
 * it, and a stranger's name and phone are not a practice record.
 *
 * This is the app's copy of that answer, so the staff roster opens its
 * listeners only for someone the rules will answer, and only with queries
 * the rules can prove: a leader's or owner's list names the studios they
 * lead (requestQueryPlan). A trainer opening My Studio -> Team (or Staff &
 * Roles inside Demo Mode, which anyone may open) would otherwise have the
 * listener refused and see an error toast. Keep it equal to the rule:
 * `request-readers.test.ts` lists the roles.
 */
import { SUPER_ROLES } from "../../../lib/staff-access";
import { MAX_IN_VALUES, dedupeById } from "../../../lib/tenancy";
import { ledStudioIds } from "../../renewals/permissions";
import type { Trainer } from "../../../types";

export interface RequestReader {
  role?: string | null;
  primaryHomeStudioId?: string | null;
  ownedStudioIds?: readonly string[] | null;
  managedStudioIds?: readonly string[] | null;
}

/** The rules' getRole(): a trainer document with no role is a LifeTransformer. */
function roleOf(reader: RequestReader): string {
  return typeof reader.role === "string" && reader.role.trim() ? reader.role.trim() : "LifeTransformer";
}

/** The studios whose requests this reader may list: ledStudioIds, never "" or the demo id. */
function requestStudiosOf(reader: RequestReader): string[] {
  return ledStudioIds({
    role: roleOf(reader) as Trainer["role"],
    primaryHomeStudioId: reader.primaryHomeStudioId ?? "",
    ownedStudioIds: reader.ownedStudioIds ? [...reader.ownedStudioIds] : [],
    managedStudioIds: reader.managedStudioIds ? [...reader.managedStudioIds] : [],
  });
}

export function mayReadAccessRequests(reader: RequestReader | null | undefined): boolean {
  if (!reader) return false;
  if (SUPER_ROLES.has(roleOf(reader))) return true;
  return requestStudiosOf(reader).length > 0;
}

/**
 * Which listeners the staff roster opens for this reader:
 *   - "all": administrators, one query on status alone;
 *   - "studios": everyone who leads a studio, two queries a chunk (on
 *     `requestedStudioId` and on `studioId`), each chunk at most 30 studios
 *     (Firestore's cap on `in`);
 *   - "none": everyone else, and anyone whose list comes out empty.
 */
export type RequestQueryPlan =
  | { kind: "all" }
  | { kind: "studios"; studioIds: string[]; chunks: string[][] }
  | { kind: "none" };

export function requestQueryPlan(reader: RequestReader | null | undefined): RequestQueryPlan {
  if (!reader) return { kind: "none" };
  if (SUPER_ROLES.has(roleOf(reader))) return { kind: "all" };
  const studioIds = requestStudiosOf(reader);
  if (studioIds.length === 0) return { kind: "none" };
  const chunks: string[][] = [];
  for (let i = 0; i < studioIds.length; i += MAX_IN_VALUES) {
    chunks.push(studioIds.slice(i, i + MAX_IN_VALUES));
  }
  return { kind: "studios", studioIds, chunks };
}

/** The snapshots of every listener, merged by document id (a request a reader sees twice is one row). */
export function mergeRequests<T extends { id: string }>(groups: readonly (readonly T[])[]): T[] {
  return dedupeById(groups.map((g) => [...g]));
}
