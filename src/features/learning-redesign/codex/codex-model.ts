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
import { routeKey, samePage } from "../../learning-vault/routes";
import type {
  Track,
  VaultFact,
  VaultGraph,
  VaultPage,
  VaultRoute,
  VaultSection,
} from "../../learning-vault/types";
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

/* ------------------------------------------------------------------ *
 * The machine's bento
 * ------------------------------------------------------------------ */

/**
 * The facts the bento lists in words. The code and the category are the
 * page's eyebrow, the preset is the dial strip and the Academy's pieces are
 * their own doors, so none of them is said twice.
 */
export function bentoFacts(facts: readonly VaultFact[], opts: { dials: boolean }): VaultFact[] {
  return facts.filter((f) => {
    if (f.label === "In the Academy" || f.label === "Code" || f.label === "Category") return false;
    if (f.label === "Preset" && opts.dials) return false;
    return true;
  });
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
 * A topic's tiers: 1 In one minute, 2 Say it, 4 Full text (the numbers are
 * depths, the same as a machine's: a topic has no "Adapt" depth). Each is
 * left out when it would be empty; a topic with only its full text has one.
 */
export function topicLayers(sections: readonly VaultSection[], say: readonly VaultSection[]): CodexLayer[] {
  const out: CodexLayer[] = [];
  const outline = outlineSections(sections);
  if (outline.length > 0) out.push({ id: "minute", n: 1, title: "In one minute", sections: outline, partial: true });
  if (say.length > 0) out.push({ id: "say", n: 2, title: "Say it", sections: [...say], home: "cueing", partial: true });
  out.push({ id: "full", n: 4, title: "Full text", sections: [...sections], partial: false });
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
  const core = who.toLowerCase().replace(/^(a|an|the)s+/, "");
  return track.title.toLowerCase().includes(core) ? null : who;
}

/** Is this glossary line an equipment word? (pages.ts says so in its source.) */
export function isEquipmentTerm(sections: readonly VaultSection[]): boolean {
  return sections.some((s) => s.blocks.some((b) => /equipment/i.test(b.source ?? "")));
}

/** The glossary as a codex index: each letter and its words, each word marked when it names equipment. */
export function wordIndex(glossary: Pick<VaultPage, "sections"> | null): { letter: string; words: { term: string; equipment: boolean }[] }[] {
  if (!glossary) return [];
  return glossary.sections
    .map((s) => ({
      letter: s.title,
      words: s.blocks
        .filter((b) => (b.label ?? "").trim() !== "")
        .map((b) => ({ term: (b.label ?? "").trim(), equipment: /equipment/i.test(b.source ?? "") })),
    }))
    .filter((g) => g.words.length > 0);
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
