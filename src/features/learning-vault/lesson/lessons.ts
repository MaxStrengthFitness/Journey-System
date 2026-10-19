/**
 * THE LESSON AROUND A PAGE — which course, which lesson of it, and Check
 * yourself's questions. Lifted from the Interactive Course into the shared
 * parts (the Learning vault redesign, Oct 19 2026: AJ picked the mix, the
 * Codex as the base with the Course's lesson cards), so a reading path can
 * say "Lesson 3 of 10" and a lesson can end on Check yourself.
 *
 * A course is a track (a reading path) or an Academy module. A position in
 * one is where the reader is, never how far they got: nothing is kept
 * (decision 11 of the round).
 *
 * PURE MODULE: no React.
 */

import { dealQuestion, mulberry32, shuffled } from "../quiz/round";
import { calmCaps } from "../pages";
import { routeKey, samePage } from "../routes";
import type { QuizQuestion, Track, VaultRoute } from "../types";
import type { AcademyIndex } from "../../academy/types";
import { hashOf } from "./drills";

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

/** What the course helpers read: the tracks and the Academy's index (VaultData has both). */
export interface CourseData {
  tracks: Track[];
  index: AcademyIndex;
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
export function lessonsOf(course: VaultRoute, data: CourseData): { title: string; lessons: Lesson[] } | null {
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
export function courseContextOf(stack: VaultRoute[], data: CourseData): CourseContext | null {
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

/**
 * The lesson around a page: the course it was opened from, else, for an
 * Academy topic, its own module (every topic is a lesson of its module, so
 * "Next lesson" always has somewhere to go).
 */
export function lessonContextOf(stack: VaultRoute[], data: CourseData): CourseContext | null {
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

/** "Lesson 3 of 10": where a lesson sits in its course, a position, never progress. */
export function lessonPlace(ctx: Pick<CourseContext, "at" | "lessons">): string {
  return `Lesson ${ctx.at + 1} of ${ctx.lessons.length}`;
}

/** The lesson after this one in its course, or null on the last. */
export function nextLessonOf(ctx: Pick<CourseContext, "at" | "lessons"> | null): Lesson | null {
  if (!ctx || ctx.at < 0 || ctx.at >= ctx.lessons.length - 1) return null;
  return ctx.lessons[ctx.at + 1] ?? null;
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
