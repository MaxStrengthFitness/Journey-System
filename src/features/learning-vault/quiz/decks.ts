/**
 * THE QUIZ'S DECKS — what a trainer can pick to play.
 *
 * Round: the Learning vault redesign, Oct 19 2026. AJ's own late ask: "a
 * little game mode in learning where its a quiz mode that just gives
 * information from the academy and even the renaissance of exercise".
 *
 * A deck is a subject, never a level. Nothing here is scored, stored or
 * ranked (CLAUDE.md, "Recognition, never ranking"): a round ends with what
 * was missed and where to read it, and "7 of 10 this round" is said once and
 * kept nowhere. So a deck has a title and one line on what it covers, and no
 * counts, stars, streaks or "mastered" marks to go with it.
 *
 * Each deck's accent is ASSIGNED, the Academy index's own rule (a colour
 * that shifts between visits teaches nothing): a band on the deck's card,
 * never a colour that means right or wrong.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { WikiAccent } from "../../wiki/categories";
import type { QuizDeck, QuizDeckId, QuizQuestion } from "../types";

/**
 * A question as the quiz's own files build it. `fact` names the one thing a
 * question tests, so a round never asks the same thing twice in two shapes
 * (a cue asked one way round and then the other). Optional, and invisible to
 * anyone drawing a plain QuizQuestion.
 */
export interface QuizItem extends QuizQuestion {
  fact?: string;
}

/** In the order the picker shows them: the quick mixed round first. */
export const DECKS: QuizDeck[] = [
  { id: "mixed", title: "Quick ten", blurb: "Ten questions from the method: the Academy and Hutchins' definition." },
  { id: "cues", title: "What would you say?", blurb: "The phrasebook: which cue fits which moment in the set." },
  { id: "rep", title: "The repetition", blurb: "The load up, the pace, the turnarounds and the squeeze." },
  { id: "machines", title: "The machines", blurb: "How each machine begins, what it targets, and what it never does." },
  { id: "glossary", title: "The glossary", blurb: "The Academy's exact words, and what each one means." },
  { id: "method", title: "The method", blurb: "Why one set, why this pace, and what the Academy answers clients." },
  { id: "hutchins", title: "Why we train this way", blurb: "Ken Hutchins' definition of exercise, clause by clause, and what Journey built from it." },
  { id: "playbooks", title: "The floor and the conversation", blurb: "The twenty minutes, renewals, packages, FORD and the progress report." },
];

/** Each deck's band (Learning's category accents). The mixed deck stays neutral. */
export const DECK_ACCENT: Record<QuizDeckId, WikiAccent | null> = {
  mixed: null,
  cues: "hips",
  rep: "push",
  machines: "legs",
  glossary: "posterior",
  method: "trunk",
  hutchins: "other",
  playbooks: "pull",
};

/**
 * The decks "Quick ten" deals from: the METHOD's (judges' fix, Oct 19
 * 2026). Never the playbooks deck: those questions come from Journey's
 * own business notes, drafts head office has not read yet ("Corporate owns
 * the method, so corporate reads it before adopting it"), so a quick round
 * never passes one off as the method. The playbooks deck stays its own
 * choice on the picker.
 */
export const MIXED_DECKS: readonly QuizDeckId[] = ["glossary", "cues", "rep", "machines", "method", "hutchins"];

/** True for a deck "Quick ten" may deal from. */
export function inQuickTen(deck: QuizDeckId): boolean {
  return MIXED_DECKS.includes(deck);
}

const BY_ID = new Map(DECKS.map((d) => [d.id, d]));

export function deckById(id: QuizDeckId): QuizDeck {
  return BY_ID.get(id) ?? DECKS[0];
}

/** True for a string that names a deck (a route's `deck` comes from outside). */
export function isDeckId(v: unknown): v is QuizDeckId {
  return typeof v === "string" && BY_ID.has(v as QuizDeckId);
}

/**
 * The decks a bank can actually deal from, in picker order: a deck with no
 * question in it is left off rather than shown and then found empty. The
 * mixed deck needs questions from at least two of the method's decks
 * (MIXED_DECKS) to be "mixed".
 */
export function playableDecks(bank: readonly QuizQuestion[]): QuizDeck[] {
  const have = new Set(bank.map((q) => q.deck));
  const method = MIXED_DECKS.filter((d) => have.has(d)).length;
  return DECKS.filter((d) => (d.id === "mixed" ? method >= 2 : have.has(d.id)));
}
