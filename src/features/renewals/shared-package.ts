/**
 * SHARED PACKAGES — couples and families on one client's sessions.
 *
 * AJ, Oct 21 2026: "the trickiest part is some clients SHARE packages so one
 * client may not have a package but use another clients sessions, couples
 * and families and such ... for clients that share packages i feel like that
 * will have to be manually done by a someone in the studio maybe which is
 * okay!" Oct 22: "count both people's visits in the holder's pace. Anyone at
 * the studio can mark it, on Account."
 *
 * THE MARK. `client.sharesPackageWith` on the person who uses the sessions,
 * naming the holder (Account → The package, by anyone who works at the
 * studio). Mindbody is untouched: the holder's pricing options are where the
 * sessions come off, as they always were.
 *
 * THE SHARER. Her renewal record is "shared": no sessions left, no dates, no
 * warning, never ended, lapsed or "no package" — she has none of her own and
 * needs none (month-to-month.ts `clearedOfRenewal`). Her notes and the
 * attendance states are untouched.
 *
 * THE HOLDER. Unchanged, except that the pace her sessions are used at
 * counts the sharer's visits and late cancels too: each person's days once,
 * added together, so two people in on the same day are two sessions. Her
 * record names who shares it (`sharedWith`). The nightly job finds the
 * sharers in the roster it already reads; a sharer filed at another studio
 * isn't read there, and her visits aren't counted.
 *
 * Pure: shared-package.test.ts.
 */

import type { Client } from "../../types";
import type { AttendanceRow } from "./engine";
import { clearedOfRenewal } from "./month-to-month";
import type { RenewalSnapshot } from "./types";

/** One person who uses the holder's package, with the visits the night read for her. */
export interface PackageSharer {
  clientId: string;
  name: string;
  attendance: readonly AttendanceRow[];
}

/** The mark, when it names someone: whose package she uses. */
export function sharedHolderOf(client: Pick<Client, "sharesPackageWith"> | null | undefined): { holderId: string; holderName: string } | null {
  const m = client?.sharesPackageWith;
  if (!m || typeof m.clientId !== "string" || !m.clientId.trim()) return null;
  return { holderId: m.clientId, holderName: (m.name ?? "").trim() || "another client" };
}

/** A record made shared: no renewal of her own, and whose package it is. */
export function asShared(s: RenewalSnapshot, holder: { holderId: string; holderName: string }): RenewalSnapshot {
  return {
    ...clearedOfRenewal(s),
    situation: "shared",
    packageLabel: `Shares ${holder.holderName}'s package`,
    monthToMonth: null,
    sharedPackage: holder,
  };
}

/**
 * The days a sharer used a session: her visits and late cancels up to
 * today, each day once (one person trains once a day), as the holder's own
 * are counted.
 */
export function sharerUsedDays(attendance: readonly AttendanceRow[], today: string): string[] {
  const days = new Set<string>();
  for (const a of attendance) if ((a.kind === "visit" || a.kind === "no-show") && a.day <= today) days.add(a.day);
  return Array.from(days);
}

/**
 * Who shares each holder's package, from a studio's clients: holder id →
 * sharers, by name. A mark naming herself, or someone not in the list, is
 * skipped.
 */
export function sharersByHolder<C extends Pick<Client, "id" | "sharesPackageWith">>(clients: readonly C[]): Map<string, C[]> {
  const ids = new Set(clients.map((c) => c.id).filter(Boolean) as string[]);
  const out = new Map<string, C[]>();
  for (const c of clients) {
    const holder = sharedHolderOf(c);
    if (!holder || !c.id || holder.holderId === c.id || !ids.has(holder.holderId)) continue;
    const list = out.get(holder.holderId) ?? [];
    list.push(c);
    out.set(holder.holderId, list);
  }
  return out;
}

/** "Shares Jane Doe's package" — the sharer's line. */
export function sharedSentence(s: Pick<RenewalSnapshot, "sharedPackage"> | null | undefined): string {
  return `Shares ${s?.sharedPackage?.holderName ?? "another client"}'s package`;
}

/** "Shared with Tom Doe" / "Shared with Tom Doe and Ann Doe" — the holder's line. Null with nobody. */
export function sharedWithSentence(s: Pick<RenewalSnapshot, "sharedWith"> | null | undefined): string | null {
  const names = (s?.sharedWith ?? []).map((x) => x.name).filter(Boolean);
  if (names.length === 0) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Shared with ${list}`;
}
