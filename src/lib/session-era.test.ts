import { describe, expect, it } from "vitest";
import { ERA_TAG_WORDS, TREND_ERA, eraOf, eraTag, inTrendEra, isFileMakerSession } from "./session-era";
import { isLegacySession } from "../features/client-history/model";
import { sessionTotalOf } from "./session-total";
import { priorUncounted } from "./prior-history";

describe("the session's era, derived at read time", () => {
  it("reads the import's marks: the FileMaker id, the fm_ session id, a set's session id, the chart imports' marks", () => {
    expect(eraOf({ id: "fm_100003602_2024-08-13", legacy_filemaker_id: "fm:2D62:2024-08-13" })).toBe("filemaker");
    expect(eraOf({ id: "fm_100003602_2024-08-13" })).toBe("filemaker");
    expect(eraOf({ legacy_filemaker_id: "x" })).toBe("filemaker");
    expect(eraOf({ sessionId: "fm_100003602_2024-08-13" })).toBe("filemaker");
    expect(eraOf({ trainerInitials: "Chart" })).toBe("filemaker");
    expect(eraOf({ trainerId: "legacy-trainer" })).toBe("filemaker");
    expect(eraOf({ id: "abc123", trainerInitials: "KS" })).toBe("journey");
    expect(eraOf({ sessionId: "abc123" })).toBe("journey");
    expect(eraOf(null)).toBe("journey");
    // A reader that worked it out already hands it back.
    expect(eraOf({ id: "abc", era: "filemaker" })).toBe("filemaker");
  });

  it("is the one rule isLegacySession reads", () => {
    expect(isLegacySession({ id: "fm_1_2024-01-01" } as never)).toBe(true);
    expect(isLegacySession({ legacy_filemaker_id: "x" } as never)).toBe(true);
    expect(isLegacySession({ trainerInitials: "Legacy" } as never)).toBe(true);
    expect(isLegacySession({ id: "x", trainerInitials: "KS" } as never)).toBe(false);
  });

  it("tags a FileMaker session with the same words everywhere, and Journey's own with nothing", () => {
    expect(eraTag({ legacy_filemaker_id: "x" })).toBe(ERA_TAG_WORDS);
    expect(ERA_TAG_WORDS).toBe("from FileMaker");
    expect(eraTag({ id: "abc" })).toBeNull();
    expect(isFileMakerSession({ id: "fm_1_2024-01-01" })).toBe(true);
  });

  it("decision (a) today: every measure reads both eras; (b) is the one word, and then only Journey's own", () => {
    expect(TREND_ERA).toBe("all");
    const fm = { id: "fm_1_2024-01-01", legacy_filemaker_id: "x" };
    const own = { id: "abc", trainerInitials: "KS" };
    expect(inTrendEra(fm)).toBe(true);
    expect(inTrendEra(own)).toBe(true);
    expect(inTrendEra(fm, "journey")).toBe(false);
    expect(inTrendEra(own, "journey")).toBe(true);
    // A set by its session id, the way the machine trends and the performance watch read it.
    expect(inTrendEra({ sessionId: "fm_1_2024-01-01" }, "journey")).toBe(false);
  });
});

describe("a client with both eras reads right (AJ, Oct 21 2026)", () => {
  // 48 FileMaker sessions imported against a stated total of 183, then 2 Journey sessions of her own.
  const prior = { sessions: 183, importedCount: 48, source: "filemaker" as const, through: "2026-10-21", recordedAt: "2026-10-22" };
  const sessions = [
    ...Array.from({ length: 48 }, (_, i) => ({ id: `fm_100000584_2026-0${3 + Math.floor(i / 20)}-${String((i % 20) + 1).padStart(2, "0")}`, legacy_filemaker_id: `fm:x:${i}`, status: "Completed" })),
    { id: "ownA", trainerInitials: "KS", status: "Completed" },
    { id: "ownB", trainerInitials: "KM", status: "Completed" },
  ];

  it("counts 185 in all, 50 of them in Journey, and numbers the next session #186", () => {
    // The import leaves sessionCount as the profile's reconciler sets it: Journey's 50 plus the 135 the record still holds uncounted.
    const uncounted = priorUncounted(prior as never);
    expect(uncounted).toBe(135);
    const client = { sessionCount: 50 + uncounted, completedSessions: 50, priorHistory: prior };
    const total = sessionTotalOf(client as never, "partial");
    expect(total).toMatchObject({ basis: "confirmed", total: 185, journey: 50, before: 135 });
    // Start numbers the next session sessionCount + 1.
    expect(client.sessionCount + 1).toBe(186);
    // Before the reconciler has run on her (sessionCount still Journey's own 50), the total is the same.
    expect(sessionTotalOf({ sessionCount: 50, priorHistory: prior } as never, "partial").total).toBe(185);
  });

  it("tags the two eras apart, and the trend measures read all 50 under (a) and the 2 under (b)", () => {
    expect(sessions.filter((s) => eraTag(s) === ERA_TAG_WORDS)).toHaveLength(48);
    expect(sessions.filter((s) => eraTag(s) === null).map((s) => s.id)).toEqual(["ownA", "ownB"]);
    expect(sessions.filter((s) => inTrendEra(s))).toHaveLength(50);
    expect(sessions.filter((s) => inTrendEra(s, "journey")).map((s) => s.id)).toEqual(["ownA", "ownB"]);
  });
});
