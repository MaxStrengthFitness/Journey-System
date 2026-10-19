/**
 * THE TACTICAL CODEX — the design's pure half (the Learning vault redesign,
 * Oct 19 2026; Design 1).
 *
 * The Codex lays the vault's shared pages out as a strategy game's
 * encyclopedia lays out its entries: every page in layers, the first one
 * what you need standing at the machine, each deeper one a tap. The words,
 * the markup and the links are the vault's (features/learning-vault); what
 * lives here is only what this layout decides, so a test can hold it:
 *
 *   - which masthead section starts which trail, and where a link lands
 *     when its page is already in the trail (a machine keeps the tier the
 *     reader left it on);
 *   - a topic's tiers, made honestly from the topic's own lines: "In one
 *     minute" is its headings and the first line under each (nothing
 *     written for it), "Say it" the phrasebook moments that use the topic's
 *     own words (from the knowledge graph), "Full text" every line. A tier
 *     that would be empty, or would only repeat the full text, is left out;
 *   - the home page's paths: the three role paths first, then the pillar
 *     paths, each a real reading list (playbooks/tracks.ts);
 *   - the floor in walking order with each machine's category band;
 *   - the bento's facts, without the two the bento draws itself.
 *
 * PURE MODULE: no React, no Firestore.
 */

import type { LearningViewId } from "../../learning/LearningView";
import { floorUnreadableFor } from "../../learning-vault/pages";
import { moduleOfTopic, routeKey, samePage } from "../../learning-vault/routes";
import type {
  Track,
  VaultFact,
  VaultGraph,
  VaultPage,
  VaultRoute,
  VaultSection,
} from "../../learning-vault/types";
import type { VaultData } from "../../learning-vault/useVaultData";
import { CATEGORY_LABEL, MACHINE_CATEGORY } from "../../routine-builder/academy";
import { accentForAcademyCategory, type WikiAccent } from "../../wiki/categories";

/* ------------------------------------------------------------------ *
 * Sections and trails
 * ------------------------------------------------------------------ */

/** The page each masthead section opens on. */
export function rootForSection(section: LearningViewId): VaultRoute {
  if (section === "machine-anatomy") return { kind: "catalog" };
  if (section === "academy") return { kind: "academy" };
  return { kind: "home" };
}

/**
 * Where a link lands. A machine opened with no tier, while that machine's
 * page is already in the trail, goes back to the page as the reader left
 * it (its tier too), so a crumb or a related link never loses their place.
 * Every other route lands as given.
 */
