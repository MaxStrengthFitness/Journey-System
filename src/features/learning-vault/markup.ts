/**
 * A STUDIO'S VERSION OF A PAGE — crossed-out lines and notes, Oct 19 2026.
 *
 * The round's brief (AJ's overnight ask): a studio's own version of a page,
 * with lines crossed out with a reason and notes on lines, and the MSF
 * original one tap away. This is the pure half: how a studio's markup lays
 * onto a page, what a strike and a note must say before they can be made,
 * and the words that credit them.
 *
 * THE RULES IT HOLDS (decisions made for the round, see the build contract)
 * --------------------------------------------------------------------------
 * - The baseline is always still there. A crossed-out line STAYS on the page,
 *   struck, with its reason, who and when, exactly as a safety line taken off
 *   a studio's unit does on the Catalog (AJ, Oct 2 2026: "Just cross it out
 *   or make it faded"). Hiding crossed-out lines is the reader's opt-in
 *   (`showCrossed: false`), never the default.
 * - The MSF original lens shows NO markup at all: it is Max Strength's words,
 *   untouched ("Max Strength owns the method; a studio owns its hardware").
 * - A line comes out only with a reason, the same 3 to 300 characters a
 *   safety line needs to come off a unit (reasonIsEnough,
 *   lib/machine-template.ts). The reason is what head office reads when it
 *   sees how many studios crossed out the same line.
 * - Marks are keyed by the line's WORDS (blocks.ts). A mark whose line is no
 *   longer on the page is an orphan, handed back so the page can say "this
 *   line has changed since Solon marked it" instead of losing it or moving
 *   it onto a different sentence.
 *
 * PURE MODULE — no React, no Firestore. Nothing here writes anything: every
 * change returns a new object (the sandbox store re-renders on identity).
 */

import { MAX_REMOVAL_REASON, reasonIsEnough } from "../../lib/machine-template";
import { MIN_REMOVAL_REASON } from "../../lib/resolve-machine";
import { clipText } from "../../lib/clip-text";
import { formatStudioDate, getActiveTimeZone } from "../../lib/studio-time";
import type {
  MarkedBlock,
  MarkupLens,
  OrphanMark,
  StudioBlockNote,
  StudioMarkup,
  StudioStrike,
  VaultBlock,
  VaultPerson,
  VaultSection,
} from "./types";

/** The longest note on a line. */
export const NOTE_MAX = 600;
/** The most of a line a note or a submission keeps as its quote. */
export const QUOTE_MAX = 400;
/** The longest "what {Studio} does instead" (the same ceiling as the reason). */
export const REPLACEMENT_MAX = 300;

/** Which page a markup document belongs to, and whose it is. */
export interface MarkupBase {
  studioId: string;
  studioName: string;
  targetKey: string;
  title: string;
}

export interface AppliedMarkup {
  sections: (Omit<VaultSection, "blocks"> & { blocks: MarkedBlock[] })[];
  /** Marks whose line is no longer on the page (its words changed, or it moved away). */
  orphans: OrphanMark[];
  /** Lines on this page that carry a strike (each occurrence counted: what "Hide" hides). */
  struck: number;
  /** Notes placed on a line of this page. */
  notes: number;
}

const byTime = <T extends { at: string }>(a: T, b: T): number =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : 0;

/**
 * Lay one studio's markup onto a page.
 *
 * Original lens: every line bare, no orphans, nothing counted.
 * Studio lens: a struck line carries its strike (every place the same words
 * appear: the studio crossed out the words); a note sits under the FIRST
 * place its line appears, so a line said twice on a page does not show the
 * same note twice; `hidden` is true only for a struck line when the reader
 * chose to hide crossed-out lines.
 */
