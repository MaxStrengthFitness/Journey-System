import { describe, expect, it } from "vitest";
import { blockKeyFor, toVaultBlocks, vaultSection } from "./blocks";
import {
  NOTE_MAX,
  QUOTE_MAX,
  REPLACEMENT_MAX,
  applyMarkup,
  hasMarks,
  makeNote,
  makeStrike,
  noteLine,
  noteProblems,
  strikeLine,
  strikeProblems,
  whyLine,
  withNote,
  withStrike,
  withoutNote,
  withoutStrike,
} from "./markup";
import type { StudioMarkup, VaultBlock } from "./types";

const SAM = { uid: "uid-sam", name: "Sam Lee" };
const JORDAN = { uid: "uid-jordan", name: "Jordan Park" };
const AT = "2026-10-19T14:00:00.000Z";
const BASE = { studioId: "solon", studioName: "Solon", targetKey: "machine:m-leg-press", title: "Leg Press" };

const [abd, barely, crawl] = toVaultBlocks([
  { kind: "line", text: "Consider doing ABD prior to LP to pre-fatigue glutes and improve sensation of glute engagement." },
  { kind: "cue", text: "Barely touch, barely start" },
  { kind: "cue", text: "Crawl" },
]);
const sections = [vaultSection("stop", "Stop", [abd]), vaultSection("rep", "The rep", [barely, crawl])];

function marked(): StudioMarkup {
  let m = withStrike(null, BASE, makeStrike(abd, { reason: "No Abduction on our floor." }, SAM, AT));
  m = withNote(m, BASE, makeNote(barely, "Say it before the plates touch.", JORDAN, AT, "n1"));
  return m;
}

describe("applyMarkup", () => {
  it("shows nothing in the MSF original, whatever the studio marked", () => {
    const out = applyMarkup(sections, marked(), { lens: "original", showCrossed: true });
    expect(out.struck).toBe(0);
    expect(out.notes).toBe(0);
    expect(out.orphans).toEqual([]);
    for (const s of out.sections) {
      for (const b of s.blocks) {
        expect(b.strike).toBeUndefined();
        expect(b.notes).toEqual([]);
        expect(b.hidden).toBe(false);
      }
    }
  });

  it("keeps a crossed-out line on the page by default, struck, with its notes", () => {
    const out = applyMarkup(sections, marked(), { lens: "studio", showCrossed: true });
    const [stop, rep] = out.sections;
    expect(stop.title).toBe("Stop");
    expect(stop.blocks[0].strike?.reason).toBe("No Abduction on our floor.");
    expect(stop.blocks[0].hidden).toBe(false);
    expect(rep.blocks[0].notes.map((n) => n.body)).toEqual(["Say it before the plates touch."]);
    expect(rep.blocks[1]).toEqual({ ...crawl, notes: [], hidden: false });
    expect(out.struck).toBe(1);
    expect(out.notes).toBe(1);
  });

  it("hides a crossed-out line only when the reader asks", () => {
    const out = applyMarkup(sections, marked(), { lens: "studio", showCrossed: false });
    expect(out.sections[0].blocks[0].hidden).toBe(true);
    expect(out.sections[1].blocks.every((b) => !b.hidden)).toBe(true);
  });

  it("is a bare page with no markup at all", () => {
    const out = applyMarkup(sections, null, { lens: "studio", showCrossed: true });
    expect(out.struck).toBe(0);
    expect(out.sections[1].blocks[0]).toEqual({ ...barely, notes: [], hidden: false });
  });

  it("strikes every place the same words appear, and puts a note under the first only", () => {
    const twice = [vaultSection("a", "A", [barely]), vaultSection("b", "B", [{ ...barely, kind: "line" } as VaultBlock])];
    let m = withStrike(null, BASE, makeStrike(barely, { reason: "We say it our way." }, SAM, AT));
    m = withNote(m, BASE, makeNote(barely, "Ours is loud.", JORDAN, AT, "n1"));
    const out = applyMarkup(twice, m, { lens: "studio", showCrossed: true });
    expect(out.sections.map((s) => Boolean(s.blocks[0].strike))).toEqual([true, true]);
    expect(out.sections.map((s) => s.blocks[0].notes.length)).toEqual([1, 0]);
    expect(out.struck).toBe(2);
    expect(out.notes).toBe(1);
  });

  it("hands back a mark whose line is no longer on the page as an orphan, oldest first", () => {
    let m = marked();
    const gone: VaultBlock = { key: blockKeyFor("A line that changed."), kind: "para", text: "A line that changed." };
    m = withStrike(m, BASE, makeStrike(gone, { reason: "Not ours." }, SAM, "2026-10-17T10:00:00.000Z"));
    m = withNote(m, BASE, makeNote(gone, "Old note.", JORDAN, "2026-10-16T10:00:00.000Z", "n-old"));
    const out = applyMarkup(sections, m, { lens: "studio", showCrossed: true });
    expect(out.orphans.map((o) => o.kind)).toEqual(["note", "strike"]);
    expect(out.orphans[1].mark).toMatchObject({ originalText: "A line that changed.", reason: "Not ours." });
    expect(out.struck).toBe(1);
  });

  it("orders a line's notes oldest first", () => {
    let m = withNote(null, BASE, makeNote(barely, "Second.", JORDAN, "2026-10-19T12:00:00.000Z", "n2"));
    m = withNote(m, BASE, makeNote(barely, "First.", SAM, "2026-10-18T12:00:00.000Z", "n1"));
    const out = applyMarkup(sections, m, { lens: "studio", showCrossed: true });
    expect(out.sections[1].blocks[0].notes.map((n) => n.body)).toEqual(["First.", "Second."]);
  });

  it("never writes an undefined key onto a block", () => {
    const out = applyMarkup(sections, marked(), { lens: "studio", showCrossed: true });
    for (const s of out.sections) for (const b of s.blocks) expect(Object.values(b)).not.toContain(undefined);
  });
});

