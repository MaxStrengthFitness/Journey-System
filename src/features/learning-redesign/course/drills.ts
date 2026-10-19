/**
 * DRILLS — "What would you cue?", the packages conversation, and the lesson
 * around a page (the Interactive Course, the Learning vault redesign, Oct 19
 * 2026).
 *
 * A drill asks before it tells: the moment in a set is the prompt, and the
 * Academy's own lines are behind a tap. Nothing is scored or kept. The words
 * are always the page's (the phrasebook's sections, the playbook's lines),
 * found here by shape, so a drill shows a studio's crossed-out line crossed
 * out exactly as the page does.
 *
 * PURE MODULE: no React.
 */

import { cueExamples, cuesForPhase, phaseAt, repModel } from "../../learning-vault/rep-phases";
import { dealQuestion, mulberry32, shuffled } from "../../learning-vault/quiz/round";
import { calmCaps } from "../../learning-vault/pages";
import { routeKey, samePage } from "../../learning-vault/routes";
import type { QuizQuestion, Track, VaultPage, VaultRoute, VaultSection } from "../../learning-vault/types";
import type { AcademyIndex, CueMoment } from "../../academy/types";
import type { RepShape } from "../../learning-vault/types";

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
 * thumb is moved (its first phase, at the start of the rep). The Overview's
 * drill of the day leaves that moment out, or the answer to "What would you
 * cue?" would already be on screen in the scrubber beside it.
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
 * The packages conversation (a playbook drill)
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
 * "When money is the problem" is the one this design draws.
 */
export function orderDrillOf(page: VaultPage | null, sectionId: string): OrderDrill | null {
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

/* ------------------------------------------------------------------ *
 * The lesson around a page: which course, and which lesson of it
 * ------------------------------------------------------------------ */

export interface Lesson {
  route: VaultRoute;
  title: string;
  why?: string;
}

export interface CourseContext {
  /** The track or module the reader came in by. */
  course: VaultRoute;
  title: string;
  lessons: Lesson[];
  /** This page's place among them. */
  at: number;
}

/** A module's topics, as lessons. */
export function moduleLessons(index: AcademyIndex, moduleId: string): Lesson[] {
  const mod = index.modules.find((m) => m.id === moduleId);
  if (!mod) return [];
  return mod.topics.map((t) => ({
    route: { kind: "topic", moduleId: mod.id, topicId: t.id } as VaultRoute,
    title: calmCaps(t.title),
  }));
}

/** A course's lessons: a track's steps, or a module's topics. */
export function lessonsOf(
  course: VaultRoute,
  data: { tracks: Track[]; index: AcademyIndex },
): { title: string; lessons: Lesson[] } | null {
  if (course.kind === "track") {
    const t = data.tracks.find((x) => x.id === course.id);
    return t ? { title: t.title, lessons: t.steps.map((s) => ({ route: s.route, title: s.title, why: s.why })) } : null;
  }
  if (course.kind === "module") {
    const m = data.index.modules.find((x) => x.id === course.moduleId);
    return m ? { title: m.title, lessons: moduleLessons(data.index, m.id) } : null;
  }
  return null;
}

/** Two lesson routes are one lesson when they open one page (a topic by its id alone). */
export function sameLesson(a: VaultRoute, b: VaultRoute): boolean {
  if (a.kind === "topic" && b.kind === "topic") return a.topicId === b.topicId;
  return samePage(a, b);
}

/**
 * The course the page on top was opened from: the nearest track or module
 * under it in the trail, when this page is one of its lessons. Null when the
 * reader came another way, or wandered off the course's own pages.
 */
export function courseContextOf(
  stack: VaultRoute[],
  data: { tracks: Track[]; index: AcademyIndex },
): CourseContext | null {
  if (stack.length < 2) return null;
  const top = stack[stack.length - 1];
  for (let i = stack.length - 2; i >= 0; i -= 1) {
    const r = stack[i];
    if (r.kind !== "track" && r.kind !== "module") continue;
    const found = lessonsOf(r, data);
    if (!found) return null;
    const at = found.lessons.findIndex((l) => sameLesson(l.route, top));
    return at >= 0 ? { course: r, title: found.title, lessons: found.lessons, at } : null;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Check yourself
 * ------------------------------------------------------------------ */

/**
 * Up to `max` quiz questions whose source is this page, choice and
 * true-or-false only (an order question wants a whole card). Dealt with a
 * seed made from the page, so the same page asks the same questions the
 * same way: nothing is stored, and nothing moves under a reader who comes
 * back to it.
 */
export function checkQuestions(bank: QuizQuestion[] | null, route: VaultRoute, max = 3): QuizQuestion[] {
  if (!bank || max <= 0) return [];
  const mine = bank.filter((q) => q.kind !== "order" && q.source.route && sameLesson(q.source.route, route));
  if (mine.length === 0) return [];
  const rand = mulberry32(hashOf(`check:${routeKey(route)}`));
  return shuffled(mine, rand)
    .slice(0, max)
    .map((q) => dealQuestion(q, rand));
}

/**
 * The lesson around a page: the course it was opened from, else, for an
 * Academy topic, its own module (every topic is a lesson of its module, so
 * "Next lesson" always has somewhere to go).
 */
export function lessonContextOf(
  stack: VaultRoute[],
  data: { tracks: Track[]; index: AcademyIndex },
): CourseContext | null {
  const ctx = courseContextOf(stack, data);
  if (ctx) return ctx;
  const top = stack[stack.length - 1];
  if (!top || top.kind !== "topic") return null;
  const mod = data.index.modules.find((m) => m.topics.some((t) => t.id === top.topicId));
  if (!mod) return null;
  const lessons = moduleLessons(data.index, mod.id);
  const at = lessons.findIndex((l) => sameLesson(l.route, top));
  return at >= 0 ? { course: { kind: "module", moduleId: mod.id }, title: mod.title, lessons, at } : null;
}
