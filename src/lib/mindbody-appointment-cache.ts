/**
 * ONE MINDBODY READ, SHARED (the Mindbody savings round, Oct 12 2026).
 *
 * AJ, Oct 12 2026: "We need to attempt to make our Mindbody costs as low as
 * possible without sacrificing data and information." Mindbody bills every
 * call ($0.002, from the first one; docs/business/running-costs.md), and the
 * schedule proxy (`/api/mindbody/staff-appointments` in server.ts) was asking
 * the same question several times a minute:
 *
 *   - Westlake, Strongsville and Willoughby share Mindbody site 29068. Each
 *     studio's pull asks for the WHOLE site's bookings (the proxy drops the
 *     siblings' only after Mindbody answers), so three studios pulling today
 *     and tomorrow is three identical reads of the same site.
 *   - Two iPads pressing Refresh a minute apart ask Mindbody twice.
 *
 * So the proxy keeps each WHOLE answer for a site for a short while
 * (`SHARED_READ_MS`, two minutes) and answers a request from it when the
 * window asked for lies inside a window it already read in full. Nothing
 * about what reaches the iPad changes: the same raw bookings, filtered to the
 * days asked for, then the same location filter, client lookups and
 * normalising as a fresh read.
 *
 * WHY IT LOSES NOTHING
 *
 *   - Only a WHOLE answer is kept (every page arrived). A short answer is
 *     never reused, so it can never stand in for a complete one.
 *   - Two minutes is well inside AJ's freshness for today (about 30 minutes,
 *     the cost plan of Sep 26 2026); the webhook still brings a change in
 *     seconds, and it writes straight to Firestore, not through here.
 *   - The answer says when it was read (`fetchedAt`), and the sync never lets
 *     an older answer overwrite or cancel a booking written after that
 *     (`rowIsNewerThanAnswer`, lib/mindbody-api-sync.ts). That guard also
 *     closes the race that already existed between a pull in flight and the
 *     webhook writing the same booking.
 *   - Operations -> Mindbody's "Pull the schedule now" sends `fresh` and
 *     always reads Mindbody itself.
 *
 * Two requests for the same window at the same moment share ONE read too
 * (`inFlight`): the slot-aligned pull (features/admin/syncPolicy.ts,
 * `slotOffsetMs`) puts every studio on a site at the same half-hour, so the
 * second and third usually arrive while the first is still waiting on
 * Mindbody.
 *
 * Pure apart from the clock it is handed, so it is tested in the ordinary
 * suite (server.ts is not).
 */

/** How long a whole answer is reused. Two minutes: see the header. */
export const SHARED_READ_MS = 2 * 60 * 1000;

/**
 * At most this many answers are kept, oldest dropped first. A shared site's
 * month is several thousand bookings; this keeps the web service's memory
 * flat however many studios join.
 */
export const MAX_SHARED_READS = 8;

/** An answer bigger than this is not kept at all (memory, not correctness). */
export const MAX_SHARED_BOOKINGS = 10_000;

/**
 * At most this many bookings across every kept answer, oldest answers dropped
 * first. A raw booking carries its client, staff and location; twenty
 * thousand is a few tens of megabytes, small beside the web service's memory.
 */
export const MAX_SHARED_TOTAL = 20_000;

