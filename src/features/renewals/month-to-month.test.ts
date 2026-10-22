import { describe, it, expect } from "vitest";
import { buildRenewalSnapshot, type AttendanceRow, type RenewalEngineInput } from "./engine";
import { renewalOf } from "./auto-renew";
import { laneOf } from "./pipeline";
import { chipText, situationSentence } from "./sentences";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import { isMonthToMonthRecord, monthToMonthWhySentence } from "./month-to-month";
import { runningLow } from "../admin/renewals/running-low";
import type { Client, ContractTierOverride, MindbodyContract, MindbodyService } from "../../types";

const TODAY = "2026-10-21";

function contract(id: number, contractName: string, startDate: string, endDate: string, over: Partial<MindbodyContract> = {}): MindbodyContract {
  return { clientContractId: id, status: "Active", contractName, startDate, endDate, ...over };
}
function service(id: number, name: string, remaining: number, activeDate: string, count = 8): MindbodyService {
  return { serviceId: id, name, count, remaining, activeDate };
}
function client(over: Partial<Client> = {}): Client {
  return {
    id: "c1",
    firstName: "Mary",
    lastName: "Smith",
    homeStudioId: "strongsville",
    height: "",
    isActive: true,
    remainingSessions: 0,
    mindbodyCommercialSyncedAt: "synced",
    mindbodyServicesSyncedAt: "synced",
    ...over,
  } as Client;
}
const visits: AttendanceRow[] = [
  { day: "2026-10-07", kind: "visit", trainerId: "t1" },
  { day: "2026-10-14", kind: "visit", trainerId: "t1" },
  { day: "2026-10-28", kind: "booked" },
];
const snap = (c: Client, over: Partial<RenewalEngineInput> = {}) =>
  buildRenewalSnapshot({ client: c, settings: DEFAULT_RENEWAL_SETTINGS, today: TODAY, attendance: visits, attendanceSince: "2026-06-01", ...over });
const lock = (payment: ContractTierOverride["payment"]): ContractTierOverride => ({ term: null, payment, setAt: "2026-10-21T12:00:00Z", note: "Pays as she goes" });

describe("who is month to month (AJ, Oct 21 2026)", () => {
  it("a session pack contract running today", () => {
    const s = snap(client({ mindbodyContracts: { a: contract(1, "2 x Week-Session Pack", "2026-09-01", "2027-09-01") } }));
    expect(s.situation).toBe("month-to-month");
    expect(s.monthToMonth).toEqual({ from: "contract", name: "2 x Week-Session Pack", since: "2026-09-01" });
  });

  it("a pricing option on the list, the newest thing bought", () => {
    const s = snap(
      client({
        mindbodyServices: {
          old: service(1, "48 Sessions - 2X Week", 0, "2025-09-01"),
          m: service(2, "8 Sessions", 3, "2026-10-01"),
        },
      }),
    );
    expect(s.situation).toBe("month-to-month");
    expect(s.monthToMonth?.from).toBe("pricing-option");
  });

  it("not once a package is bought after it, nor while a package contract runs", () => {
    const later = snap(
      client({ mindbodyServices: { m: service(2, "Session $49", 0, "2026-08-01"), p: service(3, "48 Sessions - 2X Week", 8, "2026-10-01") } }),
    );
    expect(later.situation).not.toBe("month-to-month");
    const running = snap(
      client({
        mindbodyContracts: { a: contract(1, "48 Sessions - 2X Week", "2026-06-01", "2026-11-15") },
        mindbodyServices: { m: service(2, "Session $49", 1, "2026-10-01") },
      }),
    );
    expect(running.situation).not.toBe("month-to-month");
  });

  it("a coach's lock decides, either way", () => {
    const locked = snap(client({ contractTierOverride: lock("month-to-month"), mindbodyContracts: { a: contract(1, "48 Sessions - 2X Week", "2026-06-01", "2026-11-15") } }));
    expect(locked.situation).toBe("month-to-month");
    expect(locked.monthToMonth).toEqual({ from: "lock", name: "Pays as she goes", since: null });
    const otherLock = snap(client({ contractTierOverride: lock("pif"), mindbodyServices: { m: service(2, "8 Sessions", 3, "2026-10-01") } }));
    expect(otherLock.situation).not.toBe("month-to-month");
  });

  it("a studio that emptied its list has nobody month to month by name", () => {
    const s = snap(client({ mindbodyServices: { m: service(2, "8 Sessions", 3, "2026-10-01") } }), {
      settings: { ...DEFAULT_RENEWAL_SETTINGS, monthToMonthNames: [] },
    });
    expect(s.situation).not.toBe("month-to-month");
  });
});

describe("what a month-to-month record says", () => {
  const s = snap(client({ mindbodyServices: { m: service(2, "4 Sessions", 1, "2026-10-01", 4) } }));

  it("no sessions left, no dates, no warning, no cycle; attendance kept", () => {
    expect(s).toMatchObject({
      situation: "month-to-month",
      sessionsLeft: null,
      runOutDate: null,
      chargeDate: null,
      commitmentEnd: null,
      projection: null,
      conversationDue: false,
      chargeWarning: false,
      focusDate: null,
      cycleKey: null,
      packageLabel: "Month-to-month",
      lastVisitDate: "2026-10-14",
      nextBookingDate: "2026-10-28",
    });
    expect(s.dataGaps.some((g) => /isn't matched/.test(g))).toBe(false);
    expect(isMonthToMonthRecord(s)).toBe(true);
  });

  it("is in no renewal lane and never running low", () => {
    expect(laneOf(s, null, DEFAULT_RENEWAL_SETTINGS, TODAY)).toBeNull();
    const low = runningLow({
      clients: [client({ renewal: s })],
      studioId: "strongsville",
      cycles: {},
      settings: DEFAULT_RENEWAL_SETTINGS,
      today: TODAY,
      inactiveMarks: new Map(),
      inactiveDays: 60,
    });
    expect(low).toEqual({ rows: [], notKnown: 0 });
  });

  it("says M2M", () => {
    expect(chipText(s, TODAY)).toBe("M2M");
    expect(situationSentence(s, TODAY)).toMatch(/^M2M/);
    expect(monthToMonthWhySentence(s.monthToMonth)).toBe(
      "Month to month: the Mindbody pricing option “4 Sessions” is on this studio's month-to-month list.",
    );
  });

  it("a lock saved today is M2M at once on a single client's screens, the same object every render", () => {
    const stored = snap(client({ mindbodyContracts: { a: contract(1, "48 Sessions - 2X Week", "2026-06-01", "2026-11-15") }, mindbodyServices: { p: service(3, "48 Sessions - 2X Week", 6, "2026-10-01") } }));
    expect(stored.situation).not.toBe("month-to-month");
    const c = { renewal: stored, contractTierOverride: lock("month-to-month") };
    const a = renewalOf(c);
    expect(a?.situation).toBe("month-to-month");
    expect(a?.sessionsLeft).toBeNull();
    expect(renewalOf(c)).toBe(a);
  });
});
