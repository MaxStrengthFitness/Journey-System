import { describe, expect, it } from "vitest";
import type { OrphanMark, StudioBlockNote, StudioStrike } from "../types";
import {
  actionLabel,
  answerOf,
  canRemoveNote,
  hiddenLabel,
  hideAgainLabel,
  isMarkableKind,
  isMarked,
  hintSpot,
  labelRuns,
  lineActions,
  lineHintWords,
  markerLabel,
  notesCount,
  orphanWords,
  personOf,
  piecesOf,
  possessive,
  sectionTone,
  studioInSentence,
  verdictWord,
} from "./line-actions";

const note = (over: Partial<StudioBlockNote> = {}): StudioBlockNote => ({
  id: "n1",
  blockKey: "b-00000001",
  quote: "Move slowly.",
  body: "Ours pauses a beat here.",
  author: { uid: "uid-sam", name: "Sam Lee" },
  at: "2026-10-19T14:00:00.000Z",
  ...over,
});

const strike: StudioStrike = {
  blockKey: "b-00000002",
  originalText: "Pause at the top.",
  reason: "Our unit has no stop",
  by: { uid: "uid-sam", name: "Sam Lee" },
  at: "2026-10-19T14:00:00.000Z",
};

describe("which lines take marks", () => {
  it("every line but the page's headings", () => {
    expect(isMarkableKind("heading")).toBe(false);
    expect(isMarkableKind("subheading")).toBe(false);
    for (const k of ["para", "bullet", "cue", "said", "do", "line"] as const) expect(isMarkableKind(k)).toBe(true);
  });

  it("a line is marked by a strike or a note", () => {
    expect(isMarked({ notes: [] })).toBe(false);
    expect(isMarked({ notes: [note()] })).toBe(true);
    expect(isMarked({ strike, notes: [] })).toBe(true);
  });
});

describe("the actions a line offers", () => {
  it("a leader on the studio's version: cross out, a note, head office, Teams, in that order", () => {
    expect(lineActions({ studioLens: true, canStrike: true, canNote: true, struck: false })).toEqual([
      "strike",
      "note",
      "submit",
      "share",
    ]);
  });

  it("a crossed-out line offers Put it back instead", () => {
    expect(lineActions({ studioLens: true, canStrike: true, canNote: true, struck: true })[0]).toBe("unstrike");
  });

  it("a trainer notes but never crosses out", () => {
    const a = lineActions({ studioLens: true, canStrike: false, canNote: true, struck: true });
    expect(a).toEqual(["note", "submit", "share"]);
  });

  it("the MSF original offers only head office and Teams, to anyone", () => {
    expect(lineActions({ studioLens: false, canStrike: true, canNote: true, struck: false })).toEqual(["submit", "share"]);
    expect(lineActions({ studioLens: false, canStrike: false, canNote: false, struck: false })).toEqual(["submit", "share"]);
  });

  it("says each one in AJ's words, with the studio's name", () => {
    expect(actionLabel("strike", "Solon")).toBe("Cross out for Solon…");
    expect(actionLabel("unstrike", "Solon")).toBe("Put it back");
    expect(actionLabel("note", "Solon")).toBe("Note for Solon");
    expect(actionLabel("submit", "Solon")).toBe("Tell head office");
    expect(actionLabel("share", "Solon")).toBe("Ask in Teams");
  });

  it("a studio it cannot name reads as 'this studio' mid-sentence", () => {
    expect(studioInSentence("This studio")).toBe("this studio");
    expect(studioInSentence("  ")).toBe("this studio");
    expect(studioInSentence(null)).toBe("this studio");
    expect(studioInSentence(" Solon ")).toBe("Solon");
    expect(actionLabel("note", "")).toBe("Note for this studio");
  });

  it("a possessive takes the apostrophe alone after an s", () => {
    expect(possessive("Solon")).toBe("Solon's");
    expect(possessive("James")).toBe("James'");
    expect(possessive("this studio")).toBe("this studio's");
  });
});

