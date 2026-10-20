import { describe, expect, it } from "vitest";
import { NO_START_WORDS, SESSION_LIST_ROWS, recentSessionRows, upcomingSessionRows } from "./session-lists";

// Intl may write a narrow no-break space before AM / PM; compare plain words.
const plain = (s: string) => s.replace(/[  ]/g, " ");
const NOW = new Date("2026-10-20T12:00:00-04:00");

describe("upcomingSessionRows", () => {
  it("lists the bookings still booked, soonest first, on the studio's clock", () => {
    const rows = upcomingSessionRows(
      [
        { id: "b", startTime: new Date("2026-10-22T16:00:00-04:00"), status: "Scheduled" },
        { id: "x", startTime: new Date("2026-10-21T09:00:00-04:00"), status: "Cancelled" },
        { id: "a", startTime: new Date("2026-10-20T16:00:00-04:00"), status: "Scheduled" },
      ],
      NOW,
    );
    expect(rows.map((r) => r.key)).toEqual(["a", "b"]);
    expect(plain(rows[0].day)).toBe("Tue, Oct 20");
    expect(plain(rows[0].time)).toBe("4:00 PM");
  });

  it("stops at five", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `b${i}`,
      startTime: new Date(Date.UTC(2026, 9, 21 + i, 20)),
      status: "Scheduled",
    }));
    expect(upcomingSessionRows(many, NOW)).toHaveLength(SESSION_LIST_ROWS);
    expect(SESSION_LIST_ROWS).toBe(5);
  });

  it("says the year only when it is not this year", () => {
    const [row] = upcomingSessionRows([{ id: "y", startTime: new Date("2027-01-05T10:00:00-05:00") }], NOW);
    expect(plain(row.day)).toBe("Tue, Jan 5, 2027");
  });

  it("skips a booking with no start it can read", () => {
    expect(upcomingSessionRows([{ id: "n", startTime: null }], NOW)).toEqual([]);
  });
});

describe("recentSessionRows", () => {
  it("lists finished sessions newest first with the time each started and the booked time beside it", () => {
    const rows = recentSessionRows(
      [
        {
          id: "old",
          date: "2026-10-06",
          status: "Completed",
          startTime: { toMillis: () => new Date("2026-10-06T16:02:00-04:00").getTime() },
        },
        {
          id: "new",
          date: "2026-10-13",
          status: "Completed",
          startTime: { toMillis: () => new Date("2026-10-13T16:06:00-04:00").getTime() },
          bookingStartTime: { toMillis: () => new Date("2026-10-13T16:00:00-04:00").getTime() },
        },
        { id: "live", date: "2026-10-20", status: "In-Progress", startTime: new Date("2026-10-20T11:00:00-04:00") },
      ],
      NOW,
    );
    expect(rows.map((r) => r.key)).toEqual(["new", "old"]);
    expect(plain(rows[0].day)).toBe("Tue, Oct 13");
    expect(plain(rows[0].time)).toBe("Started 4:06 PM · booked 4:00 PM");
    // No booking matched at Finish: the start alone, never a guessed booking.
    expect(plain(rows[1].time)).toBe("Started 4:02 PM");
  });

  it("falls back to the iPad's clock while the server stamp is pending", () => {
    const [row] = recentSessionRows(
      [{ id: "c", date: "2026-10-15", status: "Completed", clientStartTime: "2026-10-15T07:31:00-04:00" }],
      NOW,
    );
    expect(plain(row.time)).toBe("Started 7:31 AM");
  });

  it("says when no start time was recorded, and keeps the day from the session's date", () => {
    const [row] = recentSessionRows([{ id: "fm", date: "2026-09-01", status: "Completed" }], NOW);
    expect(plain(row.day)).toBe("Tue, Sep 1");
    expect(row.time).toBe(NO_START_WORDS);
    expect(row.unknownTime).toBe(true);
  });
});
