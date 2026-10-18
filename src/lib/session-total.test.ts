import { describe, expect, it } from "vitest";
import {
  beforeJourneyGuess,
  beforeJourneySum,
  canClaimMilestone,
  sessionNumberWords,
  sessionTotalOf,
  thisSessionWords,
  totalIsSayable,
} from "./session-total";
import { numberWords } from "../features/hub-schedule/peek-model";

const prior = (sessions: number) => ({ sessions, through: "2026-09-01", source: "mindbody" as const });

describe("sessionTotalOf: sessions before Journey + Journey's (Atlas answers, Oct 2 2026)", () => {
  it("a confirmed record: the reconciled count is her total, and the split is kept", () => {
    const t = sessionTotalOf({ sessionCount: 312, priorHistory: prior(306) }, "partial");
    expect(t).toEqual({ basis: "confirmed", total: 312, journey: 6, before: 306, visits: null });
    expect(canClaimMilestone(t.basis)).toBe(true);
  });

  it("a confirmed record the reconciler hasn't folded in yet is added, never undercounted", () => {
    const t = sessionTotalOf({ sessionCount: 6, priorHistory: prior(306) }, "partial");
    expect(t.total).toBe(312);
  });

  it("a whole story: Journey's count is her total", () => {
    const t = sessionTotalOf({ sessionCount: 14 }, "complete");
    expect(t).toEqual({ basis: "whole-story", total: 14, journey: 14, before: 0, visits: null });
    expect(canClaimMilestone(t.basis)).toBe(true);
  });

  it("unconfirmed: Mindbody's visits less Journey's own sessions are the guess, and no milestone is claimed", () => {
    // Mindbody counts the 6 Journey logged too: 312 visits is 306 before + 6.
    const t = sessionTotalOf({ sessionCount: 6, clientsNumberOfVisitsAtSite: 312, firstSessionDate: "2026-09-20" }, "partial");
    expect(t).toEqual({ basis: "mindbody", total: 312, journey: 6, before: 306, visits: 312 });
    expect(canClaimMilestone(t.basis)).toBe(false);
    expect(totalIsSayable(t)).toBe(true);
    expect(beforeJourneyGuess(t)).toBe(306);
  });

  it("Journey's sessions come off Mindbody's count with no first Journey day: 10 and 310 is #310, never #320 (sessions round, #3)", () => {
    // A client whose first Journey session came from Log past session has no
    // firstSessionDate. Mindbody's 310 visits already include Journey's 10.
    const t = sessionTotalOf({ sessionCount: 10, clientsNumberOfVisitsAtSite: 310 }, "partial");
    expect(t).toMatchObject({ basis: "mindbody", total: 310, journey: 10, before: 300 });
    expect(beforeJourneyGuess(t)).toBe(300);
    expect(sessionNumberWords(t.total, t.basis)).toBe("#310");
  });

  it("no Journey session yet: every Mindbody visit is before Journey", () => {
    const t = sessionTotalOf({ sessionCount: 0, clientsNumberOfVisitsAtSite: 40 }, "partial");
    expect(t).toMatchObject({ basis: "mindbody", total: 40, before: 40 });
  });

  it("no guess anywhere: Journey's own count only, and no total", () => {
    const t = sessionTotalOf({ sessionCount: 5 }, "unknown");
    expect(t).toEqual({ basis: "journey-only", total: null, journey: 5, before: null, visits: null });
    expect(totalIsSayable(t)).toBe(false);
    expect(beforeJourneyGuess(t)).toBeNull();
  });

  it("an unknown Journey count is an unknown total, never zero", () => {
    expect(sessionTotalOf({ clientsNumberOfVisitsAtSite: 40 }, "partial").total).toBeNull();
    expect(sessionTotalOf({ priorHistory: prior(40) }, "partial").total).toBeNull();
  });
});

