import { describe, expect, it } from "vitest";
import type { LearningRef } from "../learning/ref";
import {
  LINK_ID_MAX,
  NO_LINK_WORDS,
  SHARE_QUOTE_MAX,
  UNTITLED_WORDS,
  isLinkId,
  learningLinkPath,
  learningLinkUrl,
  parseLearningLink,
  refFromTargetKey,
  shareQuote,
  shareWords,
  targetKeyOf,
  vaultTarget,
} from "./learning-link";
import type { VaultTargetRef } from "./types";

describe("a link's id (the Teams-link branch's rule)", () => {
  it("is letters, digits, - and _ only, at most 64 long", () => {
    expect(isLinkId("a1B2-c3_D4")).toBe(true);
    expect(isLinkId("x".repeat(LINK_ID_MAX))).toBe(true);
    expect(isLinkId("x".repeat(LINK_ID_MAX + 1))).toBe(false);
    expect(isLinkId("")).toBe(false);
    expect(isLinkId(null)).toBe(false);
    expect(isLinkId(42)).toBe(false);
  });

  it("refuses a dot, a slash, a space and anything a URL would encode", () => {
    // The server answers a path ending in ".xxx" with Not found.
    expect(isLinkId("abc.png")).toBe(false);
    expect(isLinkId("abc/def")).toBe(false);
    expect(isLinkId("abc def")).toBe(false);
    expect(isLinkId("abc:def")).toBe(false);
    expect(isLinkId("abc~def")).toBe(false);
  });
});

describe("a page's key", () => {
  it("is learningRefKey for a Learning page and playbook:<id> for a playbook", () => {
    expect(targetKeyOf({ kind: "machine", id: "m-leg-press" })).toBe("machine:m-leg-press");
    expect(targetKeyOf({ kind: "academy-topic", id: "mastery-pace", moduleId: "mastery" })).toBe("academy-topic:mastery-pace");
    expect(targetKeyOf({ kind: "academy-cueing" })).toBe("academy-cueing");
    expect(targetKeyOf({ kind: "academy-glossary" })).toBe("academy-glossary");
    expect(targetKeyOf({ kind: "academy-glossary", id: "Turnaround" })).toBe("academy-glossary:Turnaround");
    expect(targetKeyOf({ kind: "studio-page", id: "abc123", studioId: "solon" })).toBe("studio-page:solon/abc123");
    expect(targetKeyOf({ kind: "playbook", id: "the-floor" })).toBe("playbook:the-floor");
  });

  it("reads back every key it writes (the module is never in the key)", () => {
    const refs: VaultTargetRef[] = [
      { kind: "machine", id: "m-leg-press" },
      { kind: "academy-card", id: "cp" },
      { kind: "academy-script", id: "upper-body-cp" },
      { kind: "academy-overview", id: "chest-press" },
      { kind: "academy-module", id: "summary" },
      { kind: "academy-topic", id: "mastery-pace" },
      { kind: "academy-cueing" },
      { kind: "academy-glossary" },
      { kind: "academy-glossary", id: "Bone Density (Remodeling)" },
      { kind: "studio-page", id: "abc123", studioId: "solon" },
      { kind: "playbook", id: "the-floor" },
    ];
    for (const ref of refs) expect(refFromTargetKey(targetKeyOf(ref))).toEqual(ref);
    expect(refFromTargetKey("academy-topic:mastery-pace")).toEqual({ kind: "academy-topic", id: "mastery-pace" });
  });

  it("refuses a key it did not write", () => {
    expect(refFromTargetKey("")).toBeNull();
    expect(refFromTargetKey("notes:p1")).toBeNull();
    expect(refFromTargetKey("machine")).toBeNull();
    expect(refFromTargetKey("machine:")).toBeNull();
    expect(refFromTargetKey("academy-cueing:x")).toBeNull();
    expect(refFromTargetKey("studio-page:solon")).toBeNull();
    expect(refFromTargetKey("studio-page:/p1")).toBeNull();
    expect(refFromTargetKey("playbook:")).toBeNull();
  });

  it("vaultTarget carries the ref, its key and the title", () => {
    expect(vaultTarget({ kind: "machine", id: "m-leg-press" }, "Leg Press")).toEqual({
      ref: { kind: "machine", id: "m-leg-press" },
      key: "machine:m-leg-press",
      title: "Leg Press",
    });
    expect(vaultTarget({ kind: "playbook", id: "the-floor" }, "The twenty minutes").key).toBe("playbook:the-floor");
  });
});

/**
 * The Teams-link branch's own examples (claude/oct19-teams-link-795436,
 * src/features/deep-link/parse.test.ts), written and read the same way here.
 * If the branch changes its grammar, these are the lines that must change
 * with it.
 */
