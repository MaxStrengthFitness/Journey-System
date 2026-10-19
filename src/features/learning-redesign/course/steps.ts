/**
 * STEP CARDS — a long page cut into short cards you step through.
 *
 * The Interactive Course (the Learning vault redesign, Oct 19 2026). An
 * Academy topic runs to 6,400 words and a playbook to a dozen sections; on a
 * portrait iPad between clients that is a wall. The course shows it as cards
 * of roughly 80 to 160 words (a card fits a portrait iPad above its Next),
 * one at a time, with Back and Next.
 *
 * WHAT IT NEVER DOES
 * ------------------
 * - Reword. A card holds whole lines (VaultBlocks) exactly as the page has
 *   them, so a studio's crossed-out line or note sits on the same words in a
 *   card as in "Read it all" (a mark hangs on the block's key, made from its
 *   words). A line longer than a card is a card of its own; it is never cut.
 * - Lose or repeat a line. Every block of every section lands on exactly one
 *   card, in reading order (steps.test.ts holds it).
 * - End a card on a heading. A heading belongs to what follows it, so a
 *   heading that would close a card moves to the next one.
 *
 * WHERE IT BREAKS
 * ---------------
 * At a section boundary or a heading once the card has its minimum; before a
 * line that would carry it past the maximum. A section shorter than the
 * minimum shares a card with the next one (each keeps its own title), and a
 * last card of a few words joins the one before it.
 *
 * PURE MODULE: no React.
 */

import type { VaultBlock, VaultSection } from "../../learning-vault/types";

export const STEP_MIN_WORDS = 80;
export const STEP_MAX_WORDS = 160;

/** One section's run of lines on a card. */
export interface StepPart {
  /** The section's place in the page's sections. */
  section: number;
  /** The section's title ("" for a page's untitled opening run). */
  title: string;
  /** True when the section began on an earlier card. */
  continued: boolean;
  /** The lines, by their place in the section, in reading order. */
  blocks: number[];
}

export interface StepCard {
  parts: StepPart[];
  words: number;
}

/** Words in a passage, as a reader counts them. */
export function wordsIn(text: string): number {
  const t = typeof text === "string" ? text.trim() : "";
  return t ? t.split(/\s+/).length : 0;
}

function isHead(b: VaultBlock): boolean {
  return b.kind === "heading" || b.kind === "subheading";
}

function bodyWords(card: StepCard, sections: VaultSection[]): number {
  let n = 0;
  for (const p of card.parts) {
    for (const bi of p.blocks) {
      const b = sections[p.section]?.blocks[bi];
      if (b && !isHead(b)) n += wordsIn(b.text);
    }
  }
  return n;
}

function addTo(card: StepCard, section: VaultSection, si: number, bi: number, words: number): void {
  const last = card.parts[card.parts.length - 1];
  if (last && last.section === si) last.blocks.push(bi);
  else card.parts.push({ section: si, title: section.title, continued: bi > 0, blocks: [bi] });
  card.words += words;
}

/** Take the headings that end a card off it, to open the next one. */
function trailingHeads(card: StepCard, sections: VaultSection[]): { si: number; bi: number }[] {
  const out: { si: number; bi: number }[] = [];
  while (card.parts.length > 0) {
    const last = card.parts[card.parts.length - 1];
    const bi = last.blocks[last.blocks.length - 1];
    const b = sections[last.section]?.blocks[bi];
    if (!b || !isHead(b)) break;
    // Never strip a card down to nothing: a card of headings alone keeps them.
    const total = card.parts.reduce((n, p) => n + p.blocks.length, 0);
    if (total <= 1) break;
    last.blocks.pop();
    card.words -= wordsIn(b.text);
    if (last.blocks.length === 0) card.parts.pop();
    out.unshift({ si: last.section, bi });
  }
  return out;
}

function mergeInto(into: StepCard, from: StepCard): void {
  for (const p of from.parts) {
    const last = into.parts[into.parts.length - 1];
    if (last && last.section === p.section) last.blocks.push(...p.blocks);
    else into.parts.push({ ...p, blocks: [...p.blocks] });
  }
  into.words += from.words;
}

/**
 * A page's sections as step cards. Sections with no lines (an empty tier's
 * honest note) give no card; a page with no lines at all gives none.
 */
export function chunkSteps(
  sections: VaultSection[],
  opts?: { min?: number; max?: number },
): StepCard[] {
  const min = Math.max(1, opts?.min ?? STEP_MIN_WORDS);
  const max = Math.max(min, opts?.max ?? STEP_MAX_WORDS);
  const cards: StepCard[] = [];
  let cur: StepCard | null = null;

  const open = (): StepCard => {
    const c: StepCard = { parts: [], words: 0 };
    cards.push(c);
    return c;
  };

  sections.forEach((section, si) => {
    section.blocks.forEach((block, bi) => {
      const words = wordsIn(block.text);
      const head = isHead(block);
      if (cur && cur.parts.length > 0) {
        const atBreak = bi === 0 || head;
        const full = cur.words >= min && atBreak;
        const over = bodyWords(cur, sections) > 0 && cur.words + words > max;
        if (full || over) {
          const carry = trailingHeads(cur, sections);
          cur = open();
          for (const c of carry) {
            const b = sections[c.si].blocks[c.bi];
            addTo(cur, sections[c.si], c.si, c.bi, wordsIn(b.text));
          }
        }
      }
      if (!cur) cur = open();
      addTo(cur, section, si, bi, words);
    });
  });

  // A last card of a few words reads as an afterthought: it joins the one before.
  if (cards.length > 1) {
    const last = cards[cards.length - 1];
    const prev = cards[cards.length - 2];
    if (last.words < min / 3 && prev.words + last.words <= max + min / 2) {
      mergeInto(prev, last);
      cards.pop();
    }
  }
  return cards.filter((c) => c.parts.length > 0);
}

/**
 * The first card holding a line whose words name `label` (a dial's name on
 * the field manual: "Shoulder Pads" finds the line that sets them). Whole
 * words, any case; -1 when no card names it.
 */
export function cardNaming(cards: StepCard[], sections: VaultSection[], label: string): number {
  const words = (label ?? "").trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return -1;
  const pattern = new RegExp(`(^|[^a-z0-9])${words.join("[^a-z0-9]+")}($|[^a-z0-9])`, "i");
  for (let i = 0; i < cards.length; i += 1) {
    for (const p of cards[i].parts) {
      for (const bi of p.blocks) {
        const b = sections[p.section]?.blocks[bi];
        if (!b) continue;
        if (pattern.test(b.text) || (b.label ? pattern.test(b.label) : false)) return i;
      }
    }
  }
  return -1;
}