describe("beforeJourneySum: the sum beside Confirm (sessions round, Oct 12 2026)", () => {
  it("says how the guess was worked out", () => {
    const t = sessionTotalOf({ sessionCount: 6, clientsNumberOfVisitsAtSite: 312 }, "partial");
    expect(beforeJourneySum(t)).toBe("312 visits in Mindbody − 6 in Journey = 306");
    // The brief's worked example: the sum shows 300, the total #310.
    const ten = sessionTotalOf({ sessionCount: 10, clientsNumberOfVisitsAtSite: 310 }, "partial");
    expect(beforeJourneySum(ten)).toBe("310 visits in Mindbody − 10 in Journey = 300");
  });

  it("with none in Journey yet, says so instead of subtracting nothing", () => {
    expect(beforeJourneySum(sessionTotalOf({ sessionCount: 0, clientsNumberOfVisitsAtSite: 40 }, "partial"))).toBe(
      "40 visits in Mindbody, none in Journey yet",
    );
    expect(beforeJourneySum(sessionTotalOf({ sessionCount: 0, clientsNumberOfVisitsAtSite: 1 }, "partial"))).toBe(
      "1 visit in Mindbody, none in Journey yet",
    );
  });

  it("when Journey has more than Mindbody counted, says why the guess is none", () => {
    expect(beforeJourneySum(sessionTotalOf({ sessionCount: 9, clientsNumberOfVisitsAtSite: 2 }, "partial"))).toBe(
      "Mindbody counts 2 visits and Journey has 9, so none before Journey",
    );
  });

  it("is null with nothing to confirm, or with Journey's own count unknown", () => {
    expect(beforeJourneySum(sessionTotalOf({ sessionCount: 312, priorHistory: prior(306) }, "partial"))).toBeNull();
    expect(beforeJourneySum(sessionTotalOf({ sessionCount: 14 }, "complete"))).toBeNull();
    expect(beforeJourneySum(sessionTotalOf({ sessionCount: 5 }, "unknown"))).toBeNull();
    expect(beforeJourneySum(sessionTotalOf({ clientsNumberOfVisitsAtSite: 40 }, "partial"))).toBeNull();
  });
});

describe("the words", () => {
  it("#312 on the card, explained where a trainer opens it, and #6 in Journey with no guess", () => {
    expect(sessionNumberWords(312, "mindbody")).toBe("#312");
    expect(sessionNumberWords(312, "mindbody", { explain: true })).toBe("#312 · from Mindbody, not yet confirmed");
    expect(sessionNumberWords(312, "confirmed", { explain: true })).toBe("#312");
    expect(sessionNumberWords(6, "journey-only")).toBe("#6 in Journey");
    expect(sessionNumberWords(null, "mindbody")).toBeNull();
  });

  it("the peek: a guess is said to be one, a first session only off a sure total", () => {
    expect(numberWords(312, "mindbody")).toBe("312th session · from Mindbody, not yet confirmed");
    expect(numberWords(1, "mindbody")).toBe("1st session · from Mindbody, not yet confirmed");
    expect(numberWords(1, "whole-story")).toBe("first session");
    expect(numberWords(null, "journey-only", 6)).toBe("#6 in Journey");
    expect(numberWords(null, "confirmed")).toBeNull();
  });
});

describe("thisSessionWords: the Wrap-up says the number the briefing promised (F6 = c, Oct 18 2026)", () => {
  it("Mindbody's guess: the sessions before Journey plus Start's number", () => {
    // 312 visits, 5 in Journey before today: 307 before Journey, and today is Journey's 6th.
    expect(thisSessionWords({ sessionCount: 5, clientsNumberOfVisitsAtSite: 312 }, "partial", 6)).toBe("#313");
  });
  it("a confirmed record not folded into the count yet: added", () => {
    expect(thisSessionWords({ sessionCount: 5, priorHistory: prior(306) }, "partial", 6)).toBe("#312");
  });
  it("a confirmed record already folded into the count: Start's number holds it", () => {
    expect(thisSessionWords({ sessionCount: 311, priorHistory: prior(306) }, "partial", 312)).toBe("#312");
  });
  it("a record folded into the count between Start and Finish: still added, from Start's own number", () => {
    // Start saw 5 sessions (its number 6); the reconciler folded 306 in before Finish.
    expect(thisSessionWords({ sessionCount: 311, priorHistory: prior(306) }, "partial", 6)).toBe("#312");
  });
  it("the whole story in Journey: Start's number is the total", () => {
    expect(thisSessionWords({ sessionCount: 3 }, "complete", 4)).toBe("#4");
  });
  it("nothing before Journey known: no number, never Journey's own to a client who may have years", () => {
    expect(thisSessionWords({ sessionCount: 5 }, "partial", 6)).toBeNull();
  });
  it("no session number: nothing", () => {
    expect(thisSessionWords({ sessionCount: 5, clientsNumberOfVisitsAtSite: 312 }, "partial", null)).toBeNull();
    expect(thisSessionWords({ sessionCount: 5, clientsNumberOfVisitsAtSite: 312 }, "partial", 0)).toBeNull();
  });
});