describe("strikeProblems and noteProblems", () => {
  it("needs a reason of 3 to 300 characters, like a safety line coming off a unit", () => {
    expect(strikeProblems({ reason: "" })).toHaveLength(1);
    expect(strikeProblems({ reason: "  x  " })[0]).toMatch(/Say why/);
    expect(strikeProblems({ reason: "Not on our floor." })).toEqual([]);
    expect(strikeProblems({ reason: "x".repeat(300) })).toEqual([]);
    expect(strikeProblems({ reason: "x".repeat(301) })[0]).toMatch(/300 characters/);
  });

  it("lets the replacement be empty, and holds it to its ceiling", () => {
    expect(strikeProblems({ reason: "Not ours.", replacement: "" })).toEqual([]);
    expect(strikeProblems({ reason: "Not ours.", replacement: "y".repeat(REPLACEMENT_MAX + 1) })[0]).toMatch(
      /instead to 300/,
    );
  });

  it("needs words in a note, and no more than the ceiling", () => {
    expect(noteProblems("   ")).toEqual(["Write the note first."]);
    expect(noteProblems("Ours is loud.")).toEqual([]);
    expect(noteProblems("z".repeat(NOTE_MAX + 1))[0]).toMatch(/600 characters/);
  });
});

describe("makeStrike and makeNote", () => {
  it("keeps the words as they read now, trimmed, with who and when", () => {
    const s = makeStrike(abd, { reason: "  No Abduction here.  ", replacement: "  " }, SAM, AT);
    expect(s).toEqual({ blockKey: abd.key, originalText: abd.text, reason: "No Abduction here.", by: SAM, at: AT });
    expect(s).not.toHaveProperty("replacement");
    expect(makeStrike(abd, { reason: "Ours.", replacement: " Our way. " }, SAM, AT).replacement).toBe("Our way.");
  });

  it("quotes at most QUOTE_MAX of the line", () => {
    const long: VaultBlock = { key: "b-00000000", kind: "para", text: "w".repeat(QUOTE_MAX + 50) };
    const n = makeNote(long, " A note. ", JORDAN, AT, "n9");
    expect(n.quote).toHaveLength(QUOTE_MAX);
    expect(n).toMatchObject({ id: "n9", blockKey: "b-00000000", body: "A note.", author: JORDAN, at: AT });
  });
});

