/**
 * CONCEPT CARDS — where a card sits, and when it goes away.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (Design 2, the Living
 * Vault: "3-level lockable nested concept popovers").
 *
 * A tapped word opens a small card BESIDE the word, not at the bottom of the
 * article. Today's Academy puts the definition after the whole passage
 * (.wk__termcard), and records why: "a popover on an iPad covers the sentence
 * you were reading, and dismissing it is a second decision nobody asked for"
 * (wiki.css). This design answers both halves rather than ignoring them:
 *
 * - IT DOES NOT COVER THE SENTENCE. The card sits under the word, or above it
 *   when there is no room below, never on it unless the screen has no room
 *   either side (a phone in landscape).
 * - DISMISSING IT IS NOT A DECISION. Scroll on, or tap anywhere else, and it
 *   goes. Only a reader who pins it has a card to close.
 *
 * The placement is plain arithmetic, here, so it is tested without a browser;
 * ConceptLayer measures in a layout effect that cannot throw and feeds it.
 *
 * PURE MODULE: no React. Re-exports the entity index, so a design can import
 * every concept name from either file.
 */

export * from "./entities";

/** Space kept clear between a card and the screen's edge. */
export const POPOVER_EDGE = 16;
/** Space between the tapped word and its card. */
export const POPOVER_GAP = 8;
/** The card's width on anything wider than a phone (min(360px, 100vw - 32px)). */
export const POPOVER_MAX_WIDTH = 360;
/**
 * How far the word may move under an open card before the card lets go. A
 * nudge of the page (a finger settling) keeps it, and it follows; a scroll
 * closes it, unless it is pinned.
 */
export const SCROLL_LET_GO = 24;

export interface BoxRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PopoverPlace {
  top: number;
  left: number;
  /** Which side of the word the card sits on: it decides the way it eases in. */
  side: "below" | "above" | "over";
}

/** The card's width for a viewport: 360, or the screen less 16px each side. */
export function popoverWidth(viewportWidth: number): number {
  return Math.max(0, Math.min(POPOVER_MAX_WIDTH, viewportWidth - POPOVER_EDGE * 2));
}

function clamp(value: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Where a card of `size` goes for a word at `anchor` (viewport pixels, as
 * getBoundingClientRect gives them).
 *
 * Below the word when it fits; above when it does not and above does; else
 * on whichever side has more room, pulled back inside the screen ("over").
 * Centred on the word, clamped 16px from either edge.
 */
export function placePopover(
  anchor: BoxRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): PopoverPlace {
  const edge = POPOVER_EDGE;
  const centre = anchor.left + anchor.width / 2;
  const left = clamp(Math.round(centre - size.width / 2), edge, viewport.width - edge - size.width);

  const belowTop = anchor.top + anchor.height + POPOVER_GAP;
  const aboveTop = anchor.top - POPOVER_GAP - size.height;
  if (belowTop + size.height <= viewport.height - edge) return { top: Math.round(belowTop), left, side: "below" };
  if (aboveTop >= edge) return { top: Math.round(aboveTop), left, side: "above" };

  const roomBelow = viewport.height - edge - belowTop;
  const roomAbove = anchor.top - POPOVER_GAP - edge;
  const top =
    roomAbove > roomBelow
      ? clamp(aboveTop, edge, viewport.height - edge - size.height)
      : clamp(belowTop, edge, viewport.height - edge - size.height);
  return { top: Math.round(top), left, side: "over" };
}

/** Has the word moved far enough under the card that the reader has scrolled on? */
export function anchorMoved(before: BoxRect, after: BoxRect, threshold: number = SCROLL_LET_GO): boolean {
  return Math.abs(after.top - before.top) > threshold || Math.abs(after.left - before.left) > threshold;
}

/** Two placements are the same (so a re-measure does not re-render for nothing). */
export function samePlace(a: PopoverPlace | null, b: PopoverPlace | null): boolean {
  if (!a || !b) return a === b;
  return a.top === b.top && a.left === b.left && a.side === b.side;
}
