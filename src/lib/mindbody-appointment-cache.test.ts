import { describe, expect, it, vi } from "vitest";
import {
  EVENT_MARGIN_MS,
  SHARED_READ_MS,
  SharedSiteReads,
  bookingDay,
  rowIsNewerThanAnswer,
  type SiteRead,
} from "./mindbody-appointment-cache";

const appt = (id: number, day: string, loc = 3) => ({
  Id: id,
  StartDateTime: `${day}T09:00:00`,
  Location: { Id: loc },
});

const read = (over: Partial<SiteRead> = {}): SiteRead => ({
  siteId: "29068",
  start: "2026-10-12",
  end: "2026-10-13",
  fetchedAt: 1_000_000,
  siteTotal: 3,
  appointments: [appt(1, "2026-10-12"), appt(2, "2026-10-13"), appt(3, "2026-10-13", 5)],
  ...over,
});

describe("bookingDay", () => {
  it("reads the site-local day a booking starts on", () => {
    expect(bookingDay(appt(1, "2026-10-12"))).toBe("2026-10-12");
  });
  it("is null for a booking with no readable start", () => {
    expect(bookingDay({ StartDateTime: "" })).toBeNull();
    expect(bookingDay({})).toBeNull();
    expect(bookingDay(null)).toBeNull();
  });
});

describe("SharedSiteReads.find", () => {
  it("answers the same window from a whole read", () => {
    const c = new SharedSiteReads();
    c.keep(read(), true);
    const got = c.find("29068", "2026-10-12", "2026-10-13", 1_000_000 + 1000);
    expect(got?.appointments).toHaveLength(3);
    expect(got?.fetchedAt).toBe(1_000_000);
  });

  it("narrows a wider read to the days asked for", () => {
    const c = new SharedSiteReads();
    c.keep(read(), true);
    const got = c.find("29068", "2026-10-13", "2026-10-13", 1_000_000);
    expect(got?.appointments.map((a: any) => a.Id)).toEqual([2, 3]);
    expect(got?.start).toBe("2026-10-13");
    expect(got?.siteTotal).toBe(2);
  });

  it("never answers a window wider than what was read", () => {
    const c = new SharedSiteReads();
    c.keep(read(), true);
    expect(c.find("29068", "2026-10-12", "2026-10-20", 1_000_000)).toBeNull();
    expect(c.find("29068", "2026-10-11", "2026-10-13", 1_000_000)).toBeNull();
  });

  it("never answers another site", () => {
    const c = new SharedSiteReads();
    c.keep(read(), true);
    expect(c.find("5746957", "2026-10-12", "2026-10-13", 1_000_000)).toBeNull();
  });

  it("forgets a read older than two minutes", () => {
    const c = new SharedSiteReads();
    c.keep(read(), true);
    expect(c.find("29068", "2026-10-12", "2026-10-13", 1_000_000 + SHARED_READ_MS)).not.toBeNull();
    expect(c.find("29068", "2026-10-12", "2026-10-13", 1_000_000 + SHARED_READ_MS + 1)).toBeNull();
  });

  it("prefers the newest read that covers the window", () => {
    const c = new SharedSiteReads();
    c.keep(read({ start: "2026-10-12", end: "2026-11-11", fetchedAt: 1_000_000 }), true);
    c.keep(read({ fetchedAt: 1_050_000 }), true);
    expect(c.find("29068", "2026-10-12", "2026-10-13", 1_060_000)?.fetchedAt).toBe(1_050_000);
  });

  it("refuses a malformed window", () => {
    const c = new SharedSiteReads();
    c.keep(read(), true);
    expect(c.find("29068", "2026-10-13", "2026-10-12", 1_000_000)).toBeNull();
    expect(c.find("29068", "today", "2026-10-12", 1_000_000)).toBeNull();
  });
});

describe("SharedSiteReads.keep", () => {
  it("never keeps a short answer: half an answer must not stand in for a whole one", () => {
    const c = new SharedSiteReads();
    expect(c.keep(read(), false)).toBe(false);
    expect(c.find("29068", "2026-10-12", "2026-10-13", 1_000_000)).toBeNull();
  });

  it("keeps at most the limit, oldest dropped first", () => {
    const c = new SharedSiteReads(SHARED_READ_MS, 2);
    c.keep(read({ siteId: "a" }), true);
    c.keep(read({ siteId: "b" }), true);
    c.keep(read({ siteId: "c" }), true);
    expect(c.size(1_000_000)).toBe(2);
    expect(c.find("a", "2026-10-12", "2026-10-13", 1_000_000)).toBeNull();
    expect(c.find("c", "2026-10-12", "2026-10-13", 1_000_000)).not.toBeNull();
  });

  it("does not keep an answer too big to hold", () => {
    const c = new SharedSiteReads(SHARED_READ_MS, 12, 2);
    expect(c.keep(read(), true)).toBe(false);
  });

  it("a newer read of the same window replaces the older one", () => {
    const c = new SharedSiteReads();
    c.keep(read({ fetchedAt: 1_000_000 }), true);
    c.keep(read({ fetchedAt: 1_010_000 }), true);
    expect(c.size(1_010_000)).toBe(1);
  });
});

