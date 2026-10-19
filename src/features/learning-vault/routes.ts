/**
 * ROUTES — where a design can be, and how a stored link gets there.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes).
 *
 * WHY THIS EXISTS
 * ---------------
 * Learning already has ONE link shape that the bell, announcements, comments
 * and search all store: the LearningRef (features/learning/ref.ts). The three
 * prototype designs move around a richer set of places (a quiz deck, a
 * playbook, the map, head office's queue), so they navigate on a VaultRoute
 * (types.ts). This file is the one translation between the two, so a link a
 * trainer saved last month opens the same page in every design, and a page a
 * design shows can always say which link would bring someone back to it.
 *
 * A topic link that no longer finds its module (the Academy corpus was
 * rebuilt and the topic renamed) becomes a topic route with no module. The
 * page builder answers "gone" for it, so the reader is told the page moved,
 * rather than being dropped on an index with no word of what happened —
 * the same promise AcademyWikiView's GonePage makes today.
 *
 * The stack helpers at the foot are useVaultNav's pure half: a stack of
 * routes with a root that never leaves, pushing the page already on top does
 * nothing, and re-opening a page already in the trail cuts the trail back to
 * it (the same rule the concept popovers follow, so a reader bouncing between
 * two pages never grows a breadcrumb twenty crumbs long).
 *
 * PURE MODULE: no React, no Firestore. (ACADEMY_INDEX is the small static
 * index the Learning chunk already carries; no Academy chunk is loaded.)
 */

import { ACADEMY_INDEX } from "../academy/useAcademyContent";
import type { LearningRef } from "../learning/ref";
import type { VaultRoute, VaultTargetRef } from "./types";

/* ------------------------------------------------------------------ *
 * LearningRef <-> VaultRoute
 * ------------------------------------------------------------------ */

/** The module that holds a topic, by the Academy's own index. Null when none does. */
export function moduleOfTopic(topicId: string): string | null {
  for (const mod of ACADEMY_INDEX.modules) {
    if (mod.topics.some((t) => t.id === topicId)) return mod.id;
  }
  return null;
}

/**
 * Where a stored Learning link opens.
 *
 * A topic is placed by the index first and the link's own module second: topic
 * ids are unique across the corpus, so the index is the truth when it knows
 * the topic, and the stored module only helps when it does not. A studio's own
 * page has no vault page yet (the prototypes draw the Academy's corpus), so it
 * opens the Academy, where today's index lists a studio's pages.
 */
export function routeForRef(ref: LearningRef): VaultRoute {
  switch (ref.kind) {
    case "machine":
      return { kind: "machine", id: ref.id };
    case "academy-card":
      return { kind: "card", id: ref.id };
    case "academy-script":
      return { kind: "script", id: ref.id };
    case "academy-overview":
      return { kind: "overview", id: ref.id };
    case "academy-module":
      return { kind: "module", moduleId: ref.id };
    case "academy-topic":
      return {
        kind: "topic",
        moduleId: moduleOfTopic(ref.id) ?? ref.moduleId ?? "",
        topicId: ref.id,
      };
    case "academy-cueing":
      return { kind: "cueing" };
    case "academy-glossary":
      return ref.id ? { kind: "glossary", term: ref.id } : { kind: "glossary" };
    case "studio-page":
      return { kind: "academy" };
  }
}

/**
 * The link that names a page, for markup, sharing and head office's queue.
 * Null for a place that is not one page (the home, an index, the quiz, the
 * map, the queue, a reading path). A glossary route keeps its term, so a link
 * to one term opens on that term; the cueing phrasebook is one page whatever
 * moment is in view (a LearningRef has no moment).
 */
export function refForRoute(route: VaultRoute): VaultTargetRef | null {
  switch (route.kind) {
    case "machine":
      return { kind: "machine", id: route.id };
    case "module":
      return { kind: "academy-module", id: route.moduleId };
    case "topic":
      return route.moduleId
        ? { kind: "academy-topic", id: route.topicId, moduleId: route.moduleId }
        : { kind: "academy-topic", id: route.topicId };
    case "card":
      return { kind: "academy-card", id: route.id };
    case "script":
      return { kind: "academy-script", id: route.id };
    case "overview":
      return { kind: "academy-overview", id: route.id };
    case "glossary":
      return route.term ? { kind: "academy-glossary", id: route.term } : { kind: "academy-glossary" };
    case "cueing":
      return { kind: "academy-cueing" };
    case "playbook":
      return { kind: "playbook", id: route.id };
    case "home":
    case "catalog":
    case "academy":
    case "track":
    case "quiz":
    case "map":
    case "queue":
      return null;
  }
}

