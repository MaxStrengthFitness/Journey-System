/**
 * WHO IS WAITING TO BE LET IN, at every studio. PURE: no React, no Firestore.
 *
 * AJ, Oct 16 2026: "as an admin, I need a quick way where I'm not jumping
 * through figuring out the studio and trying to find the name. I should be
 * able to just see all the requests from admin." Studios still let their own
 * people in (My Studio → Team, Operations → Setup → People & access); this is
 * the administrators' one list across all of them, on Admins → Studios →
 * Waiting to be let in, and the count Home says.
 *
 * It reads the rows the staff roster already builds (admin/staff/roster.ts),
 * so a request that is stale there (the account already exists, or the person
 * can already get into the studio they asked for) is stale here too, and the
 * two lists can never disagree about who is waiting.
 */
import type { Studio } from "../../../types";
import { isStudioAccessRequest, requestStudioId, type StaffRow } from "../../admin/staff/roster";

export interface WaitingPerson {
  key: string;
  name: string;
  email: string | null;
  /** The studio they asked for; null when the request names none (older sign-ups). */
  studioId: string | null;
  studioName: string | null;
  /** When they asked (ms), when the request says. */
  since: number | null;
  /**
   * "new": signed in with no account and asked to join, approved here.
   * "another-studio": already has an account and asked for another studio;
   * the approval form can't add a studio, so the page sends you to their team.
   */
  kind: "new" | "another-studio";
  /** Where someone with an account is based (another-studio only). */
  homeStudioId: string | null;
  homeStudioName: string | null;
  row: StaffRow;
}

/** A request's createdAt as ms: an ISO string, a Firestore Timestamp, or nothing. */
export function sinceOf(v: unknown): number | null {
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null;
}

/** Everyone waiting, every studio: grouped by the studio they asked for (A to Z, none last), then by name. */
export function waitingPeople(rows: readonly StaffRow[], studios: readonly Studio[]): WaitingPerson[] {
  const nameOf = (id: string | null | undefined) => (id ? (studios.find((s) => s.id === id)?.name ?? null) : null);
  const people = rows
    .filter((r) => r.state === "awaiting-approval" && r.request)
    .map((r): WaitingPerson => {
      const req = r.request!;
      const studioId = requestStudioId(req);
      const another = isStudioAccessRequest(req);
      return {
        key: r.key,
        name: r.name,
        email: r.email || null,
        studioId,
        studioName: nameOf(studioId),
        since: sinceOf(req.createdAt),
        kind: another ? "another-studio" : "new",
        homeStudioId: another ? (r.homeStudioId ?? null) : null,
        homeStudioName: another ? nameOf(r.homeStudioId) : null,
        row: r,
      };
    });
  return people.sort((a, b) => {
    const sa = a.studioName ?? "￿";
    const sb = b.studioName ?? "￿";
    return sa.localeCompare(sb) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  });
}

/** "Solon (2) and Strongsville (1)": the studios people are waiting for, A to Z, any with no studio last. */
export function waitingWhere(people: readonly Pick<WaitingPerson, "studioName">[]): string[] {
  const counts = new Map<string, number>();
  let unnamed = 0;
  for (const p of people) {
    if (p.studioName) counts.set(p.studioName, (counts.get(p.studioName) ?? 0) + 1);
    else unnamed += 1;
  }
  const out = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, n]) => `${name} (${n})`);
  if (unnamed) out.push(`no studio named (${unnamed})`);
  return out;
}