describe("the link, exactly as the Teams-link branch writes it", () => {
  const cases: { ref: LearningRef; path: string; search?: string }[] = [
    { ref: { kind: "machine", id: "m-leg-press" }, path: "/l/machine~m-leg-press" },
    { ref: { kind: "academy-card", id: "cp" }, path: "/l/academy-card~cp" },
    { ref: { kind: "academy-script", id: "lower-body-abd" }, path: "/l/academy-script~lower-body-abd" },
    { ref: { kind: "academy-overview", id: "abdominals" }, path: "/l/academy-overview~abdominals" },
    { ref: { kind: "academy-module", id: "summary" }, path: "/l/academy-module~summary" },
    { ref: { kind: "academy-topic", id: "hydration" }, path: "/l/academy-topic~hydration" },
    { ref: { kind: "academy-cueing" }, path: "/l/academy-cueing" },
    { ref: { kind: "academy-glossary" }, path: "/l/academy-glossary" },
    { ref: { kind: "academy-glossary", id: "tul" }, path: "/l/academy-glossary~tul" },
    { ref: { kind: "studio-page", id: "p1", studioId: "solon" }, path: "/l/studio-page~p1", search: "?studio=solon" },
  ];

  it("writes each page's link", () => {
    for (const c of cases) expect(learningLinkPath(c.ref)).toBe(c.search ? `${c.path}${c.search}` : c.path);
  });

  it("reads each one back to the same page, with no line", () => {
    for (const c of cases) expect(parseLearningLink(c.path, c.search ?? "")).toEqual({ ref: c.ref, section: null });
  });

  it("leaves a topic's module out of the link (the branch has no field for it)", () => {
    expect(learningLinkPath({ kind: "academy-topic", id: "mastery-pace", moduleId: "mastery" })).toBe(
      "/l/academy-topic~mastery-pace",
    );
  });

  it("reads nothing the branch would refuse", () => {
    expect(parseLearningLink("/l/studio-page~p1")).toBeNull(); // a studio's page needs its studio
    expect(parseLearningLink("/l/machine")).toBeNull(); // a machine needs its id
    expect(parseLearningLink("/l/academy-cueing~x")).toBeNull(); // and the phrasebook has none
    expect(parseLearningLink("/l/notes~p1")).toBeNull();
    expect(parseLearningLink("/l/machine~m.leg")).toBeNull();
    expect(parseLearningLink("/l/")).toBeNull();
    expect(parseLearningLink("/t/abc")).toBeNull(); // a share is the branch's, never a Learning page
    expect(parseLearningLink("/a/req1", "?studio=solon")).toBeNull();
    expect(parseLearningLink("/l/machine~m-leg-press/extra")).toBeNull();
    expect(parseLearningLink("/l/machine~%E2%82")).toBeNull(); // a bad escape
  });

  it("ignores a query key it does not know, as the branch does", () => {
    expect(parseLearningLink("/l/machine~m-leg-press", "?view=trainer-hub")).toEqual({
      ref: { kind: "machine", id: "m-leg-press" },
      section: null,
    });
  });
});

describe("a link to one line (?section=, new in this round)", () => {
  it("adds the line's block key after the page", () => {
    expect(learningLinkPath({ kind: "academy-topic", id: "mastery-pace" }, "b-1a2b3c4d")).toBe(
      "/l/academy-topic~mastery-pace?section=b-1a2b3c4d",
    );
    expect(learningLinkPath({ kind: "academy-cueing" }, "b-00ff00ff")).toBe("/l/academy-cueing?section=b-00ff00ff");
  });

  it("puts a studio's page's studio first", () => {
    expect(learningLinkPath({ kind: "studio-page", id: "p1", studioId: "solon" }, "b-1a2b3c4d")).toBe(
      "/l/studio-page~p1?studio=solon&section=b-1a2b3c4d",
    );
  });

  it("round-trips page and line", () => {
    const refs: LearningRef[] = [
      { kind: "machine", id: "m-leg-press" },
      { kind: "academy-glossary" },
      { kind: "studio-page", id: "p1", studioId: "solon" },
    ];
    for (const ref of refs) {
      const path = learningLinkPath(ref, "b-1a2b3c4d")!;
      const [pathname, search = ""] = path.split("?");
      expect(parseLearningLink(pathname, search ? `?${search}` : "")).toEqual({ ref, section: "b-1a2b3c4d" });
    }
  });

  it("leaves off a section the rule refuses, and still links the page", () => {
    expect(learningLinkPath({ kind: "machine", id: "m-leg-press" }, "b 1a")).toBe("/l/machine~m-leg-press");
    expect(learningLinkPath({ kind: "machine", id: "m-leg-press" }, "")).toBe("/l/machine~m-leg-press");
    expect(parseLearningLink("/l/machine~m-leg-press", "?section=b.1")).toEqual({
      ref: { kind: "machine", id: "m-leg-press" },
      section: null,
    });
  });
});