/** Where a page's link opens: a playbook, or any Learning link. */
export function routeForTargetRef(ref: VaultTargetRef): VaultRoute {
  if (ref.kind === "playbook") return { kind: "playbook", id: ref.id };
  return routeForRef(ref);
}

/** True for a route that is one page (pageFor can build it). */
export function isPageRoute(route: VaultRoute): boolean {
  return refForRoute(route) !== null;
}

/* ------------------------------------------------------------------ *
 * Keys and sameness
 * ------------------------------------------------------------------ */

/**
 * A stable string for a whole route: a React key, a map key, "is this the
 * same place". Everything that changes what the reader sees is in it,
 * including a machine's tier and a focused term or moment.
 */
export function routeKey(r: VaultRoute): string {
  switch (r.kind) {
    case "home":
    case "catalog":
    case "academy":
    case "queue":
      return r.kind;
    case "machine":
      return r.tier ? `machine:${r.id}#${r.tier}` : `machine:${r.id}`;
    case "module":
      return `module:${r.moduleId}`;
    case "topic":
      return `topic:${r.moduleId}/${r.topicId}`;
    case "card":
    case "script":
    case "overview":
    case "playbook":
    case "track":
      return `${r.kind}:${r.id}`;
    case "glossary":
      return r.term ? `glossary:${r.term}` : "glossary";
    case "cueing":
      return r.moment !== undefined ? `cueing#${r.moment}` : "cueing";
    case "quiz":
      return r.deck ? `quiz:${r.deck}` : "quiz";
    case "map":
      return r.focus ? `map:${r.focus}` : "map";
  }
}

export function sameRoute(a: VaultRoute, b: VaultRoute): boolean {
  return routeKey(a) === routeKey(b);
}

/**
 * The page a route shows, ignoring what is in view on it (a machine's tier,
 * a glossary term, a cue moment). Two routes on one page share it.
 */
export function pageKey(r: VaultRoute): string {
  switch (r.kind) {
    case "machine":
      return `machine:${r.id}`;
    case "glossary":
      return "glossary";
    case "cueing":
      return "cueing";
    default:
      return routeKey(r);
  }
}

export function samePage(a: VaultRoute, b: VaultRoute): boolean {
  return pageKey(a) === pageKey(b);
}

/* ------------------------------------------------------------------ *
 * The stack (useVaultNav's pure half)
 * ------------------------------------------------------------------ */

/** How deep a trail may grow before its oldest pages (never the root) drop off. */
export const STACK_MAX = 40;

/**
 * Open a route on top of the stack. The page already on top: nothing. A page
 * already further down the trail: the trail is cut back to it. Otherwise it
 * goes on top, and past STACK_MAX the oldest page after the root drops off.
 */
export function pushRoute(stack: VaultRoute[], r: VaultRoute, max = STACK_MAX): VaultRoute[] {
  if (stack.length === 0) return [r];
  const at = stack.findIndex((s) => sameRoute(s, r));
  if (at === stack.length - 1) return stack;
  if (at >= 0) return stack.slice(0, at + 1);
  const next = [...stack, r];
  if (next.length <= max) return next;
  return [next[0], ...next.slice(next.length - (Math.max(2, max) - 1))];
}

/** Swap the page on top for another (a tier, a term). The root can be swapped too. */
export function replaceRoute(stack: VaultRoute[], r: VaultRoute): VaultRoute[] {
  if (stack.length === 0) return [r];
  const top = stack[stack.length - 1];
  if (sameRoute(top, r)) return stack;
  const below = stack.slice(0, -1);
  const at = below.findIndex((s) => sameRoute(s, r));
  if (at >= 0) return below.slice(0, at + 1);
  return [...below, r];
}

/** One page back. The root stays. */
export function popRoute(stack: VaultRoute[]): VaultRoute[] {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}
