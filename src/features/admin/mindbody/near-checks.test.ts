import { describe, expect, it } from "vitest";
import {
  NEAR_CHECK_MIN,
  lastStudioDays,
  nearCheckAdds,
  nearCheckDocId,
  nearChecksLine,
  summariseNearChecks,
} from "./near-checks";

describe("nearCheckDocId", () => {
  it("names the studio day's document", () => {
    expect(nearCheckDocId("2026-10-12")).toBe("near-2026-10-12");
  });
  it("refuses anything that isn't a day, so the rules never see it", () => {
    expect(nearCheckDocId("today")).toBeNull();
    expect(nearCheckDocId(null)).toBeNull();
  });
});

describe("nearCheckAdds", () => {
  it("a whole pull of today and tomorrow that changed nothing is a check, not a find", () => {
    expect(nearCheckAdds({ deep: false, windowComplete: true, windowChanges: 0 })).toEqual({ checks: 1, finds: 0, rows: 0 });
  });
  it("one that changed bookings is a find, with how many", () => {
    expect(nearCheckAdds({ deep: false, windowComplete: true, windowChanges: 3 })).toEqual({ checks: 1, finds: 1, rows: 3 });
  });
  it("a month pull adds nothing: it is not the 30-minute check", () => {
    expect(nearCheckAdds({ deep: true, windowComplete: true, windowChanges: 5 })).toBeNull();
  });
  it("an answer that wasn't whole adds nothing: it checked nothing reliably", () => {
    expect(nearCheckAdds({ deep: false, windowComplete: false, windowChanges: 5 })).toBeNull();
    expect(nearCheckAdds({ deep: false, windowChanges: 5 })).toBeNull();
  });
  it("an older result with no count is a check that found nothing", () => {
    expect(nearCheckAdds({ deep: false, windowComplete: true })).toEqual({ checks: 1, finds: 0, rows: 0 });
  });
});

describe("lastStudioDays", () => {
  it("counts back across a month's end", () => {
    expect(lastStudioDays("2026-10-02", 4)).toEqual(["2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29"]);
  });
  it("is empty for a bad day", () => {
    expect(lastStudioDays("soon", 4)).toEqual([]);
  });
});

describe("summariseNearChecks", () => {
  it("adds the days that exist and skips the ones that don't", () => {
    expect(summariseNearChecks([{ checks: 30, finds: 2, rows: 3 }, null, { checks: 28 }])).toEqual({ checks: 58, finds: 2, rows: 3 });
  });
  it("ignores nonsense", () => {
    expect(summariseNearChecks([{ checks: -4, finds: Number.NaN, rows: "x" as unknown as number }])).toEqual({ checks: 0, finds: 0, rows: 0 });
  });
});

describe("nearChecksLine", () => {
  it("says there isn't enough yet below the minimum", () => {
    const line = nearChecksLine({ checks: NEAR_CHECK_MIN - 1, finds: 0, rows: 0 });
    expect(line.tone).toBe("info");
    expect(line.text).toMatch(/not enough yet/);
  });
  it("says plainly when the webhook had brought everything", () => {
    const line = nearChecksLine({ checks: 412, finds: 0, rows: 0 });
    expect(line.tone).toBe("ok");
    expect(line.text).toMatch(/412 background checks/);
    expect(line.text).toMatch(/none changed anything/);
  });
  it("says how often a check changed something, and how many bookings", () => {
    const line = nearChecksLine({ checks: 412, finds: 9, rows: 14 });
    expect(line.text).toMatch(/9 changed something the webhook hadn't brought \(14 bookings\)/);
  });
  it("a failed read is said as a failed read, never as all clear", () => {
    expect(nearChecksLine(null).text).toMatch(/Couldn't read/);
  });
});