describe("a page that cannot be carried has no link", () => {
  it("a playbook (a draft with no Learning kind the parser could read back)", () => {
    expect(learningLinkPath({ kind: "playbook", id: "the-floor" })).toBeNull();
    expect(learningLinkPath({ kind: "playbook", id: "the-floor" }, "b-1a2b3c4d")).toBeNull();
  });

  it("a glossary term whose words fail the id rule; the glossary page itself always has one", () => {
    expect(learningLinkPath({ kind: "academy-glossary", id: "Bone Density (Remodeling)" })).toBeNull();
    expect(learningLinkPath({ kind: "academy-glossary", id: "Assumed vs. Real Objective (of exercise)" })).toBeNull();
    expect(learningLinkPath({ kind: "academy-glossary" }, "b-1a2b3c4d")).toBe("/l/academy-glossary?section=b-1a2b3c4d");
  });

  it("an id with a dot or over 64, or a studio id that fails the rule", () => {
    expect(learningLinkPath({ kind: "machine", id: "m.leg" })).toBeNull();
    expect(learningLinkPath({ kind: "machine", id: "x".repeat(65) })).toBeNull();
    expect(learningLinkPath({ kind: "academy-card", id: "has space" })).toBeNull();
    expect(learningLinkPath({ kind: "studio-page", id: "p1", studioId: "so/lon" })).toBeNull();
  });
});

describe("the whole link", () => {
  it("joins the origin without a double slash", () => {
    expect(learningLinkUrl("https://journey.example/", { kind: "machine", id: "m-leg-press" })).toBe(
      "https://journey.example/l/machine~m-leg-press",
    );
    expect(learningLinkUrl("https://journey.example", { kind: "academy-topic", id: "mastery-pace" }, "b-1a2b3c4d")).toBe(
      "https://journey.example/l/academy-topic~mastery-pace?section=b-1a2b3c4d",
    );
    expect(learningLinkUrl("https://journey.example", { kind: "playbook", id: "the-floor" })).toBeNull();
  });
});

describe("the words a person copies or shares", () => {
  const url = "https://journey.example/l/machine~m-leg-press?section=b-1a2b3c4d";

  it("names the page and the section, then the link", () => {
    expect(shareWords({ title: "Leg Press", sectionTitle: "Script & cues", url })).toBe(
      `Leg Press · Script & cues — Open in Journey ${url}`,
    );
  });

  it("quotes the line on its own line, then the question", () => {
    expect(
      shareWords({
        title: "Leg Press",
        sectionTitle: "Script & cues",
        quote: "Keep the load moving.",
        question: "  Does anyone cue this differently?  ",
        url,
      }),
    ).toBe(
      `Leg Press · Script & cues — Open in Journey ${url}\n“Keep the load moving.”\nDoes anyone cue this differently?`,
    );
  });

  it("leaves out a section that repeats the title, and an empty question", () => {
    expect(shareWords({ title: "Glossary", sectionTitle: "glossary", question: "   ", url: "https://j.example/l/academy-glossary" })).toBe(
      "Glossary — Open in Journey https://j.example/l/academy-glossary",
    );
  });

  it("says where to look when there is no link", () => {
    expect(shareWords({ title: "The twenty minutes", sectionTitle: "Before the session", url: null })).toBe(
      `The twenty minutes · Before the session — ${NO_LINK_WORDS}`,
    );
  });

  it("puts a title on one line, whatever whitespace it came with", () => {
    expect(shareWords({ title: "  Leg\n Press ", url: null })).toBe(`Leg Press — ${NO_LINK_WORDS}`);
  });

  it("calls a page with no title what it is", () => {
    expect(shareWords({ title: "  ", url: "https://j.example/l/academy-cueing" })).toBe(
      `${UNTITLED_WORDS} — Open in Journey https://j.example/l/academy-cueing`,
    );
  });

  it("carries no client: the words are the page, the line, the link and the person's own question", () => {
    const words = shareWords({ title: "Leg Press", sectionTitle: "Script & cues", url });
    expect(words).not.toMatch(/client/i);
  });
});

describe("a quoted line", () => {
  it("stays whole when it is short, on one line", () => {
    expect(shareQuote("Keep the\n load moving.")).toBe("Keep the load moving.");
  });

  it("is shortened at a word with an ellipsis when it runs long", () => {
    const long = `${"Slow and smooth through the turnaround ".repeat(8)}end.`;
    const q = shareQuote(long);
    expect(q.length).toBeLessThanOrEqual(SHARE_QUOTE_MAX);
    expect(q.endsWith("…")).toBe(true);
    expect(long.startsWith(q.slice(0, -1))).toBe(true);
    expect(q).not.toMatch(/\s…$/);
  });
});