export function resolveOpen(stack: readonly VaultRoute[], route: VaultRoute): VaultRoute {
  if (route.kind === "machine" && !route.tier) {
    const there = stack.find((r) => r.kind === "machine" && samePage(r, route));
    if (there) return there;
  }
  return route;
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/** A machine's band colour: its Academy category, else the neutral. */
export function machineAccent(machineId: string): WikiAccent {
  return accentForAcademyCategory(MACHINE_CATEGORY[machineId] ?? null);
}

/** "Lower Body", or null for a machine the Academy does not categorise. */
export function machineCategory(machineId: string): string | null {
  const c = MACHINE_CATEGORY[machineId];
  return c ? CATEGORY_LABEL[c] : null;
}

/* ------------------------------------------------------------------ *
 * The floor
 * ------------------------------------------------------------------ */

export interface FloorTile {
  id: string;
  name: string;
  code: string | null;
  /** Its place in the walking order, from 1. */
  order: number;
  accent: WikiAccent;
  category: string | null;
}

/** The studio's floor as codex entries, in its walking order. */
export function floorTiles(floor: readonly { id: string; name: string; code: string | null }[] | null): FloorTile[] {
  if (!floor) return [];
  return floor.map((m, i) => ({
    id: m.id,
    name: (m.name ?? "").trim() || m.id,
    code: m.code,
    order: i + 1,
    accent: machineAccent(m.id),
    category: machineCategory(m.id),
  }));
}

/** "01", "12": a walking-order number, two figures so a column of them lines up. */
export function orderLabel(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The MSF machines this floor does not have, in the Academy's order. */
export function offFloor<T extends { machineId: string }>(
  machines: readonly T[],
  floor: readonly { id: string }[] | null,
): T[] {
  if (!floor) return [];
  const here = new Set(floor.map((f) => f.id));
  return machines.filter((m) => !here.has(m.machineId));
}

/**
 * What the Catalog lists under the studio's floor. A read floor: the MSF
 * machines it does not have. A floor that could not be read ("unreadable"
 * is final) or has nothing on it: EVERY MSF machine, so the Catalog is never
 * a dead end. While the floor is still being read: nothing yet (the list
 * would only jump when the floor lands).
 */
export function otherMachines<T extends { machineId: string }>(
  machines: readonly T[],
  floor: readonly { id: string }[] | null,
  floorState?: string,
): { every: boolean; machines: T[] } {
  if (floor === null) return floorState === "unreadable" ? { every: true, machines: [...machines] } : { every: false, machines: [] };
  if (floor.length === 0) return { every: true, machines: [...machines] };
  return { every: false, machines: offFloor(machines, floor) };
}

/* ------------------------------------------------------------------ *
 * A page that is not here yet
 * ------------------------------------------------------------------ */

/**
 * Why a page answered "loading", so a design never spins for something that
 * will not come on its own: a studio's own machine on a floor that could
 * not be read ("floor"); a topic whose module chunk failed ("module", with
 * its id, for data.retryModule); a page waiting on a reference chunk that
 * failed ("reference", for data.retryReference); else it is on its way.
 */
export type WaitState =
  | { kind: "loading" }
  | { kind: "floor" }
  | { kind: "module"; moduleId: string }
  | { kind: "reference" };

export function waitState(
  route: VaultRoute,
  data: Pick<VaultData, "defs" | "floor" | "floorState" | "moduleFailed" | "referenceFailed">,
): WaitState {
  if (floorUnreadableFor(route, data)) return { kind: "floor" };
  if (route.kind === "topic") {
    // A topic waits on its module's prose, and on nothing else.
    const mod = moduleOfTopic(route.topicId) ?? route.moduleId;
    return mod && data.moduleFailed(mod) ? { kind: "module", moduleId: mod } : { kind: "loading" };
  }
  // A studio's own machine waits on the floor alone (it has no Academy pages).
  if (route.kind === "machine" && !data.defs[route.id]) return { kind: "loading" };
  return data.referenceFailed ? { kind: "reference" } : { kind: "loading" };
}

/* ------------------------------------------------------------------ *
 * The machine's bento
 * ------------------------------------------------------------------ */

/**
 * The facts the bento lists in words. The code and the category are the
 * page's eyebrow, the preset is the dial strip and the Academy's pieces are
 * their own doors, so none of them is said twice. The workout goes too when
 * the category already says it ("Lower Body" over "Workout: Lower Body",
 * "Upper Body — Pull" over "Workout: Upper Body").
 */
export function bentoFacts(
  facts: readonly VaultFact[],
  opts: { dials: boolean; category?: string | null },
): VaultFact[] {
  const category = (opts.category ?? "").trim().toLowerCase();
  return facts.filter((f) => {
    if (f.label === "In the Academy" || f.label === "Code" || f.label === "Category") return false;
    if (f.label === "Preset" && opts.dials) return false;
    if (f.label === "Workout" && category) {
      const workout = f.value.trim().toLowerCase();
      if (workout && category.startsWith(workout)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * A machine's Academy pieces: its quick card, its script, its deep dive
 * ------------------------------------------------------------------ */

/** A piece's name, the same on the bento's door, the page's title and its crumb. */
export const PIECE_WORDS = { card: "Quick card", script: "Script", overview: "Deep dive" } as const;
export type PieceKind = keyof typeof PIECE_WORDS;

export function isPiece(route: VaultRoute): route is Extract<VaultRoute, { kind: PieceKind }> {
  return route.kind === "card" || route.kind === "script" || route.kind === "overview";
}

/** The machine a quick card, script or deep dive belongs to, by the Academy's joined rows; null for anything else. */
export function pieceMachineId(
  route: VaultRoute,
  machines: readonly { machineId: string; cardId?: string | null; scriptId?: string | null; overviewId?: string | null }[],
): string | null {
  if (!isPiece(route)) return null;
  const field = route.kind === "card" ? "cardId" : route.kind === "script" ? "scriptId" : "overviewId";
  return machines.find((m) => m[field] === route.id)?.machineId ?? null;
}

/**
 * A piece's name in a crumb or the peek's head, the piece first: "Quick
 * card · LEG PRESS", or "Quick card" alone right after its own machine in
 * the trail (said once). Null for a route that is not a machine's piece.
 */
export function pieceLabel(
  route: VaultRoute,
  machines: Parameters<typeof pieceMachineId>[1],
  name: (machineId: string) => string,
  parent?: VaultRoute | null,
): string | null {
  const id = pieceMachineId(route, machines);
  if (!id || !isPiece(route)) return null;
  const words = PIECE_WORDS[route.kind];
  if (parent && parent.kind === "machine" && parent.id === id) return words;
  return `${words} · ${name(id)}`;
}

/* ------------------------------------------------------------------ *
 * The version switch's place
 * ------------------------------------------------------------------ */

/**
 * Does the version switch fit on the trail's row beside the crumbs? The
 * trail scrolls to its end when it outgrows the row, which cuts its first
 * crumb mid-word ("‹ y › Cueing phrasebook"), so a page whose crumbs and
 * switch would not fit takes the switch under its title instead. Measured
 * from the crumbs' words (WikiShell's 12/700 crumbs, about 7px a letter, on
 * the generous side) and the row's width (the screen's, less its padding).
 */
const CRUMB_LETTER = 7;
const CRUMB_PAD = 12; // a crumb's own padding
const CRUMB_SEP = 18; // the chevron between two crumbs
const ROW_BACK = 44; // the back button and its gap
const ROW_GAP = 8; // between the trail and the switch
const SWITCH_W = 256; // "{Studio}'s version | MSF original"
const HIDE_W = 216; // "Hide crossed-out lines", and its gap

export function versionFitsTrail(input: { labels: readonly string[]; struck: boolean; width: number }): boolean {
  const pad = input.width >= 1024 ? 24 : 16;
  const room = input.width - 2 * pad;
  const crumbs =
    input.labels.reduce((sum, l) => sum + l.length * CRUMB_LETTER + CRUMB_PAD, 0) +
    Math.max(0, input.labels.length - 1) * CRUMB_SEP;
  const need = ROW_BACK + crumbs + ROW_GAP + SWITCH_W + (input.struck ? HIDE_W : 0);
  return need <= room;
}

/**
 * Does the switch's place keep room for "Hide crossed-out lines"? Decided
 * WITHOUT the lens (review fix, Oct 19 2026): the MSF original shows no
 * crossed-out line and so no Hide button, and a place read from the lens
 * moved the switch out from under the finger that had just tapped "MSF
 * original" (into the trail's row, the page jumping up), and back again.
 * So: room whenever this studio has crossed a line out on the page, in
 * either lens, and whenever the reader may cross one out (a leader), so the
 * first strike does not move it either. No studio open: no studio version.
 */
export function hideReserved(input: { studioOpen: boolean; canStrike: boolean; studioStruck: number }): boolean {
  if (!input.studioOpen) return false;
  return input.canStrike || input.studioStruck > 0;
}

/* ------------------------------------------------------------------ *
 * The floor glance's order
 * ------------------------------------------------------------------ */

/**
 * The floor glance keeps the Codex's own order: Stop first, then Set up,
 * Get set and Begin. A judge (the trainer between sets, Oct 19 2026) asked
 * for the set-up first, and a fixer moved it; that was put back the same
 * morning, because a recorded decision says the machine card reads "Safety,
 * the settings, then Notes" (AJ, Oct 4 2026, docs/DECISIONS.md#the-machine-card)
 * and the Machine Codex puts Stop first. The dials still lead the page in
 * the bento above the tier bar. GLANCE_LEAD names sections to lift ahead of
 * the rest; it is empty while that decision stands.
 */
export const GLANCE_LEAD: readonly string[] = [];

export function floorGlanceOrder<T extends { id: string }>(sections: readonly T[]): T[] {
  const lead = GLANCE_LEAD.flatMap((id) => sections.filter((s) => s.id === id));
  return [...lead, ...sections.filter((s) => !GLANCE_LEAD.includes(s.id))];
}

/** A machine's tiers as the bar draws them (the floor glance in floorGlanceOrder). */
export function machineLayers(
  tiers: readonly { id: string; n: number; title: string; sections: VaultSection[] }[] | null | undefined,
): CodexLayer[] {
  return (tiers ?? []).map((t) => ({
    id: t.id,
    n: t.n,
    title: t.title,
    sections: t.id === "glance" ? floorGlanceOrder(t.sections) : t.sections,
    partial: true,
  }));
}

/**
 * "Read next": the page's related pages, each once (two catalog entries can
 * share a name), without the Academy's own pieces of a machine when the
 * bento already has them as doors, and without anything `shown` already
 * lists (the bento's constellation). Said once.
 */
export function readNextOf(
  page: Pick<VaultPage, "related">,
  opts: { skipAcademyPieces?: boolean; shown?: ReadonlySet<string> } = {},
): VaultPage["related"] {
  const seen = new Set<string>();
  const out: VaultPage["related"] = [];
  for (const r of page.related) {
    const kind = r.route.kind;
    if (opts.skipAcademyPieces && (kind === "card" || kind === "script" || kind === "overview")) continue;
    const key = routeKey(r.route);
    const name = r.title.trim().toLowerCase();
    if (opts.shown?.has(key) || seen.has(key) || seen.has(`title:${name}`)) continue;
    seen.add(key);
    seen.add(`title:${name}`);
    out.push(r);
  }
  return out;
}

/** Read next in runs: a reason that several links share, said once over them; null keeps each link's own. */
export interface ReasonGroup {
  why: string | null;
  items: VaultPage["related"];
}

/**
 * Read next's links in groups. Links next to each other that give the same
 * reason share it, said once over them; every other link keeps its own
 * reason, and links that do are kept together in one group. The order
 * never changes. A shared reason must read true over every card under it:
 * the substitutes' reason names its whole set ("If LEG PRESS can't be used:
 * LEG EXTENSION + HIP ABDUCTION + LUMBAR.", pages.ts substituteWhy), so
 * only the machines of that one set share it; the old singular "Together
 * with …, it can replace this one." over three cards of three different
 * sets read as one five-machine set (review fix, Oct 19 2026).
 */
export function groupReasons(items: VaultPage["related"]): ReasonGroup[] {
  const out: ReasonGroup[] = [];
  let i = 0;
  while (i < items.length) {
    const why = items[i].why.trim();
    let j = i + 1;
    while (why && j < items.length && items[j].why.trim() === why) j += 1;
    if (j - i > 1) {
      out.push({ why, items: items.slice(i, j) });
    } else {
      const last = out[out.length - 1];
      if (last && last.why === null) last.items = [...last.items, items[i]];
      else out.push({ why: null, items: [items[i]] });
    }
    i = j;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Tiers
 * ------------------------------------------------------------------ */

/** A tier as the bar draws it: its depth number, its words, its sections. */
export interface CodexLayer {
  id: string;
  n: number;
  title: string;
  sections: VaultSection[];
  /** "cueing": the lines belong to the phrasebook, so a mark made on them is made there. */
  home?: "page" | "cueing";
  /** True when the tier shows only part of its page (marks elsewhere on the page are not "changed"). */
  partial: boolean;
}

/** The tier to show: the one asked for when the page has it, else the first. */
export function pickLayer(layers: readonly { id: string }[], wanted: string | null | undefined): string | null {
  if (layers.length === 0) return null;
  if (wanted && layers.some((l) => l.id === wanted)) return wanted;
  return layers[0].id;
}

/** The tier after this one, or null on the last. */
export function nextLayer<T extends { id: string }>(layers: readonly T[], id: string | null): T | null {
  const at = layers.findIndex((l) => l.id === id);
  return at >= 0 && at + 1 < layers.length ? layers[at + 1] : null;
}

const MARKABLE = new Set(["para", "bullet", "line", "cue", "said", "do"]);

/**
 * "In one minute": each section's title and the first line under it, the
 * topic's own words. Empty when it would say everything the full text says
 * (a one-line topic has no shorter version).
 */
export function outlineSections(sections: readonly VaultSection[]): VaultSection[] {
  const out: VaultSection[] = [];
  let full = 0;
  let kept = 0;
  for (const s of sections) {
    const blocks: VaultSection["blocks"] = [];
    // The first line of the section, then each heading inside it with the first line under it.
    let wanting = true;
    for (const b of s.blocks) {
      if (b.kind === "heading" || b.kind === "subheading") {
        wanting = true;
        continue;
      }
      if (!MARKABLE.has(b.kind)) continue;
      full += 1;
      if (!wanting) continue;
      const at = s.blocks.indexOf(b);
      const head = at > 0 ? s.blocks[at - 1] : undefined;
      if (blocks.length > 0 && head && (head.kind === "heading" || head.kind === "subheading")) blocks.push(head);
      blocks.push(b);
      kept += 1;
      wanting = false;
    }
    if (blocks.length > 0) out.push({ id: s.id, title: s.title, blocks });
  }
  return kept > 0 && kept < full ? out : [];
}

/**
 * The phrasebook moments a topic's words reach, by the knowledge graph: the
 * glossary words this topic explains or talks about, then the cue moments
 * that use one of those words. In the phrasebook's own order, at most `max`.
 */
export function topicCueMoments(graph: VaultGraph | null, topicId: string, max = 4): number[] {
  if (!graph || !topicId) return [];
  const topic = `topic:${topicId}`;
  const terms = new Set<string>();
  for (const e of graph.edges) {
    if (e.to === topic && e.from.startsWith("term:")) terms.add(e.from);
    else if (e.from === topic && e.to.startsWith("term:")) terms.add(e.to);
  }
  if (terms.size === 0) return [];
  const moments = new Set<number>();
  for (const e of graph.edges) {
    if (e.kind !== "mentions" || !e.from.startsWith("cue:") || !terms.has(e.to)) continue;
    const n = Number(e.from.slice(4));
    if (Number.isInteger(n) && n >= 0) moments.add(n);
  }
  return [...moments].sort((a, b) => a - b).slice(0, max);
}

/** The phrasebook's sections for these moments, in order (the cueing page names them moment-{i}). */
export function momentSections(cueing: Pick<VaultPage, "sections"> | null, moments: readonly number[]): VaultSection[] {
  if (!cueing) return [];
  const byId = new Map(cueing.sections.map((s) => [s.id, s]));
  return moments.flatMap((m) => {
    const s = byId.get(`moment-${m}`);
    return s && s.blocks.length > 0 ? [s] : [];
  });
}

/**
 * A topic's tiers: 1 In one minute, 2 Say it, 3 Lesson, 4 Full text (the Mix,
 * Oct 19 2026: the Course's lesson cards sit between the short reads and the
 * whole page). Each is left out when it would be empty: a topic with only
 * its full text has one, and `lesson` is false for a page with no lines to
 * cut into cards. Numbered by their place on the bar (1, 2, 3, 4; or 1, 2
 * when two are left out): a bar that read 1 · 2 · 4 would look like a tier
 * had gone missing. The machine's bar keeps its four fixed depths.
 *
 * The Lesson draws the page's own lines as cards, so a mark on a line the
 * page no longer has is listed under it, as under the other short tiers
 * (partial); the full text lists it itself.
 */
export function topicLayers(sections: readonly VaultSection[], say: readonly VaultSection[], lesson = false): CodexLayer[] {
  const out: CodexLayer[] = [];
  const outline = outlineSections(sections);
  if (outline.length > 0) out.push({ id: "minute", n: out.length + 1, title: "In one minute", sections: outline, partial: true });
  if (say.length > 0) out.push({ id: "say", n: out.length + 1, title: "Say it", sections: [...say], home: "cueing", partial: true });
  if (lesson) out.push({ id: "lesson", n: out.length + 1, title: "Lesson", sections: [...sections], partial: true });
  out.push({ id: "full", n: out.length + 1, title: "Full text", sections: [...sections], partial: false });
  return out;
}

/* ------------------------------------------------------------------ *
 * Glossary and phrasebook entries
 * ------------------------------------------------------------------ */

/** The one line a glossary term is, as its own section (the letter as its title). */
export function termSections(glossary: Pick<VaultPage, "sections"> | null, term: string): VaultSection[] {
  if (!glossary || !term) return [];
  const want = term.trim().toLowerCase();
  for (const s of glossary.sections) {
    const b = s.blocks.find((x) => (x.label ?? "").trim().toLowerCase() === want);
    if (b) return [{ id: s.id, title: "", blocks: [b] }];
  }
  return [];
}

/** A path's "who", unless its title already says it ("A head trainer" under "For a head trainer"). */
export function whoLine(track: Pick<Track, "who" | "title">): string | null {
  const who = (track.who ?? "").trim();
  if (!who) return null;
  const core = who.toLowerCase().replace(/^(a|an|the)\s+/, "");
  return track.title.toLowerCase().includes(core) ? null : who;
}

/** Is this glossary line an equipment word? (pages.ts says so in its source.) */
export function isEquipmentTerm(sections: readonly VaultSection[]): boolean {
  return sections.some((s) => s.blocks.some((b) => /equipment/i.test(b.source ?? "")));
}

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

/** The role paths, in the order the home page shows them. */
export const ROLE_PATHS: readonly string[] = ["life-transformer-101", "head-trainer", "studio-leader"];

export interface PathShelf {
  /** The first role path: the home page's lead card. */
  lead: Track | null;
  /** The other role paths. */
  roles: Track[];
  /** Every other path (the pillars'), in the playbooks' order. */
  pillars: Track[];
}

export function pathShelf(tracks: readonly Track[]): PathShelf {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const roles = ROLE_PATHS.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));
  const roleIds = new Set(roles.map((t) => t.id));
  return {
    lead: roles[0] ?? null,
    roles: roles.slice(1),
    pillars: tracks.filter((t) => !roleIds.has(t.id)),
  };
}

/** What kind of place a step is, for its glyph. */
export type StepKind = "machine" | "topic" | "playbook" | "words" | "cues" | "quiz" | "module" | "page";

export function stepKind(route: VaultRoute): StepKind {
  switch (route.kind) {
    case "machine":
      return "machine";
    case "topic":
      return "topic";
    case "playbook":
      return "playbook";
    case "glossary":
      return "words";
    case "cueing":
      return "cues";
    case "quiz":
      return "quiz";
    case "module":
      return "module";
    default:
      return "page";
  }
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/** "Clinical flag": a graph domain as a sentence starts it. */
export function domainWords(noun: string): string {
  const t = (noun ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/** "4.6": a topic's place in its module, from its position in the index. */
export function chapterNumber(moduleN: number, index: number): string {
  return `${moduleN}.${index + 1}`;
}
