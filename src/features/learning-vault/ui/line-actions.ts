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

import type { MarkedBlock, OrphanMark, StudioBlockNote, VaultBlockKind, VaultPerson, VaultViewer } from "../types";

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