describe("hidden crossed-out lines fold into runs", () => {
  const b = (hidden: boolean, n: number) => ({ hidden, n });

  it("one piece per run, where the lines were", () => {
    const pieces = piecesOf([b(false, 0), b(true, 1), b(true, 2), b(false, 3), b(true, 4)]);
    expect(pieces.map((p) => p.kind)).toEqual(["line", "hidden", "line", "hidden"]);
    const first = pieces[1];
    expect(first.kind === "hidden" && first.lines.map((l) => l.index)).toEqual([1, 2]);
    expect(first.kind === "hidden" && first.id).toBe("hidden-1");
    const last = pieces[3];
    expect(last.kind === "hidden" && last.id).toBe("hidden-4");
  });

  it("a page with nothing hidden is every line, in order", () => {
    const pieces = piecesOf([b(false, 0), b(false, 1)]);
    expect(pieces).toEqual([
      { kind: "line", block: b(false, 0), index: 0 },
      { kind: "line", block: b(false, 1), index: 1 },
    ]);
  });

  it("says how many, and the way back", () => {
    expect(hiddenLabel(1)).toBe("1 line hidden");
    expect(hiddenLabel(3)).toBe("3 lines hidden");
    expect(hideAgainLabel(1)).toBe("Hide the crossed-out line");
    expect(hideAgainLabel(2)).toBe("Hide the 2 crossed-out lines");
  });
});

describe("who a mark belongs to", () => {
  it("credits the Auth uid and a name, and never an empty name", () => {
    expect(personOf({ uid: "uid-sam", name: " Sam Lee " })).toEqual({ uid: "uid-sam", name: "Sam Lee" });
    expect(personOf({ uid: null, name: "" })).toEqual({ uid: "", name: "Someone" });
  });

  it("a note comes off by its author or a leader, never a colleague", () => {
    expect(canRemoveNote(note(), { uid: "uid-sam", canStrike: false })).toBe(true);
    expect(canRemoveNote(note(), { uid: "uid-kim", canStrike: false })).toBe(false);
    expect(canRemoveNote(note(), { uid: "uid-kim", canStrike: true })).toBe(true);
    expect(canRemoveNote(note({ author: { uid: "", name: "Someone" } }), { uid: null, canStrike: false })).toBe(false);
  });
});

describe("the gutter's marker, read aloud", () => {
  it("says what is on the line", () => {
    expect(markerLabel("Solon", true, 0)).toBe("Crossed out at Solon");
    expect(markerLabel("Solon", false, 1)).toBe("1 note from Solon");
    expect(markerLabel("Solon", true, 2)).toBe("Crossed out at Solon, and 2 notes");
    expect(notesCount(3)).toBe("3 notes");
  });
});

describe("a mark with no line left", () => {
  it("shows the words it was made on", () => {
    const s: OrphanMark = { kind: "strike", mark: strike };
    const n: OrphanMark = { kind: "note", mark: note() };
    expect(orphanWords(s)).toBe("Pause at the top.");
    expect(orphanWords(n)).toBe("Move slowly.");
  });
});

describe("a label is said once per run (review fix)", () => {
  const line = (label?: string, shown = true) => ({ kind: "line" as const, label, shown });

  it("draws it at the head of a run of lines that share it", () => {
    expect(
      labelRuns([line("Clinical warning"), line("Clinical warning"), line("Clinical warning"), line("Contraindicated for"), line("Contraindicated for")]),
    ).toEqual([true, false, false, true, false]);
  });

  it("skips a line the reader cannot see, so the first one shown carries it", () => {
    expect(labelRuns([line("Clinical warning", false), line("Clinical warning"), line("Clinical warning")])).toEqual([false, true, false]);
  });

  it("starts again after a heading or an unlabelled line", () => {
    expect(
      labelRuns([line("Key cue"), { kind: "heading", label: undefined, shown: true }, line("Key cue"), line(), line("Key cue")]),
    ).toEqual([true, false, true, false, true]);
  });

  it("never draws a label that only repeats the section's title, plural or not", () => {
    expect(labelRuns([line("Key cue"), line("Synergist")], "Key cues")).toEqual([false, true]);
    expect(labelRuns([line("Synergist"), line("Synergist")], "Synergists")).toEqual([false, false]);
  });

  it("compares as words: case and spacing do not start a new run", () => {
    expect(labelRuns([line("Clinical warning"), line("clinical  Warning ")])).toEqual([true, false]);
  });
});

describe("the one hint that a line can be tapped (review fix)", () => {
  it("names what this reader can do, and nothing they cannot", () => {
    expect(lineHintWords(["strike", "note", "submit", "share"])).toBe(
      "Tap a line to cross it out, note it, tell head office or ask in Teams.",
    );
    expect(lineHintWords(["submit", "share"])).toBe("Tap a line to tell head office or ask in Teams.");
    expect(lineHintWords(["share"])).toBe("Tap a line to ask in Teams.");
    expect(lineHintWords([])).toBe("Tap a line for what you can do with it.");
  });
});

