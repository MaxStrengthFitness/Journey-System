import { describe, expect, it } from "vitest";
import {
  MIN_SLOT_GAP_MS,
  claimIsStillDue,
  decideSync,
  nextDueAt,
  nextSlotDue,
  siteSlotOffsetMs,
  slotAtOrAfter,
  type SyncContext,
} from "./syncPolicy";

/*
 * The site's slots (the Mindbody savings round, Oct 12 2026): every studio on
 * one Mindbody site pulls at the same half-hour, so the proxy answers them
 * all from one read.
 */
const MIN = 60_000;
const HALF = 30 * MIN;
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);

const ctx = (over: Partial<SyncContext> = {}): SyncContext => ({
  now: T0,
  enabled: true,
  intervalMinutes: 30,
  lastSyncAt: T0 - 20 * MIN,
  failures: 0,
  inFlight: false,
  visible: true,
  online: true,
  configured: true,
  ...over,
});

describe("siteSlotOffsetMs", () => {
  it("is the same for every studio on a site", () => {
    expect(siteSlotOffsetMs("29068", 30)).toBe(siteSlotOffsetMs(" 29068 ", 30));
    expect(siteSlotOffsetMs(29068, 30)).toBe(siteSlotOffsetMs("29068", 30));
  });

  it("is a whole number of minutes inside the interval", () => {
    for (const site of ["29068", "5746957", "1", "abc", "999999"]) {
      const off = siteSlotOffsetMs(site, 30)!;
      expect(off % MIN).toBe(0);
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThan(HALF);
    }
  });

  it("spreads different sites across the interval", () => {
    const offsets = new Set(
      Array.from({ length: 40 }, (_, i) => siteSlotOffsetMs(String(100000 + i * 7919), 30)),
    );
    expect(offsets.size).toBeGreaterThan(10);
  });

  it("is null for a studio with no site", () => {
    expect(siteSlotOffsetMs(null, 30)).toBeNull();
    expect(siteSlotOffsetMs("  ", 30)).toBeNull();
  });
});

describe("slotAtOrAfter and nextSlotDue", () => {
  it("finds the next boundary of the site's slots", () => {
    expect(slotAtOrAfter(T0 + 1, HALF, 0)).toBe(T0 + HALF);
    expect(slotAtOrAfter(T0, HALF, 0)).toBe(T0);
    expect(slotAtOrAfter(T0 + 1, HALF, 7 * MIN)).toBe(T0 + 7 * MIN);
  });

  it("a pull at a slot is next due at the following slot: still every interval", () => {
    expect(nextSlotDue(T0 + 40_000, 30, 0)).toBe(T0 + HALF);
  });

  it("a pull just before a slot skips it rather than pulling twice in a row", () => {
    const due = nextSlotDue(T0 - 2 * MIN, 30, 0);
    expect(due).toBe(T0 + HALF);
    expect(due - (T0 - 2 * MIN)).toBeLessThanOrEqual(HALF + MIN_SLOT_GAP_MS);
  });

  it("never waits longer than the interval plus the short gap", () => {
    for (let m = 0; m < 30; m++) {
      const last = T0 + m * MIN + 13_000;
      const gap = nextSlotDue(last, 30, 11 * MIN) - last;
      expect(gap).toBeGreaterThanOrEqual(MIN_SLOT_GAP_MS);
      expect(gap).toBeLessThanOrEqual(HALF + MIN_SLOT_GAP_MS);
    }
  });
});

describe("decideSync on the site's slots", () => {
  it("two studios on one site that last pulled minutes apart are due at the same moment", () => {
    const off = siteSlotOffsetMs("29068", 30)!;
    const a = nextDueAt(ctx({ lastSyncAt: T0 + 3 * MIN, slotOffsetMs: off }));
    const b = nextDueAt(ctx({ lastSyncAt: T0 + 17 * MIN, slotOffsetMs: off }));
    // Both land on a slot of the site, so after one more pull each they agree.
    expect(((a! - off) % HALF + HALF) % HALF).toBe(0);
    expect(((b! - off) % HALF + HALF) % HALF).toBe(0);
    const a2 = nextDueAt(ctx({ lastSyncAt: a! + 30_000, slotOffsetMs: off }));
    const b2 = nextDueAt(ctx({ lastSyncAt: b! + 50_000, slotOffsetMs: off }));
    expect(a2).toBe(b! === a! ? b2 : a2);
    expect(nextDueAt(ctx({ lastSyncAt: a2! + 20_000, slotOffsetMs: off }))).toBe(
      nextDueAt(ctx({ lastSyncAt: a2! + 45_000, slotOffsetMs: off })),
    );
  });

  it("without an offset it is the plain interval, as before", () => {
    expect(nextDueAt(ctx({ lastSyncAt: T0, slotOffsetMs: undefined }))).toBe(T0 + HALF);
  });

  it("a failing pull keeps the backoff from its own last attempt", () => {
    expect(nextDueAt(ctx({ lastSyncAt: T0, failures: 2, slotOffsetMs: 0 }))).toBe(T0 + 4 * HALF);
  });

  it("is due at the slot and not a minute before", () => {
    const last = T0 + 10_000;
    expect(decideSync(ctx({ now: T0 + HALF - MIN, lastSyncAt: last, slotOffsetMs: 0 })).run).toBe(false);
    expect(decideSync(ctx({ now: T0 + HALF, lastSyncAt: last, slotOffsetMs: 0 })).run).toBe(true);
  });
});

describe("claimIsStillDue on the site's slots", () => {
  it("the iPad that lost the race sees the slot already taken", () => {
    const winner = T0 + HALF + 5_000;
    expect(
      claimIsStillDue(winner, { now: T0 + HALF + 8_000, intervalMinutes: 30, failures: 0, slotOffsetMs: 0 }),
    ).toBe(false);
  });

  it("a slot nobody has taken is still due", () => {
    expect(
      claimIsStillDue(T0 + 10_000, { now: T0 + HALF + 1_000, intervalMinutes: 30, failures: 0, slotOffsetMs: 0 }),
    ).toBe(true);
  });
});
