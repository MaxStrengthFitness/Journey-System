/**
 * THE CARD IN WORDS (the narrow cards round, Oct 18 2026): the card's spoken
 * name holds everything the card can show, in every state, so a narrow card
 * can show less and nothing is lost. HubCard.render.test.tsx holds it
 * against the markup the card actually draws.
 */
import { describe, expect, it } from "vitest";
import type { HubCardState } from "../../lib/hub-card-state";
import { TALL_SPAN_MINUTES, cardSpanKind, cardStateWords, initialsOf, spokenCard, timeAndSuffix, type SpokenCardParts } from "./card-words";

const STATES: HubCardState[] = ["live", "in-session", "left-open", "done", "not-logged", "didnt-come", "past", "unread"];

describe("what is happening, in the card's own words", () => {
  it("is the word the card shows, or what its mark and fill say", () => {
    const words = (state: HubCardState, now = false, quietWord: string | null = null) => cardStateWords({ kind: "client", state, now, quietWord });
    expect(words("live")).toEqual([]);
    expect(words("live", true)).toEqual(["Now"]);
    expect(words("in-session")).toEqual(["In session"]);
    expect(words("done")).toEqual(["Done"]);
    expect(words("not-logged")).toEqual(["Not logged"]);
    expect(words("didnt-come")).toEqual(["Late cancel"]);
    expect(words("left-open")).toEqual(["Left open"]);
    expect(words("left-open", false, "Paused")).toEqual(["Paused"]);
    expect(words("left-open", false, "At End Session")).toEqual(["At End Session"]);
    // Over with nothing to claim: a failed read says nothing, as the card does.
    expect(words("past")).toEqual([]);
    expect(words("unread")).toEqual([]);
  });

  it("says why a card with no profile can't be opened, whatever its booking's state", () => {
    for (const state of STATES) {
      expect(cardStateWords({ kind: "unlinked", state, now: false })).toEqual(["Not synced yet"]);
      expect(cardStateWords({ kind: "pending", state, now: false })).toEqual(["Loading this client"]);
      expect(cardStateWords({ kind: "unknown", state, now: false })).toEqual(["Couldn't check this client's profile"]);
    }
  });
});

const BASE: SpokenCardParts = {
  name: "Maria Kowalski",
  numberText: null,
  stateWords: [],
  time: "10:00",
  critical: null,
  glyphs: [],
  more: 0,
  moreLabel: null,
  rest: [],
};

describe("the card's spoken name", () => {
  it("in every state holds the name, the time, the state word, her number, Read first and every glyph's label", () => {
    const glyphs = [
      { label: "Sleep & Recovery is Red", rank: 0 },
      { label: "Back after 5 wk", rank: 1 },
    ];
    for (const state of STATES) {
      for (const now of [false, true]) {
        const stateWords = cardStateWords({ kind: "client", state, now, quietWord: state === "left-open" ? "Paused" : null });
        const label = spokenCard({ ...BASE, numberText: "#264", stateWords, critical: "Critical: no overhead press", glyphs, more: 1, moreLabel: "Renewal talk" });
        for (const part of ["Maria Kowalski", "session 264", "10:00", "Read first: Critical: no overhead press", "Sleep & Recovery is Red", "Back after 5 wk", "1 more: Renewal talk", ...stateWords]) {
          expect(label, `${state}${now ? " now" : ""}: ${part}`).toContain(part);
        }
      }
    }
  });

  it("says them in the card's order: name, number, state, time, Read first, glyphs, +N, the rest, who it was booked with", () => {
    expect(
      spokenCard({
        name: "Maria Kowalski",
        numberText: "#264",
        stateWords: ["Not logged"],
        time: "10:00 – 10:45 AM",
        critical: "Critical: no overhead press",
        glyphs: [
          { label: "Consultation", rank: 1 },
          { label: "No waiver signed", rank: 0 },
        ],
        more: 2,
        moreLabel: "Renewal talk, Something to ask about",
        rest: ["New to Journey", "InBody Scan"],
        staffName: "Westlake Rotation",
      }),
    ).toBe(
      "Maria Kowalski, session 264, Not logged, 10:00 – 10:45 AM, Read first: Critical: no overhead press, No waiver signed, Consultation, 2 more: Renewal talk, Something to ask about, New to Journey, InBody Scan, Booked with Westlake Rotation",
    );
  });

  it("leaves out what the card doesn't have, and says a bare +N plainly", () => {
    expect(spokenCard(BASE)).toBe("Maria Kowalski, 10:00");
    expect(spokenCard({ ...BASE, time: "" })).toBe("Maria Kowalski");
    expect(spokenCard({ ...BASE, more: 1, moreLabel: null })).toBe("Maria Kowalski, 10:00, 1 more");
    expect(spokenCard({ ...BASE, name: "  Maria   Kowalski ", stateWords: ["", "Now"] })).toBe("Maria Kowalski, Now, 10:00");
  });

  it("says a card with no profile by Mindbody's name, with why it can't be opened", () => {
    const stateWords = cardStateWords({ kind: "unlinked", state: "live", now: false });
    expect(spokenCard({ ...BASE, name: "Ann Lee", stateWords })).toBe("Ann Lee, Not synced yet, 10:00");
  });
});

describe("the time's parts", () => {
  it("splits a span's AM or PM from it, and leaves one clock whole", () => {
    expect(timeAndSuffix("10:00 – 10:45 AM")).toEqual(["10:00 – 10:45", " AM"]);
    expect(timeAndSuffix("12:00 – 12:30 PM")).toEqual(["12:00 – 12:30", " PM"]);
    expect(timeAndSuffix("9:30")).toEqual(["9:30", ""]);
    expect(timeAndSuffix("")).toEqual(["", ""]);
  });

  it("calls a span of 45 minutes or more tall, one under short, and the usual half hour's clock neither", () => {
    expect(TALL_SPAN_MINUTES).toBe(45);
    const at = (hm: string) => new Date(`2026-10-17T${hm}:00-04:00`);
    expect(cardSpanKind(at("10:00"), at("10:45"), true)).toBe("tall");
    expect(cardSpanKind(at("10:00"), at("11:00"), true)).toBe("tall");
    expect(cardSpanKind(at("10:00"), at("10:44"), true)).toBe("short");
    expect(cardSpanKind(at("10:00"), at("10:30"), true)).toBe("short");
    expect(cardSpanKind(at("10:00"), at("10:30"), false)).toBeUndefined();
    expect(cardSpanKind(at("10:00"), null, true)).toBeUndefined();
    expect(cardSpanKind(null, at("10:30"), true)).toBeUndefined();
  });
});

describe("initials from a name", () => {
  it("are the first letter of the first word and of the last, in capitals", () => {
    expect(initialsOf("Ann Lee")).toBe("AL");
    expect(initialsOf("mary ellen noss")).toBe("MN");
    expect(initialsOf("  Cher ")).toBe("C");
    expect(initialsOf("Łukasz Wałęsa")).toBe("ŁW");
    expect(initialsOf("")).toBe("");
  });
});
