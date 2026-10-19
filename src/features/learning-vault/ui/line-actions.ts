/**
 * WHAT A LINE OFFERS, AND HOW ITS MARKS READ — the pure half of the shared
 * page body (ArticleBlocks), the Learning vault redesign, Oct 19 2026.
 *
 * Every design draws a page through ArticleBlocks, so the rules about which
 * line takes which action live here once:
 *
 * - Crossing a line out is a studio leader's (canWriteStudioPages), and only
 *   on the studio's own version: the MSF original is Max Strength's words,
 *   untouched ("Max Strength owns the method; a studio owns its hardware").
 *   A crossed line offers "Put it back" instead.
 * - A note on a line is anyone's who works at the studio
 *   (writesForStudioPerRules), and also only on the studio's version.
 * - "Tell head office" and "Ask in Teams" are everyone's, in either version:
 *   a trainer may question the standard itself (AJ, Oct 16 2026: "Questioning
 *   authority isnt bad"), and a link to a line carries no markup.
 * - Headings are the page's shape, not a line anyone reads out on the floor,
 *   so they take no marks.
 *
 * PURE MODULE — no React, no DOM.
 */

import { markDate } from "../markup";
import type {
  LearningSubmission,
  MarkedBlock,
  OrphanMark,
  StudioBlockNote,
  VaultBlockKind,
  VaultPerson,
  VaultViewer,
} from "../types";

export type LineAction = "strike" | "unstrike" | "note" | "submit" | "share";

/** True for a block a reader can select and mark (everything but the page's headings). */
export function isMarkableKind(kind: VaultBlockKind): boolean {
  return kind !== "heading" && kind !== "subheading";
}

/**
 * The actions a line offers, in the order the row shows them: the studio's
 * own first (cross out or put back, then a note), then head office, then
 * Teams.
 */
export function lineActions(input: {
  /** The studio's version is on screen, and there is a studio to mark it for. */
  studioLens: boolean;
  canStrike: boolean;
  canNote: boolean;
  struck: boolean;
}): LineAction[] {
  const out: LineAction[] = [];
  if (input.studioLens && input.canStrike) out.push(input.struck ? "unstrike" : "strike");
  if (input.studioLens && input.canNote) out.push("note");
  out.push("submit", "share");
  return out;
}

/**
 * A studio's name as it reads inside a sentence. The app says "This studio"
 * when it cannot name one; mid-sentence that is "this studio".
 */
export function studioInSentence(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  if (!t || /^this studio$/i.test(t)) return "this studio";
  return t;
}

/** "Solon's", "James'" (the house rule for a name that ends in s, as versionLabel says it). */
export function possessive(name: string): string {
  const t = name.trim();
  return /s$/i.test(t) ? `${t}'` : `${t}'s`;
}

/** The button's words. The ellipsis says the button asks something before it acts. */
export function actionLabel(action: LineAction, studioName: string): string {
  const studio = studioInSentence(studioName);
  switch (action) {
    case "strike":
      return `Cross out for ${studio}…`;
    case "unstrike":
      return "Put it back";
    case "note":
      return `Note for ${studio}`;
    case "submit":
      return "Tell head office";
    case "share":
      return "Ask in Teams";
  }
}

/** A run of the page in reading order: a line, or crossed-out lines the reader chose to hide. */
export type LinePiece<T> =
  | { kind: "line"; block: T; index: number }
  | { kind: "hidden"; id: string; lines: { block: T; index: number }[] };

/**
 * A section's blocks with each run of hidden lines folded into one piece, so
 * the page says "2 lines hidden" once where they were, rather than once per
 * line or nowhere at all.
 */
export function piecesOf<T extends { hidden: boolean }>(blocks: T[]): LinePiece<T>[] {
  const out: LinePiece<T>[] = [];
  let run: { block: T; index: number }[] = [];
  const flush = () => {
    if (run.length > 0) out.push({ kind: "hidden", id: `hidden-${run[0].index}`, lines: run });
    run = [];
  };
  blocks.forEach((block, index) => {
    if (block.hidden) {
      run.push({ block, index });
      return;
    }
    flush();
    out.push({ kind: "line", block, index });
  });
  flush();
  return out;
}

