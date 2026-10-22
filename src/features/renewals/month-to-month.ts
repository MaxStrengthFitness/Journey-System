/**
 * MONTH TO MONTH — who is on it, and what their renewal record says.
 *
 * AJ, Oct 21 2026: "we should be able to make comments about their
 * retention but it does not need it to remind us that they are running low
 * on sessions or expiring soon, these should just list as 'M2M' rather than
 * listing when their contract ends or how many sessions they have left.
 * these clients are special occasions and do not need to be caught by our
 * retention algorithm thing."
 *
 * So a month-to-month client has a renewal record with NO sessions left, no
 * end date, no projection and no warning, and the situation
 * "month-to-month", which no renewal lane, Running low or outcome reads as
 * anything. Their notes, Retention notes included, and the attendance lists
 * (Drifting, At risk, Lapsed) are untouched.
 *
 * WHO. In order, the first that answers:
 *   1. A coach's lock on Account (`client.contractTierOverride`): Month-to-
 *      month makes them M2M; any other lock says they aren't.
 *   2. A package contract running or signed to start: not M2M.
 *   3. A contract running today whose name is on the studio's month-to-
 *      month list ("2 x Week-Session Pack").
 *   4. A pricing option on the list ("8 Sessions", "Session $49") bought no
 *      earlier than the latest package pricing option and the start of the
 *      latest package contract: the newest thing they bought says how they
 *      pay. A client who moves from month to month onto a package stops
 *      being M2M the day Mindbody shows the package.
 *
 * Pure: month-to-month.test.ts.
 */

import type { ContractTierOverride, MindbodyContract, MindbodyService } from "../../types";
import type { PackageNameIndex } from "./settings";
import type { MonthToMonthWhy, PackageTier, RenewalSnapshot } from "./types";

type DayKey = (value: unknown) => string | null;

export interface MonthToMonthInput {
  lock: ContractTierOverride | null | undefined;
  contracts: Record<string, MindbodyContract> | undefined;
  services: Record<string, MindbodyService> | undefined;
  index: Pick<PackageNameIndex, "tierFor" | "isMonthToMonth">;
  /** The package contract the engine chose: running, else signed to start. */
  packageContract: { tier: PackageTier | null; start: string | null } | null;
  /** The latest package contract that has ended, when it was a package. */
  lastEndedPackageStart: string | null;
  today: string;
  dayKey: DayKey;
}

export function monthToMonthOf(input: MonthToMonthInput): MonthToMonthWhy | null {
  const { lock, contracts, services, index, packageContract, lastEndedPackageStart, today, dayKey } = input;
  if (lock?.payment === "month-to-month") return { from: "lock", name: lock.note?.trim() || null, since: null };
  if (lock?.payment) return null;
  if (packageContract?.tier) return null;

  let running: { name: string; since: string | null } | null = null;
  for (const c of Object.values(contracts ?? {})) {
    if (!c || c.status === "Cancelled" || !index.isMonthToMonth(c.contractName)) continue;
    const start = dayKey(c.startDate);
    const end = dayKey(c.endDate);
    if ((start && start > today) || (end && end < today)) continue;
    if (!running || (start ?? "") > (running.since ?? "")) running = { name: String(c.contractName), since: start };
  }
  if (running) return { from: "contract", name: running.name, since: running.since };

  let newestM2m: { name: string; day: string } | null = null;
  let newestPackage = lastEndedPackageStart ?? "";
  for (const s of Object.values(services ?? {})) {
    if (!s) continue;
    const day = dayKey(s.activeDate) ?? dayKey(s.paymentDate);
    if (!day || day > today) continue;
    if (index.isMonthToMonth(s.name)) {
      if (!newestM2m || day > newestM2m.day) newestM2m = { name: String(s.name), day };
    } else if (index.tierFor(s.name) && day > newestPackage) {
      newestPackage = day;
    }
  }
  if (newestM2m && newestM2m.day >= newestPackage) {
    return { from: "pricing-option", name: newestM2m.name, since: newestM2m.day };
  }
  return null;
}

/**
 * A snapshot made month to month: everything about sessions left, dates,
 * warnings and the renewal cycle is cleared; attendance, the coaches, the
 * flags and the proof stay (a Retention note still has its facts). No cycle
 * key, so the nightly job records no outcome for it: a move from a package
 * to month to month is a leader's to record (pay-as-you-go).
 */
export function asMonthToMonth(s: RenewalSnapshot, why: MonthToMonthWhy): RenewalSnapshot {
  return { ...clearedOfRenewal(s), situation: "month-to-month", packageLabel: "Month-to-month", monthToMonth: why };
}

/**
 * Everything about a renewal of HER OWN taken off a record: month to month,
 * and a client who uses someone else's package (shared-package.ts), share it.
 */
export function clearedOfRenewal(s: RenewalSnapshot): RenewalSnapshot {
  return {
    ...s,
    cycleKey: null,
    renewalOnBooks: null,
    packageKey: null,
    packageLabel: "Month-to-month",
    paymentMode: null,
    billingStart: null,
    chargeDate: null,
    chargeDateSource: null,
    autoRenews: null,
    autoRenewsFrom: null,
    autoRenewsInherited: null,
    sessionsLeft: null,
    sessionsLeftSource: null,
    sessionsOnHand: null,
    paymentsLeft: null,
    runOutDate: null,
    bankedAtCharge: null,
    situation: "month-to-month",
    conversationDue: false,
    chargeWarning: false,
    focusDate: null,
    // Her own package names say nothing about either: no package of her own is the point.
    dataGaps: s.dataGaps.filter((g) => !/isn't matched to a package|shows no package/.test(g)),
    ledger: null,
    commitmentEnd: null,
    commitmentEndSource: null,
    projection: null,
    rate: null,
    signals: s.signals ? { ...s.signals, suggestedPackageKey: null } : s.signals,
    paceRange: null,
    runOutRange: null,
    sharedWith: null,
  };
}

/** Is this record month to month? */
export function isMonthToMonthRecord(s: Pick<RenewalSnapshot, "situation"> | null | undefined): boolean {
  return s?.situation === "month-to-month";
}

/**
 * Month to month, or someone else's package: no renewal of her own. Every
 * screen that would say sessions left or an end date asks this first, and
 * says `noRenewalLabel` instead.
 */
export function isOutsideRenewals(s: Pick<RenewalSnapshot, "situation"> | null | undefined): boolean {
  return s?.situation === "month-to-month" || s?.situation === "shared";
}

/** "M2M": what a screen says in place of sessions left and an end date. */
export const M2M_LABEL = "M2M";
/** "Shared": the same, for a client on someone else's package. */
export const SHARED_LABEL = "Shared";

/** The short word in place of a count: "M2M" or "Shared". Null for a record with a renewal of its own. */
export function noRenewalLabel(s: Pick<RenewalSnapshot, "situation"> | null | undefined): string | null {
  return s?.situation === "month-to-month" ? M2M_LABEL : s?.situation === "shared" ? SHARED_LABEL : null;
}

/** The (i)'s line: why Journey calls them month to month. */
export function monthToMonthWhySentence(why: MonthToMonthWhy | null | undefined): string {
  if (!why) return "Month to month.";
  if (why.from === "lock") return `Month to month: set by hand on Account${why.name ? ` (“${why.name}”)` : ""}.`;
  const what = why.from === "contract" ? "contract" : "pricing option";
  return `Month to month: the Mindbody ${what} “${why.name ?? "unnamed"}” is on this studio's month-to-month list.`;
}
