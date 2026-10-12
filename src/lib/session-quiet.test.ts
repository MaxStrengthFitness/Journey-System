import { describe, expect, it } from "vitest";
import { QUIET_WORDS, lastActiveWords, quietKindOf, quietLine } from "./session-quiet";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00-04:00");
const at = (iso: string) => Date.parse(iso);

describe("why a session went quiet (the sessions round, Oct 12 2026)", () => {
  it("is Paused when Pause was pressed today", () => {
    const s = { status: "In-Progress", createdAt: at("2026-10-12T13:30:00-04:00"), lastHeartbeatAt: at("2026-10-12T14:00:00-04:00"), pausedAt: at("2026-10-12T14:10:00-04:00") };
    expect(quietKindOf(s, NOW, TZ)).toBe("paused");
    expect(quietLine(s, "paused", NOW, TZ)).toBe("Paused at 2:10 PM");
  });

  it("is At End Session when End Session was pressed today, ahead of a pause", () => {
    const s = { status: "In-Progress", lastHeartbeatAt: at("2026-10-12T14:00:00-04:00"), endTime: at("2026-10-12T14:10:00-04:00"), pausedAt: at("2026-10-12T14:05:00-04:00") };
    expect(quietKindOf(s, NOW, TZ)).toBe("at-end-session");
    expect(quietLine(s, "at-end-session", NOW, TZ)).toBe("Stopped at End Session at 2:10 PM");
  });

  it("is Left open with neither, and a day later whatever it was", () => {
    const plain = { status: "In-Progress", lastHeartbeatAt: at("2026-10-12T09:40:00-04:00") };
    expect(quietKindOf(plain, NOW, TZ)).toBe("left-open");
    expect(quietLine(plain, "left-open", NOW, TZ)).toBe("Left open · last active 9:40 AM");
    const pausedYesterday = { status: "In-Progress", lastHeartbeatAt: at("2026-10-11T14:00:00-04:00"), pausedAt: at("2026-10-11T14:10:00-04:00") };
    expect(quietKindOf(pausedYesterday, NOW, TZ)).toBe("left-open");
    const endedYesterday = { status: "In-Progress", lastHeartbeatAt: at("2026-10-11T14:00:00-04:00"), endTime: at("2026-10-11T14:10:00-04:00") };
    expect(quietKindOf(endedYesterday, NOW, TZ)).toBe("left-open");
    expect(quietLine(endedYesterday, "left-open", NOW, TZ)).toBe("Left open · last active Yesterday 2:00 PM");
  });

  it("reads a pending server time as now", () => {
    const pending = { status: "In-Progress", lastHeartbeatAt: at("2026-10-12T09:00:00-04:00"), pausedAt: { _methodName: "serverTimestamp" } };
    expect(quietKindOf(pending, NOW, TZ)).toBe("paused");
    expect(quietLine(pending, "paused", NOW, TZ)).toBe("Paused at 3:00 PM");
    const noClock = { status: "In-Progress", endTime: { _methodName: "serverTimestamp" } };
    expect(quietKindOf(noClock, NOW, TZ)).toBe("at-end-session");
  });

  it("says the words, and the day as a person says it", () => {
    expect(QUIET_WORDS).toEqual({ paused: "Paused", "at-end-session": "At End Session", "left-open": "Left open" });
    expect(lastActiveWords(at("2026-10-09T09:40:00-04:00"), NOW, TZ)).toBe("Fri 9:40 AM");
    expect(lastActiveWords(at("2026-09-27T09:40:00-04:00"), NOW, TZ)).toBe("Sep 27 9:40 AM");
  });
});
