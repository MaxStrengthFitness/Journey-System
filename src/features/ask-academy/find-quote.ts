/**
 * Finding a quoted sentence on the Academy page it came from (phase 2; AJ's
 * 2a: the page opens "scrolled to the quote, with the quote highlighted").
 *
 * A quote is copied from the page's plain text (pages.ts), and the page is
 * drawn from the same blocks, so its words are on screen; only the spacing and
 * the bullets differ. So the search is by words: the quote's first words,
 * spaces and punctuation aside, looked for in each element's text, and the
 * smallest element holding them wins (a paragraph, not the whole page).
 */

/** Letters and digits only, lower case, single-spaced: how both sides are compared. */
export function wordsOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The part of a quote to look for: its first line, at most this many words. */
export const NEEDLE_WORDS = 8;

export function needleOf(quote: string): string {
  const firstLine = quote.split(/\n/).map((l) => l.trim()).find((l) => wordsOf(l).length > 0) ?? quote;
  return wordsOf(firstLine).split(" ").slice(0, NEEDLE_WORDS).join(" ");
}

/** The smallest element under `root` whose words hold the quote's first words, or null. */
export function findQuoteElement(root: ParentNode, quote: string): HTMLElement | null {
  const needle = needleOf(quote);
  if (needle.length < 3) return null;
  let best: HTMLElement | null = null;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("p, li, blockquote, td, dd, h3, h4, span, div"))) {
    if (el.closest("[hidden], .lv__stash")) continue;
    const words = wordsOf(el.textContent ?? "");
    if (!words.includes(needle)) continue;
    if (!best || (best.contains(el) && el !== best)) best = el;
  }
  return best;
}
