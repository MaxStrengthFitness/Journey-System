import { wordsOf } from "./find-quote";

/**
 * Claude's line only repeats the quote under it (most of its words are the
 * quote's): the trainer would read the same sentence twice, so the line is
 * left out and the Academy's words stand alone.
 */
export function repeatsQuote(says: string, quotes: readonly { text: string }[]): boolean {
  const mine = wordsOf(says).split(" ").filter((w) => w.length > 2);
  if (mine.length === 0) return true;
  const theirs = new Set(quotes.flatMap((q) => wordsOf(q.text).split(" ")));
  return mine.filter((w) => theirs.has(w)).length / mine.length >= 0.8;
}