/** "1 line hidden", "3 lines hidden". */
export function hiddenLabel(n: number): string {
  return n === 1 ? "1 line hidden" : `${n} lines hidden`;
}

/** The same toggle once it has shown them. */
export function hideAgainLabel(n: number): string {
  return n === 1 ? "Hide the crossed-out line" : `Hide the ${n} crossed-out lines`;
}

/** Who a mark is credited to: the Auth uid, and a name ("Someone" in a harness with nobody signed in). */
export function personOf(viewer: Pick<VaultViewer, "uid" | "name">): VaultPerson {
  return { uid: viewer.uid ?? "", name: (viewer.name ?? "").trim() || "Someone" };
}

/**
 * A note comes off its line by its author, or by a leader at the studio (the
 * comments rule: the author or the studio's leaders delete).
 */
export function canRemoveNote(note: StudioBlockNote, viewer: Pick<VaultViewer, "uid" | "canStrike">): boolean {
  if (viewer.canStrike) return true;
  return Boolean(viewer.uid) && note.author?.uid === viewer.uid;
}

/** "1 note", "3 notes". */
export function notesCount(n: number): string {
  return n === 1 ? "1 note" : `${n} notes`;
}

/**
 * What the gutter's marker says to a screen reader (Design 2 draws a glyph
 * and a number there): "Crossed out at Solon, and 2 notes", "1 note from
 * Solon", "Crossed out at Solon".
 */
export function markerLabel(studioName: string, struck: boolean, notes: number): string {
  const studio = studioInSentence(studioName);
  if (struck && notes > 0) return `Crossed out at ${studio}, and ${notesCount(notes)}`;
  if (struck) return `Crossed out at ${studio}`;
  return `${notesCount(notes)} from ${studio}`;
}

/** The words a mark was made on, as they read then. */
export function orphanWords(o: OrphanMark): string {
  return o.kind === "strike" ? o.mark.originalText : o.mark.quote;
}

/** A line that carries any of the studio's marks. */
export function isMarked(block: Pick<MarkedBlock, "strike" | "notes">): boolean {
  return Boolean(block.strike) || block.notes.length > 0;
}

/* ------------------------------------------------------------------ *
 * Labels said once per run (review fix, Oct 19 2026)
 * ------------------------------------------------------------------ */

/** A label or a title as it is compared: lower case, one space, a plural "s" off ("Key cues" is "key cue"). */
function labelKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/s$/, "");
}

/**
 * Which lines of a section draw their label: say it once, at the head of a
 * run of lines that share it ("Clinical warning" over five warnings, never
 * five times). A line the reader cannot see (crossed out and hidden) is
 * skipped, so the first line still shown carries the label; a heading or a
 * line with no label ends the run; a label that only repeats the section's
 * own title ("Key cue" under "Key cues") is never drawn. A line whose label
 * is not drawn still says it to a screen reader (ArticleBlocks keeps it as
 * hidden words), so nothing is lost to someone who cannot see the run.
 *
 * Every design that draws lines its own way (the Course's MarkedLine) asks
 * this, so the three never disagree about when a label shows.
 */
export function labelRuns(
  lines: readonly { kind: VaultBlockKind; label?: string; shown?: boolean }[],
  sectionTitle?: string,
): boolean[] {
  const title = sectionTitle ? labelKey(sectionTitle) : "";
  let last: string | null = null;
  return lines.map((l) => {
    if (!isMarkableKind(l.kind)) {
      last = null;
      return false;
    }
    if (l.shown === false) return false;
    const label = (l.label ?? "").trim();
    if (!label) {
      last = null;
      return false;
    }
    const key = labelKey(label);
    const draw = key !== last && key !== title;
    last = key;
    return draw;
  });
}

/* ------------------------------------------------------------------ *
 * The one quiet hint that a line can be tapped (review fix, Oct 19 2026)
 * ------------------------------------------------------------------ */

const HINT_WORDS: Record<LineAction, string> = {
  strike: "cross it out",
  unstrike: "put it back",
  note: "note it",
  submit: "tell head office",
  share: "ask in Teams",
};

/**
 * What a tap on a line does, for the one hint an iPad gets (there is no
 * hover to find it with): "Tap a line to cross it out, note it, tell head
 * office or ask in Teams." Built from the actions this reader actually has,
 * so it never promises a cross-out to a trainer.
 */
