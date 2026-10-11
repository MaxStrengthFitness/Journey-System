/**
 * THE STUDIO PICKER'S "REQUEST ACCESS" — what it writes to access_requests.
 *
 * Kept beside roster.ts because roster.ts is its reader: My Studio → Team and
 * Operations → Staff & Roles list the request by these fields, and a writer
 * that drifts from its reader is how this bug happened. Until Sep 24 2026 the
 * picker wrote trainerName but no fullName or email, and keyed trainerId on
 * the trainer document id. The roster read fullName, so the request was a
 * nameless row at every studio, and sorting two of them called
 * localeCompare on undefined — which took down both staff screens.
 *
 * trainerId is the AUTH UID, not the trainer document id: the rules for a
 * studio_access create pin `trainerId == request.auth.uid`, and on older
 * accounts the two differ (KNOWN-TRAPS, "Use the Auth uid").
 *
 * The name comes from the trainer document first (what the studio knows them
 * as), then the Auth profile. The email comes from the Auth profile first
 * (the address they actually sign in with), then the trainer document. A
 * field with nothing to put in it is left off, never written as undefined.
 */

import type { Trainer } from "../../../types";
import { STUDIO_ACCESS } from "./roster";

export interface StudioAccessRequestInput {
  /** The signed-in person's Auth uid. */
  uid: string;
  authUser?: { displayName?: string | null; email?: string | null } | null;
  trainer?: Pick<Trainer, "fullName" | "email"> | null;
  studio: { id: string; name?: string | null };
}

export interface StudioAccessRequestFields {
  type: typeof STUDIO_ACCESS;
  trainerId: string;
  fullName?: string;
  email?: string;
  studioId: string;
  studioName?: string;
  status: "Pending";
}

const text = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/**
 * Where a studio-access request lives: `access_requests/sa_{uid}_{studioId}`
 * (the franchise partition, second review). The rules took any id for one,
 * so anyone could create a request at a stranger's uid first and block that
 * stranger's own sign-up at `access_requests/{uid}`. A Firebase Auth uid has
 * no underscore, so this id is never a uid; and naming the studio means a
 * second tap, or asking again after a denial, is the same row, never two.
 */
export function studioAccessRequestId(uid: string, studioId: string): string {
  return `sa_${uid}_${studioId}`;
}

export function studioAccessRequest(input: StudioAccessRequestInput): StudioAccessRequestFields {
  const fullName = text(input.trainer?.fullName) || text(input.authUser?.displayName);
  const email = (text(input.authUser?.email) || text(input.trainer?.email)).toLowerCase();
  const studioName = text(input.studio.name);
  return {
    type: STUDIO_ACCESS,
    trainerId: input.uid,
    ...(fullName ? { fullName } : {}),
    ...(email ? { email } : {}),
    studioId: input.studio.id,
    ...(studioName ? { studioName } : {}),
    status: "Pending",
  };
}
