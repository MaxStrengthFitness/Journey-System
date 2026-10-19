/**
 * A ROUND — ten questions dealt from a deck, the answers checked, and the
 * one sentence said at the end.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (AJ: "a little game mode in
 * learning").
 *
 * WHY A SEEDED SHUFFLE
 * --------------------
 * A round is dealt from a seed through a tiny PRNG (mulberry32), never
 * Math.random, so the same seed deals the same round: a test can play a
 * round it knows, and the screen passes Date.now() when a person taps Play.
 *
 * WHAT IS NEVER KEPT
 * ------------------
 * Nothing here writes anywhere. A round's answers live in the screen's state
 * until the round is over and are gone when it closes ("Recognition, never
 * ranking": no points, no streaks, no history). `roundSummary` is the end
 * screen's one sentence and its list of what to read again, nothing more.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { QuizAnswer, QuizDeckId, QuizQuestion, QuizRound } from "../types";
import type { QuizItem } from "./decks";

export const ROUND_SIZE = 10;

/** A question as dealt: an order question also carries the jumbled pile the player taps from. */
export interface DealtQuestion extends QuizItem {
  /**
   * Order questions only: the order the items are laid out to be tapped,
   * as indices into `options` (which stay in their CORRECT order). Never the
   * correct order itself, so there is always something to do.
   */
  deal?: number[];
}

export interface DealtRound extends QuizRound {
  questions: DealtQuestion[];
}

/**
 * mulberry32: a 32-bit seeded generator, small enough to read. Returns a
 * function giving floats in [0, 1). Good enough to shuffle ten cards; not
 * for anything that needs to be unguessable.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The next round's seed after this one ("Play again" deals a different round). */
export function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}

/** A seed folded with a word, so two decks played on the same seed differ. */
function seedFor(seed: number, word: string): number {
  let h = (seed >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Fisher-Yates on a copy, driven by `rand`. */
export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

function isIdentity(order: readonly number[]): boolean {
  return order.every((v, i) => v === i);
}

/**
 * One question as dealt. A choice question's options are shuffled and its
 * answer index follows its option; True / False keep their order (a True
 * that moves about is a speed bump, not a game); an order question keeps its
 * options in the correct order and gets a jumbled `deal` to tap from.
 */
export function dealQuestion(q: QuizItem, rand: () => number): DealtQuestion {
  if (q.kind === "order") {
    const idx = q.options.map((_, i) => i);
    let deal = shuffled(idx, rand);
    if (deal.length > 1 && isIdentity(deal)) deal = [...deal.slice(1), deal[0]];
    return { ...q, options: q.options.slice(), deal };
  }
  if (q.kind === "truefalse") return { ...q, options: q.options.slice() };
  const order = shuffled(
    q.options.map((_, i) => i),
    rand,
  );
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    answer: order.indexOf(q.answer),
  };
}

/**
 * Deal a round from the bank.
 *
 * A single deck: its questions, shuffled, the first `size`. The mixed deck
 * ("Quick ten"): the decks take turns, in a shuffled order, so ten questions
 * come from as many decks as there are rather than eight cues and two others
 * (the cue deck alone is the biggest). Either way no two questions in a round
 * test the same `fact`, and a bank smaller than `size` deals all it has.
 */
export function buildRound(
  bank: QuizQuestion[],
  deck: QuizDeckId,
  seed: number,
  size: number = ROUND_SIZE,
): DealtRound {
  const rand = mulberry32(seedFor(seed, deck));
  const want = Math.max(0, Math.floor(size));
  const picked: QuizItem[] = [];
  const facts = new Set<string>();
  const ids = new Set<string>();
  const take = (q: QuizItem): boolean => {
    if (ids.has(q.id)) return false;
    if (q.fact && facts.has(q.fact)) return false;
    ids.add(q.id);
    if (q.fact) facts.add(q.fact);
    picked.push(q);
    return true;
  };

  if (deck === "mixed") {
    const byDeck = new Map<QuizDeckId, QuizItem[]>();
    for (const q of bank as QuizItem[]) {
      if (q.deck === "mixed") continue;
      const list = byDeck.get(q.deck) ?? [];
      list.push(q);
      byDeck.set(q.deck, list);
    }
    // Sorted before shuffling, so the deal depends on the seed, never on the
    // order the bank happened to be built in.
    const piles = shuffled(
      [...byDeck.keys()].sort(),
      rand,
    ).map((d) => shuffled(byDeck.get(d) ?? [], rand));
    let progress = true;
    while (picked.length < want && progress) {
      progress = false;
      for (const pile of piles) {
        if (picked.length >= want) break;
        while (pile.length > 0) {
          const q = pile.shift() as QuizItem;
          if (take(q)) {
            progress = true;
            break;
          }
        }
      }
    }
  } else {
    const pool = (bank as QuizItem[]).filter((q) => q.deck === deck);
    for (const q of shuffled(pool, rand)) {
      if (picked.length >= want) break;
      take(q);
    }
  }

  return { deck, questions: picked.map((q) => dealQuestion(q, rand)) };
}

/**
 * Right or not. A choice or True / False is right when the picked index is
 * the answer. An order question is right when the picked list puts every
 * item in its place: `picked` holds indices into `options`, which are in the
 * correct order, so the right answer is 0, 1, 2…
 */
export function checkAnswer(q: QuizQuestion, picked: number | number[]): boolean {
  if (q.kind === "order") {
    if (!Array.isArray(picked)) return false;
    if (picked.length !== q.options.length) return false;
    return picked.every((v, i) => v === i);
  }
  if (Array.isArray(picked)) return false;
  return picked === q.answer;
}

/**
 * The end of a round: how many were right, out of how many, and the ones to
 * read again, in the order they were asked. A question left unanswered (the
 * round closed early) counts as missed, never as right. Said once on the end
 * screen; nothing keeps it.
 */
export function roundSummary(
  round: QuizRound,
  answers: QuizAnswer[],
): { right: number; total: number; missed: QuizQuestion[] } {
  const byId = new Map<string, QuizAnswer>();
  for (const a of answers) if (!byId.has(a.questionId)) byId.set(a.questionId, a);
  let right = 0;
  const missed: QuizQuestion[] = [];
  for (const q of round.questions) {
    const a = byId.get(q.id);
    if (a && checkAnswer(q, a.picked)) right++;
    else missed.push(q);
  }
  return { right, total: round.questions.length, missed };
}

/** The end screen's sentence: "7 of 10 this round". */
export function roundLine(right: number, total: number): string {
  return `${right} of ${total} this round`;
}