describe("where the one hint sits (recheck fix)", () => {
  type B = { kind: "heading" | "line" | "bullet"; label?: string; hidden?: boolean };
  const ln = (label?: string, hidden = false): B => ({ kind: "line", label, hidden });
  const sec = (id: string, ...blocks: B[]) => ({ id, blocks });

  it("goes under the first line outside the Stop well, never inside it", () => {
    expect(hintSpot([sec("leaf-stop", ln("Clinical warning")), sec("leaf-setup", ln(), ln())])).toEqual({
      kind: "line",
      section: 1,
      index: 0,
    });
  });

  it("waits until a label's run ends, so it never splits a label from its lines", () => {
    // "Primary muscle" over Quadriceps and Gluteus Maximus: under Gluteus Maximus.
    expect(
      hintSpot([sec("science", ln("Primary muscle"), ln("Primary muscle"), ln("Synergist"), ln("Synergist"))]),
    ).toEqual({ kind: "line", section: 0, index: 1 });
    // Compared as words, as labelRuns does ("Primary muscles" is the same run).
    expect(hintSpot([sec("s", ln("Primary muscle"), ln("primary  Muscles "), ln())])).toEqual({
      kind: "line",
      section: 0,
      index: 1,
    });
    // A heading or an unlabelled line ends the run.
    expect(hintSpot([sec("s", ln("Cue"), { kind: "heading" }, ln("Cue"))])).toEqual({ kind: "line", section: 0, index: 0 });
    expect(hintSpot([sec("s", ln("Cue"), ln(), ln("Cue"))])).toEqual({ kind: "line", section: 0, index: 0 });
  });

  it("skips lines the reader cannot see, inside a run and before it", () => {
    expect(hintSpot([sec("s", ln("A", true), ln("B"), ln("B", true), ln("B"), ln("C"))])).toEqual({
      kind: "line",
      section: 0,
      index: 3,
    });
    // The run's last line hidden: the last one still on screen.
    expect(hintSpot([sec("s", ln("B"), ln("B"), ln("B", true), ln("C"))])).toEqual({ kind: "line", section: 0, index: 1 });
  });

  it("says it above the first section when every line is in a well, and nothing with no line to tap", () => {
    expect(hintSpot([sec("leaf-stop", ln("Clinical warning"), ln("Clinical warning"))])).toEqual({ kind: "top" });
    expect(hintSpot([sec("s", { kind: "heading" }), sec("t", ln(undefined, true))])).toBeNull();
    expect(hintSpot([])).toBeNull();
  });
});

describe("head office's answer, under its line (review fix)", () => {
  const sub = {
    by: { uid: "uid-kim", name: "Kim Ortiz" },
    at: "2026-10-18T15:00:00.000Z",
    status: "pending" as const,
  };

  it("says who told head office and when, then where it stands", () => {
    expect(answerOf(sub)).toEqual({ head: "Kim Ortiz told head office · Oct 18, 2026", verdict: "waiting", note: null, noteBy: "" });
    expect(verdictWord("waiting")).toBe("Waiting");
    expect(verdictWord("taken")).toBe("Taken");
    expect(verdictWord("declined")).toBe("Not taken");
  });

  it("carries head office's note, and who wrote it, once decided", () => {
    const a = answerOf({
      ...sub,
      status: "declined",
      decision: { note: "  Ours stays.  ", byName: "Pat Head", at: "2026-10-19T14:00:00.000Z" },
    });
    expect(a.verdict).toBe("declined");
    expect(a.note).toBe("Ours stays.");
    expect(a.noteBy).toBe("Pat Head · Oct 19, 2026");
    expect(answerOf({ ...sub, status: "taken", decision: { byName: "Pat Head", at: "2026-10-19T14:00:00.000Z" } }).note).toBeNull();
  });
});

describe("a section's tone (review fix)", () => {
  it("draws only a machine's Stop list as the caution well", () => {
    expect(sectionTone("leaf-stop")).toBe("stop");
    expect(sectionTone("leaf-setup")).toBeNull();
    expect(sectionTone("clinical")).toBeNull();
  });
});