describe("with / without (immutable)", () => {
  it("makes a new document, and a second strike on the same line replaces the first", () => {
    const one = withStrike(null, BASE, makeStrike(abd, { reason: "First reason." }, SAM, AT));
    expect(one).toMatchObject({ ...BASE, notes: [] });
    const two = withStrike(one, BASE, makeStrike(abd, { reason: "Second reason." }, SAM, AT));
    expect(two).not.toBe(one);
    expect(one.strikes[0].reason).toBe("First reason.");
    expect(two.strikes.map((s) => s.reason)).toEqual(["Second reason."]);
  });

  it("puts a line back, and hands back the same object when there was nothing to put back", () => {
    const m = marked();
    const back = withoutStrike(m, abd.key);
    expect(back.strikes).toEqual([]);
    expect(m.strikes).toHaveLength(1);
    expect(withoutStrike(back, abd.key)).toBe(back);
  });

  it("adds and removes notes by id", () => {
    const m = marked();
    const more = withNote(m, BASE, makeNote(crawl, "Too short.", SAM, AT, "n2"));
    expect(more.notes.map((n) => n.id)).toEqual(["n1", "n2"]);
    const edited = withNote(more, BASE, makeNote(crawl, "Too short alone.", SAM, AT, "n2"));
    expect(edited.notes.map((n) => n.body)).toEqual(["Say it before the plates touch.", "Too short alone."]);
    expect(withoutNote(edited, "n1").notes.map((n) => n.id)).toEqual(["n2"]);
    expect(withoutNote(edited, "nope")).toBe(edited);
  });

  it("refreshes the names but never what the document belongs to", () => {
    const m = withStrike(marked(), { ...BASE, studioId: "elsewhere", studioName: "Solon East", title: "The Leg Press" }, makeStrike(crawl, { reason: "Ours." }, SAM, AT));
    expect(m.studioId).toBe("solon");
    expect(m.studioName).toBe("Solon East");
    expect(m.title).toBe("The Leg Press");
  });

  it("knows when a document holds nothing", () => {
    expect(hasMarks(null)).toBe(false);
    expect(hasMarks(withoutStrike(withStrike(null, BASE, makeStrike(abd, { reason: "Ours." }, SAM, AT)), abd.key))).toBe(false);
    expect(hasMarks(marked())).toBe(true);
  });
});

describe("the words that credit a mark", () => {
  const s = makeStrike(abd, { reason: "No Abduction on our floor." }, SAM, AT);

  it("says where, who and when", () => {
    expect(strikeLine(s, "Solon")).toBe("Crossed out at Solon by Sam Lee \u00B7 Oct 19, 2026");
    expect(whyLine(s)).toBe("Why: No Abduction on our floor. \u00B7 Sam Lee \u00B7 Oct 19, 2026");
    expect(noteLine(makeNote(barely, "Ours.", JORDAN, AT, "n1"))).toBe("Jordan Park \u00B7 Oct 19, 2026");
  });

  it("leaves out what it does not know, never a dash or 'undefined'", () => {
    expect(strikeLine({ ...s, by: { uid: "u", name: "" }, at: "not a date" }, "")).toBe("Crossed out");
    expect(noteLine({ ...makeNote(barely, "Ours.", JORDAN, AT, "n1"), author: { uid: "u", name: " " } })).toBe("Oct 19, 2026");
  });

  it("dates by the studio's day, not the UTC one", () => {
    // 01:30 UTC on Oct 20 is still Oct 19 in Eastern time.
    expect(noteLine(makeNote(barely, "Late.", JORDAN, "2026-10-20T01:30:00.000Z", "n1"))).toBe("Jordan Park \u00B7 Oct 19, 2026");
  });
});