describe("SharedSiteReads.read", () => {
  it("asks Mindbody once for two studios on one site, and the second says it shared", async () => {
    const c = new SharedSiteReads();
    const fetch = vi.fn(async () => ({ read: read(), complete: true }));
    const first = await c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch);
    const second = await c.read("29068", "2026-10-12", "2026-10-13", () => 1_030_000, fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first?.shared).toBeNull();
    expect(second?.shared).toBe("kept");
    expect(second?.read.fetchedAt).toBe(1_000_000);
  });

  it("two requests at the same moment share the read in flight", async () => {
    const c = new SharedSiteReads();
    let release: (v: { read: SiteRead; complete: boolean }) => void = () => undefined;
    const fetch = vi.fn(
      () =>
        new Promise<{ read: SiteRead; complete: boolean }>((resolve) => {
          release = resolve;
        }),
    );
    const a = c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch);
    const b = c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch);
    release({ read: read(), complete: true });
    const [ra, rb] = await Promise.all([a, b]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ra?.shared).toBeNull();
    expect(rb?.shared).toBe("joined");
  });

  it("a short answer is handed back but never shared, so the next caller reads for itself", async () => {
    const c = new SharedSiteReads();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ read: read(), complete: false })
      .mockResolvedValueOnce({ read: read(), complete: true });
    const first = await c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch);
    expect(first?.complete).toBe(false);
    const second = await c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(second?.complete).toBe(true);
  });

  it("a caller that joined a refused read asks Mindbody itself", async () => {
    const c = new SharedSiteReads();
    let release: (v: null) => void = () => undefined;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<null>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce({ read: read(), complete: true });
    const a = c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch);
    const b = c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch);
    release(null);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBeNull();
    expect(rb?.complete).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("a read that throws lets go of its place, and the next caller tries again", async () => {
    const c = new SharedSiteReads();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ read: read(), complete: true });
    await expect(c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch)).rejects.toThrow("timeout");
    const again = await c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, fetch);
    expect(again?.complete).toBe(true);
  });
});

describe("rowIsNewerThanAnswer", () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const answer = 2_000_000;

  it("a webhook event after the read leaves the row alone", () => {
    expect(rowIsNewerThanAnswer({ mindbodyEventAt: ts(answer + 5_000) }, answer)).toBe(true);
  });

  it("a webhook event just before the read still counts, inside the margin", () => {
    expect(rowIsNewerThanAnswer({ mindbodyEventAt: ts(answer - EVENT_MARGIN_MS + 1) }, answer)).toBe(true);
    expect(rowIsNewerThanAnswer({ mindbodyEventAt: ts(answer - EVENT_MARGIN_MS - 1) }, answer)).toBe(false);
  });

  it("a row written since the read is left alone", () => {
    expect(rowIsNewerThanAnswer({ lastSyncAt: ts(answer + 1) }, answer)).toBe(true);
    expect(rowIsNewerThanAnswer({ lastSyncAt: ts(answer - 1) }, answer)).toBe(false);
  });

  it("an older proxy that says nothing about its read changes nothing", () => {
    expect(rowIsNewerThanAnswer({ lastSyncAt: ts(answer + 1) }, undefined)).toBe(false);
    expect(rowIsNewerThanAnswer({ lastSyncAt: ts(answer + 1) }, null)).toBe(false);
  });

  it("reads plain numbers, dates and {seconds} as well as Timestamps", () => {
    expect(rowIsNewerThanAnswer({ lastSyncAt: answer + 10 }, answer)).toBe(true);
    expect(rowIsNewerThanAnswer({ lastSyncAt: new Date(answer + 10) }, answer)).toBe(true);
    expect(rowIsNewerThanAnswer({ lastSyncAt: { seconds: answer / 1000 + 1 } }, answer)).toBe(true);
  });

  it("a row with no stamps is never newer", () => {
    expect(rowIsNewerThanAnswer({}, answer)).toBe(false);
    expect(rowIsNewerThanAnswer(null, answer)).toBe(false);
  });
});

describe("SharedSiteReads.read — a sibling's wider read in flight", () => {
  it("today and tomorrow wait for the month already being read, and take their days from it", async () => {
    const c = new SharedSiteReads();
    let release: (v: { read: SiteRead; complete: boolean }) => void = () => undefined;
    const month = vi.fn(
      () =>
        new Promise<{ read: SiteRead; complete: boolean }>((resolve) => {
          release = resolve;
        }),
    );
    const near = vi.fn(async () => ({ read: read(), complete: true }));
    const a = c.read("29068", "2026-10-12", "2026-11-11", () => 1_000_000, month);
    const b = c.read("29068", "2026-10-13", "2026-10-13", () => 1_000_000, near);
    release({ read: read({ start: "2026-10-12", end: "2026-11-11" }), complete: true });
    const [, rb] = await Promise.all([a, b]);
    expect(near).not.toHaveBeenCalled();
    expect(rb?.shared).toBe("joined");
    expect(rb?.read.appointments.map((x: any) => x.Id)).toEqual([2, 3]);
  });

  it("a wider window never waits for a narrower read", async () => {
    const c = new SharedSiteReads();
    let release: (v: { read: SiteRead; complete: boolean }) => void = () => undefined;
    const near = vi.fn(
      () =>
        new Promise<{ read: SiteRead; complete: boolean }>((resolve) => {
          release = resolve;
        }),
    );
    const month = vi.fn(async () => ({ read: read({ end: "2026-11-11" }), complete: true }));
    const a = c.read("29068", "2026-10-12", "2026-10-13", () => 1_000_000, near);
    const b = await c.read("29068", "2026-10-12", "2026-11-11", () => 1_000_000, month);
    expect(month).toHaveBeenCalledTimes(1);
    expect(b?.shared).toBeNull();
    release({ read: read(), complete: true });
    await a;
  });
});
