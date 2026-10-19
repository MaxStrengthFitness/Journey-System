/**
 * DRILLS — "What would you cue?" and an order drill (the packages
 * conversation), lifted from the Interactive Course into the shared parts
 * (the Learning vault redesign, Oct 19 2026: AJ picked the mix, the Codex as
 * the base with the Course's cue drills).
 *
 * A drill asks before it tells: the moment in a set is the prompt, and the
 * Academy's own lines are behind a tap. Nothing is scored or kept. The words
 * are always the page's (the phrasebook's sections, the playbook's lines),
 * found here by shape, so a drill shows a studio's crossed-out line crossed
 * out exactly as the page does. CueDrill.tsx draws them.
 *
 * Also here: a number from a word without storage (hashOf, dayIndex), which
 * the drill of the day and Check yourself's deal both use, so every iPad
 * agrees and nothing is kept.
 *
 * PURE MODULE: no React.
 */

import { cueExamples, cuesForPhase, phaseAt, repModel } from "../rep-phases";
import type { RepShape, VaultPage, VaultSection } from "../types";
import type { CueMoment } from "../../academy/types";

/* ------------------------------------------------------------------ *
 * A number from a word, without storage
 * ------------------------------------------------------------------ */

/** FNV-1a over a string: the same words, the same number, on every iPad. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which of `n` things belongs to a day ("2026-10-19", the studio's day).
 * The same all day, different from one day to the next, nothing stored.
 */
export function dayIndex(dayKey: string, n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return hashOf(`day:${dayKey}`) % Math.floor(n);
}

/* ------------------------------------------------------------------ *
 * Cue drills
 * ------------------------------------------------------------------ */

export interface CueDrill {
  /** The section's place in the page's sections. */
  section: number;
  /** The moment, as the page titles it. */
  title: string;
  /** The machines the phrasebook names for it ("leg press", "chest press"). */
  examples: string[];
  /** Lines the Academy says at this moment (block indexes, kind "cue"). */
  cues: number[];
  /** The moment's own explanations (block indexes, kind "para"). */
  notes: number[];
  /** The phrasebook's index for the moment, when the section says it ("moment-6"). */
  moment: number | null;
}

/** The cue moments of a page: every section with at least `min` lines to say. */
export function cueDrillsIn(sections: VaultSection[], opts?: { min?: number }): CueDrill[] {
  const min = opts?.min ?? 2;
  const out: CueDrill[] = [];
  sections.forEach((s, si) => {
    const cues: number[] = [];
    const notes: number[] = [];
    s.blocks.forEach((b, bi) => {
      if (b.kind === "cue") cues.push(bi);
      else if (b.kind === "para") notes.push(bi);
    });
    if (cues.length < min) return;
    const m = /^moment-(\d+)$/.exec(s.id);
    out.push({
      section: si,
      title: s.title,
      examples: cueExamples(s.note ?? ""),
      cues,
      notes,
      moment: m ? Number(m[1]) : null,
    });
  });
  return out;
}

/**
 * The phrasebook moment a scrubber opens on: the lines it shows before the
 * thumb is moved (its first phase, at the start of the rep). A drill of the
 * day beside a scrubber leaves that moment out, or the answer to "What would
 * you cue?" would already be on screen in the scrubber beside it.
 */
export function scrubberOpeningMoment(cues: readonly CueMoment[] | null | undefined, shape: RepShape): number | null {
  if (!cues || cues.length === 0) return null;
  const opening = cuesForPhase(cues, phaseAt(repModel(shape), 0), shape);
  return opening ? opening.index : null;
}

/** The drills a day can ask: all but `skip`'s moment (never none: with only that one, it stays). */
export function drillsForTheDay(drills: CueDrill[], skip: number | null): CueDrill[] {
  if (skip === null) return drills;
  const kept = drills.filter((d) => d.moment !== skip);
  return kept.length > 0 ? kept : drills;
}

/** "Leg press, chest press, overhead" — the examples as one line, first word capitalised. */
export function examplesLine(examples: string[]): string {
  const line = examples.join(", ").trim();
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : "";
}

/* ------------------------------------------------------------------ *
 * An order drill (the packages conversation, a playbook drill)
 * ------------------------------------------------------------------ */

export interface OrderDrill {
  section: number;
  /** The line that sets it up ("Only when money is truly the problem, and in this order:"). */
  lead: number | null;
  /** The steps, in the page's order (block indexes). */
  steps: number[];
}

/**
 * A playbook section that is a lead-in line and then a list, as a drill:
 * the steps revealed one at a time, in order. "Talking about packages"'
 * "When money is the problem" is the one the Course draws.
 */
export function orderDrillOf(page: Pick<VaultPage, "sections"> | null, sectionId: string): OrderDrill | null {
  if (!page) return null;
  const si = page.sections.findIndex((s) => s.id === sectionId);
  if (si < 0) return null;
  const s = page.sections[si];
  const steps: number[] = [];
  let lead: number | null = null;
  s.blocks.forEach((b, bi) => {
    if (b.kind === "bullet") steps.push(bi);
    else if (lead === null && steps.length === 0 && b.kind === "para") lead = bi;
  });
  return steps.length >= 2 ? { section: si, lead, steps } : null;
}