export function applyMarkup(
  sections: VaultSection[],
  markup: StudioMarkup | null,
  opts: { lens: MarkupLens; showCrossed: boolean },
): AppliedMarkup {
  const bare = (b: VaultBlock): MarkedBlock => ({ ...b, notes: [], hidden: false });
  if (opts.lens !== "studio" || !markup) {
    return {
      sections: sections.map((s) => ({ ...s, blocks: s.blocks.map(bare) })),
      orphans: [],
      struck: 0,
      notes: 0,
    };
  }

  const strikes = new Map<string, StudioStrike>();
  for (const s of markup.strikes ?? []) if (s && s.blockKey) strikes.set(s.blockKey, s);
  const notesByKey = new Map<string, StudioBlockNote[]>();
  for (const n of [...(markup.notes ?? [])].sort(byTime)) {
    if (!n || !n.blockKey) continue;
    notesByKey.set(n.blockKey, [...(notesByKey.get(n.blockKey) ?? []), n]);
  }

  const onPage = new Set<string>();
  const notesPlaced = new Set<string>();
  let struck = 0;
  let notes = 0;

  const marked = sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((b): MarkedBlock => {
      onPage.add(b.key);
      const strike = strikes.get(b.key);
      let blockNotes: StudioBlockNote[] = [];
      if (!notesPlaced.has(b.key)) {
        notesPlaced.add(b.key);
        blockNotes = notesByKey.get(b.key) ?? [];
        notes += blockNotes.length;
      }
      if (strike) struck += 1;
      const out: MarkedBlock = { ...b, notes: blockNotes, hidden: Boolean(strike) && !opts.showCrossed };
      if (strike) out.strike = strike;
      return out;
    }),
  }));

  const orphans: OrphanMark[] = [
    ...[...strikes.values()].filter((s) => !onPage.has(s.blockKey)).map((mark) => ({ kind: "strike" as const, mark })),
    ...[...notesByKey.values()].flat().filter((n) => !onPage.has(n.blockKey)).map((mark) => ({ kind: "note" as const, mark })),
  ].sort((a, b) => byTime(a.mark, b.mark));

  return { sections: marked, orphans, struck, notes };
}

/**
 * What stops a strike being made, in words a leader can act on. Empty when
 * it can be made. The reason is required (3 to 300, like a safety line
 * coming off a unit); what the studio does instead is optional.
 */
export function strikeProblems(input: { reason: string; replacement?: string }): string[] {
  const out: string[] = [];
  const reason = (input.reason ?? "").trim();
  if (!reasonIsEnough(reason)) {
    out.push(
      reason.length < MIN_REMOVAL_REASON
        ? "Say why, in a few words. Head office reads the reason."
        : `Keep the reason to ${MAX_REMOVAL_REASON} characters.`,
    );
  }
  if ((input.replacement ?? "").trim().length > REPLACEMENT_MAX) {
    out.push(`Keep what you do instead to ${REPLACEMENT_MAX} characters.`);
  }
  return out;
}

/** What stops a note being saved. Empty when it can be. */
export function noteProblems(body: string): string[] {
  const t = (body ?? "").trim();
  if (!t) return ["Write the note first."];
  if (t.length > NOTE_MAX) return [`Keep the note to ${NOTE_MAX} characters.`];
  return [];
}

const person = (p: VaultPerson): VaultPerson => ({ uid: p.uid, name: (p.name ?? "").trim() });

/**
 * A strike on one line. The words are kept as they read now, so a line that
 * later changes can say so. The reason and the replacement are trimmed and
 * held to their ceilings; an empty replacement is left off (never undefined).
 */
export function makeStrike(
  block: VaultBlock,
  input: { reason: string; replacement?: string },
  by: VaultPerson,
  nowIso: string,
): StudioStrike {
  const strike: StudioStrike = {
    blockKey: block.key,
    originalText: block.text,
    reason: clipText((input.reason ?? "").trim(), MAX_REMOVAL_REASON),
    by: person(by),
    at: nowIso,
  };
  const replacement = clipText((input.replacement ?? "").trim(), REPLACEMENT_MAX);
  if (replacement) strike.replacement = replacement;
  return strike;
}