export function lineHintWords(actions: readonly LineAction[]): string {
  const words = actions.map((a) => HINT_WORDS[a]);
  if (words.length === 0) return "Tap a line for what you can do with it.";
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
  return `Tap a line to ${list}.`;
}

/** Where the one hint sits: under a line ("{section}.{block}" indices), or above the page's first section. */
export type HintSpot = { kind: "line"; section: number; index: number } | { kind: "top" };

/**
 * Where the one hint goes (recheck fix, Oct 19 2026). Under the page's first
 * line the reader can see that is NOT in a toned section (a machine's Stop
 * list is the plum caution well: the hint is not a warning, and must not read
 * as one), and never between a label and the lines it is said once over
 * (labelRuns): when that line heads a run ("Primary muscle" over Quadriceps
 * and Gluteus Maximus), the hint waits until the run's last line on screen.
 * A page whose every line is in a well says it above the first section; a
 * page with no line to tap says nothing (null).
 *
 * A run here is what labelRuns draws as one: the same label (as words), with
 * hidden lines skipped and a heading or an unlabelled line ending it.
 */
export function hintSpot(
  sections: readonly {
    id: string;
    blocks: readonly { kind: VaultBlockKind; label?: string; hidden?: boolean }[];
  }[],
): HintSpot | null {
  let anyLine = false;
  for (let si = 0; si < sections.length; si++) {
    const blocks = sections[si].blocks;
    const toned = sectionTone(sections[si].id) !== null;
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      if (!isMarkableKind(b.kind) || b.hidden) continue;
      anyLine = true;
      if (toned) break;
      const label = (b.label ?? "").trim();
      if (!label) return { kind: "line", section: si, index: bi };
      const key = labelKey(label);
      let last = bi;
      for (let j = bi + 1; j < blocks.length; j++) {
        const next = blocks[j];
        if (!isMarkableKind(next.kind)) break;
        if (next.hidden) continue;
        const nextLabel = (next.label ?? "").trim();
        if (!nextLabel || labelKey(nextLabel) !== key) break;
        last = j;
      }
      return { kind: "line", section: si, index: last };
    }
  }
  return anyLine ? { kind: "top" } : null;
}

/* ------------------------------------------------------------------ *
 * Head office's answer, under the line it is about (review fix, Oct 19 2026)
 * ------------------------------------------------------------------ */

export type AnswerVerdict = "waiting" | "taken" | "declined";

/** The submission's state in a word: "Waiting", "Taken", "Not taken". */
export function verdictWord(v: AnswerVerdict): string {
  return v === "taken" ? "Taken" : v === "declined" ? "Not taken" : "Waiting";
}

/**
 * Where a line's "Tell head office" stands, said where the studio reads it
 * (nothing pings anyone, so the answer has to be somewhere to pull): "Kim
 * Ortiz told head office · Oct 19, 2026" then the verdict, and head office's
 * note with who wrote it and when, if there is one.
 */
export function answerOf(sub: Pick<LearningSubmission, "by" | "at" | "status" | "decision">): {
  head: string;
  verdict: AnswerVerdict;
  note: string | null;
  noteBy: string;
} {
  const who = (sub.by?.name ?? "").trim();
  const head = [who ? `${who} told head office` : "Told head office", markDate(sub.at)].filter(Boolean).join(" · ");
  const verdict: AnswerVerdict = sub.status === "taken" ? "taken" : sub.status === "declined" ? "declined" : "waiting";
  const note = verdict !== "waiting" ? (sub.decision?.note ?? "").trim() || null : null;
  const noteBy = sub.decision
    ? [(sub.decision.byName ?? "").trim(), markDate(sub.decision.at)].filter(Boolean).join(" · ")
    : "";
  return { head, verdict, note, noteBy };
}

/* ------------------------------------------------------------------ *
 * A section's tone (review fix, Oct 19 2026)
 * ------------------------------------------------------------------ */

/**
 * A machine's Stop list (codex-reader's leaf "stop": the clinical warnings
 * and the contraindications) is drawn as the house's caution well, plum and
 * never folded, as today's Catalog draws its warnings: these are the lines a
 * trainer must not miss.
 */
export function sectionTone(sectionId: string): "stop" | null {
  return sectionId === "leaf-stop" ? "stop" : null;
}
