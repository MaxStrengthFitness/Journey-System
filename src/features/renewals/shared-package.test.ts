import { describe, it, expect } from "vitest";
import { buildRenewalSnapshot, type AttendanceRow, type RenewalEngineInput } from "./engine";
import { renewalOf } from "./auto-renew";
import { laneOf } from "./pipeline";
import { chipText } from "./sentences";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import { sharedWithSentence, sharerUsedDays, sharersByHolder } from "./shared-package";
import { runningLow } from "../admin/renewals/running-low";
import { addDays } from "../client-history/model";
import type { Client, SharesPackageWith } from "../../types";

const TODAY = "2026-10-22";
const START = "2026-06-01";

function weekly(from: string, weekday = 0): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  for (let d = addDays(from, weekday); d <= TODAY; d = addDays(d, 7)) out.push({ day: d, kind: "visit", trainerId: "t1" });
  return out;
}
function client(id: string, over: Partial<Client> = {}): Client {
  return {
    id,
    firstName: id === "jane" ? "Jane" : "Tom",
    lastName: "Doe",
    homeStudioId: "strongsville",
    height: "",
    isActive: true,
    remainingSessions: 0,
    mindbodyCommercialSyncedAt: "synced",
    mindbodyServicesSyncedAt: "synced",
    ...over,
  } as Client;
}
const mark: SharesPackageWith = { clientId: "jane", name: "Jane Doe", setAt: "2026-10-22T12:00:00Z", setByName: "AJ" };
const jane = client("jane", {
  mindbodyContracts: { k: { clientContractId: 1, status: "Active", contractName: "48 Sessions - 2X Week", startDate: START, endDate: "2026-11-15" } },
  mindbodyServices: { p: { serviceId: 2, name: "48 Sessions - 2X Week", count: 8, remaining: 6, activeDate: "2026-10-01" } },
});
const tom = client("tom", { sharesPackageWith: mark });
const snap = (c: Client, over: Partial<RenewalEngineInput> = {}) =>
  buildRenewalSnapshot({ client: c, settings: DEFAULT_RENEWAL_SETTINGS, today: TODAY, attendance: weekly("2026-08-01"), attendanceSince: "2026-06-01", ...over });

describe("the holder's pace counts both people (AJ, Oct 22 2026)", () => {
  it("two people in on the same day are two sessions", () => {
    const alone = snap(jane);
    const shared = snap(jane, { sharers: [{ clientId: "tom", name: "Tom Doe", attendance: weekly("2026-08-01") }] });
    expect(alone.pacePerWeek).toBe(1);
    expect(shared.pacePerWeek).toBe(2);
    expect(shared.sharedWith).toEqual([{ clientId: "tom", name: "Tom Doe" }]);
    expect(sharedWithSentence(shared)).toBe("Shared with Tom Doe");
    expect(alone.sharedWith).toBeUndefined();
  });

  it("the run-out day comes sooner when the sessions are shared", () => {
    const alone = snap(jane);
    const shared = snap(jane, { sharers: [{ clientId: "tom", name: "Tom Doe", attendance: weekly("2026-08-01", 3) }] });
    expect(shared.runOutDate && alone.runOutDate && shared.runOutDate < alone.runOutDate).toBe(true);
  });

  it("a sharer's own day counts once, late cancels included, only up to today", () => {
    expect(
      sharerUsedDays(
        [
          { day: "2026-10-01", kind: "visit" },
          { day: "2026-10-01", kind: "visit" },
          { day: "2026-10-03", kind: "no-show" },
          { day: "2026-10-05", kind: "cancelled" },
          { day: "2026-10-30", kind: "booked" },
        ],
        TODAY,
      ).sort(),
    ).toEqual(["2026-10-01", "2026-10-03"]);
  });
});

describe("the sharer's record", () => {
  const s = snap(tom);
  it("is shared: no count, no dates, never a renewal of her own", () => {
    expect(s).toMatchObject({
      situation: "shared",
      sharedPackage: { holderId: "jane", holderName: "Jane Doe" },
      packageLabel: "Shares Jane Doe's package",
      sessionsLeft: null,
      conversationDue: false,
      cycleKey: null,
      focusDate: null,
    });
    expect(s.dataGaps.some((g) => /shows no package/.test(g))).toBe(false);
    expect(laneOf(s, null, DEFAULT_RENEWAL_SETTINGS, TODAY)).toBeNull();
    expect(chipText(s, TODAY)).toBe("Shares Jane Doe's package");
    const low = runningLow({ clients: [{ ...tom, renewal: s }], studioId: "strongsville", cycles: {}, settings: DEFAULT_RENEWAL_SETTINGS, today: TODAY, inactiveMarks: new Map(), inactiveDays: 60 });
    expect(low).toEqual({ rows: [], notKnown: 0 });
  });

  it("a mark saved today is shared at once; a holder never counts her own sharers twice", () => {
    const stored = snap(client("tom"));
    expect(stored.situation).not.toBe("shared");
    const c = { renewal: stored, sharesPackageWith: mark };
    expect(renewalOf(c)?.situation).toBe("shared");
    expect(renewalOf(c)).toBe(renewalOf(c));
    const odd = snap(tom, { sharers: [{ clientId: "x", name: "X", attendance: weekly("2026-08-01") }] });
    expect(odd.sharedWith ?? null).toBeNull();
  });
});

describe("sharersByHolder", () => {
  it("finds each holder's sharers in the roster, skipping a mark on herself or on someone not there", () => {
    const ann = client("ann", { sharesPackageWith: { ...mark } });
    const self = client("solo", { sharesPackageWith: { ...mark, clientId: "solo" } });
    const away = client("away", { sharesPackageWith: { ...mark, clientId: "elsewhere" } });
    const map = sharersByHolder([jane, tom, ann, self, away]);
    expect([...map.keys()]).toEqual(["jane"]);
    expect(map.get("jane")?.map((c) => c.id)).toEqual(["tom", "ann"]);
  });
});