/** A note on one line, quoting the line as it reads now (at most QUOTE_MAX). */
export function makeNote(
  block: VaultBlock,
  body: string,
  author: VaultPerson,
  nowIso: string,
  id: string,
): StudioBlockNote {
  return {
    id,
    blockKey: block.key,
    quote: clipText(block.text, QUOTE_MAX),
    body: clipText((body ?? "").trim(), NOTE_MAX),
    author: person(author),
    at: nowIso,
  };
}

function startFrom(markup: StudioMarkup | null, base: MarkupBase): StudioMarkup {
  if (!markup) {
    return {
      studioId: base.studioId,
      studioName: base.studioName,
      targetKey: base.targetKey,
      title: base.title,
      strikes: [],
      notes: [],
    };
  }
  // The names are refreshed (a page title or a studio's name can change);
  // what the document belongs to is not.
  return {
    ...markup,
    studioName: base.studioName || markup.studioName,
    title: base.title || markup.title,
  };
}

/** The markup with this strike on (a second strike on the same line replaces the first). */
export function withStrike(markup: StudioMarkup | null, base: MarkupBase, strike: StudioStrike): StudioMarkup {
  const start = startFrom(markup, base);
  const has = start.strikes.some((s) => s.blockKey === strike.blockKey);
  return {
    ...start,
    strikes: has ? start.strikes.map((s) => (s.blockKey === strike.blockKey ? strike : s)) : [...start.strikes, strike],
  };
}

/** The markup with this line put back. The same object when the line was not crossed out. */
export function withoutStrike(markup: StudioMarkup, blockKey: string): StudioMarkup {
  if (!markup.strikes.some((s) => s.blockKey === blockKey)) return markup;
  return { ...markup, strikes: markup.strikes.filter((s) => s.blockKey !== blockKey) };
}

/** The markup with this note added (a note with the same id replaces it). */
export function withNote(markup: StudioMarkup | null, base: MarkupBase, note: StudioBlockNote): StudioMarkup {
  const start = startFrom(markup, base);
  const has = start.notes.some((n) => n.id === note.id);
  return {
    ...start,
    notes: has ? start.notes.map((n) => (n.id === note.id ? note : n)) : [...start.notes, note],
  };
}

/** The markup without this note. The same object when there was no such note. */
export function withoutNote(markup: StudioMarkup, noteId: string): StudioMarkup {
  if (!markup.notes.some((n) => n.id === noteId)) return markup;
  return { ...markup, notes: markup.notes.filter((n) => n.id !== noteId) };
}

/** True when a markup document still holds anything. */
export function hasMarks(markup: StudioMarkup | null | undefined): boolean {
  return Boolean(markup && ((markup.strikes?.length ?? 0) > 0 || (markup.notes?.length ?? 0) > 0));
}

/** "Oct 19, 2026", in the studio's day. One constant options object (Intl is costly per call). */
const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/** A mark's date in words, or "" when it has none worth saying. */
export function markDate(at: string): string {
  return formatStudioDate(at, DAY, getActiveTimeZone(), "");
}

const joinDot = (parts: string[]): string => parts.filter(Boolean).join(" \u00B7 ");

/** "Crossed out at Solon by Sam Lee · Oct 19, 2026". */
export function strikeLine(strike: StudioStrike, studioName: string): string {
  const where = (studioName ?? "").trim();
  const who = (strike.by?.name ?? "").trim();
  const head = `Crossed out${where ? ` at ${where}` : ""}${who ? ` by ${who}` : ""}`;
  return joinDot([head, markDate(strike.at)]);
}

/** "Why: No Abduction on our floor · Sam Lee · Oct 19, 2026" (the line under a crossed-out line). */
export function whyLine(strike: StudioStrike): string {
  return joinDot([`Why: ${strike.reason.trim()}`, (strike.by?.name ?? "").trim(), markDate(strike.at)]);
}

/** "Sam Lee · Oct 19, 2026". */
export function noteLine(note: StudioBlockNote): string {
  return joinDot([(note.author?.name ?? "").trim(), markDate(note.at)]);
}