export interface SiteRead<A = unknown> {
  siteId: string;
  /** First day read, "YYYY-MM-DD" (the site's own days, as Mindbody was asked). */
  start: string;
  /** Last day read, inclusive. */
  end: string;
  /** When Mindbody was asked (ms, the server's clock). */
  fetchedAt: number;
  /** Mindbody's own count for the window. */
  siteTotal: number;
  /** Every booking Mindbody returned, raw. */
  appointments: A[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The site-local day a raw booking starts on, or null when it has none. */
export function bookingDay(appt: unknown): string | null {
  const a = appt as { StartDateTime?: unknown } | null;
  const raw = typeof a?.StartDateTime === "string" ? a.StartDateTime : "";
  const day = raw.slice(0, 10);
  return DAY.test(day) ? day : null;
}

/**
 * A whole read narrowed to the days asked for. The same window comes back
 * as it was; a narrower one keeps only bookings that start on those days (a
 * booking with no readable day could be on any day, so it goes too).
 */
export function narrowTo<A>(read: SiteRead<A>, start: string, end: string): SiteRead<A> {
  if (read.start === start && read.end === end) return read;
  const appointments = read.appointments.filter((a) => {
    const day = bookingDay(a);
    return day !== null && day >= start && day <= end;
  });
  return { ...read, start, end, appointments, siteTotal: appointments.length };
}

/**
 * The cache. One per web-service process; a restart empties it, which costs
 * one fresh read and nothing else.
 */
export class SharedSiteReads<A = unknown> {
  private reads: SiteRead<A>[] = [];
  private inFlight = new Map<
    string,
    { siteId: string; start: string; end: string; startedAt: number; done: Promise<SiteRead<A> | null> }
  >();

  constructor(
    private readonly maxAgeMs: number = SHARED_READ_MS,
    private readonly maxReads: number = MAX_SHARED_READS,
    private readonly maxBookings: number = MAX_SHARED_BOOKINGS,
    private readonly maxTotal: number = MAX_SHARED_TOTAL,
  ) {}

  /**
   * A kept answer covering `start..end` for this site, no older than the
   * limit, narrowed to those days; null when there is none. A booking with
   * no readable day is dropped from a narrowed answer only when the window
   * is narrower than the read (it could be on any day); for the same window
   * it is kept, exactly as a fresh read would have returned it.
   */
  find(siteId: string, start: string, end: string, now: number, notBefore?: number | null): SiteRead<A> | null {
    if (!DAY.test(start) || !DAY.test(end) || start > end) return null;
    this.forgetOld(now);
    const floor = typeof notBefore === "number" && Number.isFinite(notBefore) ? notBefore : -Infinity;
    let best: SiteRead<A> | null = null;
    for (const r of this.reads) {
      if (r.siteId !== siteId || r.start > start || r.end < end) continue;
      // A caller that already holds a newer answer (the near pull handing a
      // lost booking to the month) must not be answered from an older one.
      if (r.fetchedAt < floor) continue;
      if (!best || r.fetchedAt > best.fetchedAt) best = r;
    }
    if (!best) return null;
    return narrowTo(best, start, end);
  }

  /** Keeps a WHOLE answer. A short one is refused, and says so. */
  keep(read: SiteRead<A>, complete: boolean): boolean {
    if (!complete) return false;
    if (!DAY.test(read.start) || !DAY.test(read.end) || read.start > read.end) return false;
    if (read.appointments.length > this.maxBookings) return false;
    // A newer read of the same window replaces the older one.
    this.reads = this.reads.filter(
      (r) => !(r.siteId === read.siteId && r.start === read.start && r.end === read.end),
    );
    this.reads.push(read);
    while (this.reads.length > this.maxReads) this.reads.shift();
    let total = this.reads.reduce((n, r) => n + r.appointments.length, 0);
    while (total > this.maxTotal && this.reads.length > 1) {
      total -= this.reads[0].appointments.length;
      this.reads.shift();
    }
    return true;
  }

  /**
   * Reads through the cache: a kept answer if one covers the window, else the
   * read already on its way for exactly this window, else `fetch` (whose
   * whole answer is kept for the next caller). `fetch` resolves to the read
   * and whether it was whole; null when Mindbody refused.
   */
  async read(
    siteId: string,
    start: string,
    end: string,
    now: () => number,
    fetch: () => Promise<{ read: SiteRead<A>; complete: boolean } | null>,
    notBefore?: number | null,
  ): Promise<{ read: SiteRead<A>; complete: boolean; shared: "kept" | "joined" | null } | null> {
    const floor = typeof notBefore === "number" && Number.isFinite(notBefore) ? notBefore : -Infinity;
    const kept = this.find(siteId, start, end, now(), notBefore);
    if (kept) return { read: kept, complete: true, shared: "kept" };

    // A read on its way that covers these days (the same window, or a
    // sibling's whole month while this one wants today and tomorrow).
    const key = `${siteId}|${start}|${end}`;
    let waiting: Promise<SiteRead<A> | null> | null = null;
    for (const f of this.inFlight.values()) {
      if (f.siteId === siteId && f.start <= start && f.end >= end && f.startedAt >= floor) {
        waiting = f.done;
        break;
      }
    }
    if (waiting) {
      const joined = await waiting;
      if (joined) {
        const narrowed = narrowTo(joined, start, end);
        return { read: narrowed, complete: true, shared: "joined" };
      }
      // The read we joined came back short or refused: ask for ourselves.
    }

    let settle: (r: SiteRead<A> | null) => void = () => undefined;
    const done = new Promise<SiteRead<A> | null>((resolve) => {
      settle = resolve;
    });
    const mine = { siteId, start, end, startedAt: now(), done };
    const registered = !this.inFlight.has(key);
    if (registered) this.inFlight.set(key, mine);
    try {
      const got = await fetch();
      if (got && got.complete) this.keep(got.read, true);
      settle(got && got.complete ? got.read : null);
      return got ? { ...got, shared: null } : null;
    } catch (e) {
      settle(null);
      throw e;
    } finally {
      if (registered && this.inFlight.get(key) === mine) this.inFlight.delete(key);
    }
  }

  /** How many answers are kept right now (for the log line and tests). */
  size(now: number): number {
    this.forgetOld(now);
    return this.reads.length;
  }

  private forgetOld(now: number): void {
    this.reads = this.reads.filter((r) => now - r.fetchedAt <= this.maxAgeMs && r.fetchedAt <= now + 1000);
  }
}

/* ------------------------------------------------------------------ *
 * THE SYNC'S HALF: never let an older answer undo a newer write.
 * ------------------------------------------------------------------ */

/**
 * How far before the answer a webhook event still counts as newer. Mindbody
 * can fire its event a moment before its own API reflects the change; a
 * minute's margin errs on the side of leaving the row alone.
 */
export const EVENT_MARGIN_MS = 60 * 1000;

const millisOf = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") {
    const ms = t.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return null;
};

/**
 * Was this booking row written after Mindbody's answer was read? Then the
 * answer is older than the row, and the pull must neither overwrite it nor
 * cancel it: the next pull, with a newer answer, decides.
 *
 *   - `mindbodyEventAt`: when Mindbody's webhook event happened (Mindbody's
 *     clock). Newer than the answer, less a minute's margin, means the change
 *     came after the read.
 *   - `lastSyncAt`: the row's last write, on Google's clock for both writers
 *     (the webhook's `serverTimestamp()`, and the pull's since this round:
 *     an iPad's own clock can be minutes off, and a fast one would have
 *     frozen its rows, a slow one let an older answer cancel a newer
 *     booking). At or after the read means someone wrote it since.
 *
 * Without `fetchedAt` (an older proxy) nothing is newer, so the pull behaves
 * exactly as it did. Skipping is always the safe direction: it writes
 * nothing, so it can only leave a row as it is for one more pull.
 */
export function rowIsNewerThanAnswer(
  row: { mindbodyEventAt?: unknown; lastSyncAt?: unknown } | null | undefined,
  fetchedAt: number | null | undefined,
): boolean {
  if (!row || typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return false;
  const event = millisOf(row.mindbodyEventAt);
  if (event !== null && event >= fetchedAt - EVENT_MARGIN_MS) return true;
  const wrote = millisOf(row.lastSyncAt);
  if (wrote !== null && wrote >= fetchedAt) return true;
  return false;
}
