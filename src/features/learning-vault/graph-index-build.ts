/**
 * THE GRAPH INDEX, COMPUTED — which Academy topics talk about which glossary
 * term and which machine.
 *
 * Round: the Learning vault redesign, Oct 19 2026.
 *
 * Run by scripts/build-learning-graph.ts (which writes graph-index.json) and
 * by graph-index.test.ts (which recomputes it from the committed corpus and
 * fails if the file is stale). One function, two callers, so the file can
 * never drift from what this code would write.
 *
 * HOW A TOPIC IS CHOSEN
 * ---------------------
 * For each glossary term and each machine, every one of the 98 topics is
 * read (its title and every block) and its mentions counted: whole words,
 * case-insensitive, a plural allowed (graph.ts termForms / machineForms). A
 * machine is found by its Catalog name and the Academy's titles for it, never
 * by a bare code ("LP" or "Abs" mean too many things in a sentence). The
 * eight topics with the most mentions are kept, ties in the Academy's
 * teaching order.
 *
 * TWINS
 * -----
 * The corpus repeats itself: Mastery reprints Programming's FAQ and its long-
 * term programming piece nearly word for word, the Executive Summary reprints
 * parts of modules 1 to 4, "Exercise Substitutes" appears three times. Left
 * alone, the same words would take two of a term's eight places. So two
 * topics are TWINS when at least 60% of the smaller one's blocks (three words
 * or more) appear in the other, and at least three do. A term's list keeps
 * one of a pair: the twin met first in the teaching order (the module the
 * Academy teaches it in, not the reprint), when that twin mentions the term
 * too; otherwise the one that does. Twins are measured, not listed, so a
 * rebuilt corpus finds its own.
 *
 * PURE MODULE — no React, no Firestore, no file system (the script reads the
 * files; the test imports them).
 */

import { buildAcademyMachines, cardTitle, catalogNamesOf, scriptTitle } from "../academy/academy-machines";
import type { AcademyIndex, MachineScript, ModuleContent, OverviewsFile, QuickCard, Topic } from "../academy/types";
import { glossaryForms, machineForms, wordMatcher, type GraphIndexFile, type WordMatcher } from "./graph";

/** How many topics one term or one machine links to. */
export const TOPICS_PER_ENTRY = 8;
/** Share of the smaller topic's blocks the larger must hold to be its twin. */
export const TWIN_SHARE = 0.6;
/** And at least this many blocks in common. */
export const TWIN_MIN_SHARED = 3;
/** Blocks shorter than this many words ("Load Up", "SETUP") say nothing about twins. */
const TWIN_MIN_WORDS = 3;
/**
 * The Academy's glossary as a topic (Introduction: Glossary). It defines every
 * term, so it would sit in every term's list; a term's own page already IS
 * that definition, so it is left out of the term lists (a machine keeps it).
 */
export const GLOSSARY_TOPIC_ID = "intro-glossary";

export interface GraphCorpus {
  index: AcademyIndex;
  /** Every module's content, any order (the index sets the teaching order). */
  modules: ModuleContent[];
  glossary: { term: string; definition: string }[];
  cards: QuickCard[];
  scripts: MachineScript[];
  overviews: OverviewsFile["overviews"];
  /** Machine id → the Catalog's name (MACHINE_DEFINITIONS, the standard's seed). */
  catalogNames: Record<string, string>;
  /** Every code a machine goes by besides the corpus's own (MACHINE_ABBR's values). */
  codes: string[];
}

interface TopicRef {
  id: string;
  /** The module's place in the teaching order (index.json `n`). */
  n: number;
  /** The topic's place in its module. */
  at: number;
  text: string;
}

/** FNV-1a, 32 bits, as 8 hex: enough to make a stale file show in a diff. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function topicText(t: Topic): string {
  return [t.title, ...t.blocks.map((b) => b.text)].join("\n");
}

/** The topics in the Academy's teaching order: module by `n`, topic by its place. */
function topicsInOrder(index: AcademyIndex, modules: ModuleContent[]): TopicRef[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const out: TopicRef[] = [];
  for (const m of [...index.modules].sort((a, b) => a.n - b.n)) {
    const content = byId.get(m.id);
    if (!content) throw new Error(`graph index: module "${m.id}" is in the index but its content was not given`);
    content.topics.forEach((t, at) => out.push({ id: t.id, n: m.n, at, text: topicText(t) }));
  }
  return out;
}

const blockKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Each topic's twins (see the header), symmetric. */
export function findTwins(modules: ModuleContent[]): Map<string, Set<string>> {
  const blocks: { id: string; keys: Set<string> }[] = [];
  for (const m of modules) {
    for (const t of m.topics) {
      const keys = new Set<string>();
      for (const b of t.blocks) {
        const k = blockKey(b.text);
        if (k.split(" ").length >= TWIN_MIN_WORDS) keys.add(k);
      }
      blocks.push({ id: t.id, keys });
    }
  }
  const twins = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!twins.has(a)) twins.set(a, new Set());
    twins.get(a)!.add(b);
  };
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i];
      const b = blocks[j];
      const smaller = Math.min(a.keys.size, b.keys.size);
      if (smaller === 0) continue;
      let shared = 0;
      const [small, large] = a.keys.size <= b.keys.size ? [a.keys, b.keys] : [b.keys, a.keys];
      for (const k of small) if (large.has(k)) shared += 1;
      if (shared >= TWIN_MIN_SHARED && shared / smaller >= TWIN_SHARE) {
        link(a.id, b.id);
        link(b.id, a.id);
      }
    }
  }
  return twins;
}

/**
 * The topics one matcher points at: most mentions first, ties in teaching
 * order, one of each pair of twins (the earlier, when it mentions it too).
 */
export function rankTopics(
  matcher: WordMatcher | null,
  topics: TopicRef[],
  twins: Map<string, Set<string>>,
  max = TOPICS_PER_ENTRY,
): string[] {
  if (!matcher) return [];
  const counts = new Map<string, number>();
  const place = new Map<string, number>();
  topics.forEach((t, i) => {
    place.set(t.id, i);
    const n = matcher.count(t.text);
    if (n > 0) counts.set(t.id, n);
  });
  const ranked = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || place.get(a)! - place.get(b)!);
  const taken: string[] = [];
  const isTaken = (id: string) => taken.includes(id);
  for (const id of ranked) {
    if (taken.length >= max) break;
    const mine = twins.get(id) ?? new Set<string>();
    if (isTaken(id) || [...mine].some(isTaken)) continue;
    // Stand in with the twin met first in the teaching order, if it says it too.
    let pick = id;
    for (const other of mine) {
      if (counts.has(other) && place.get(other)! < place.get(pick)!) pick = other;
    }
    if (isTaken(pick) || [...(twins.get(pick) ?? [])].some(isTaken)) continue;
    taken.push(pick);
  }
  return taken;
}

/** Every name a machine is written as in the corpus, by machine id. */
export function machineNames(corpus: Pick<GraphCorpus, "cards" | "scripts" | "overviews" | "catalogNames">): Map<string, string[]> {
  const names = new Map(Object.entries(corpus.catalogNames));
  const rows = buildAcademyMachines(corpus.cards, corpus.scripts, corpus.overviews, catalogNamesOf([...names].map(([id, name]) => ({ id, name }))));
  const card = new Map(corpus.cards.map((c) => [c.id, c]));
  const script = new Map(corpus.scripts.map((s) => [s.id, s]));
  const overview = new Map(corpus.overviews.map((o) => [o.id, o]));
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const list = [names.get(row.machineId) ?? row.name];
    const c = row.cardId ? card.get(row.cardId) : undefined;
    const s = row.scriptId ? script.get(row.scriptId) : undefined;
    const o = row.overviewId ? overview.get(row.overviewId) : undefined;
    if (c) list.push(cardTitle(c));
    if (s) list.push(scriptTitle(s));
    if (o) list.push(o.title);
    out.set(row.machineId, list);
  }
  return out;
}

/** Keys in code-unit order, so the file reads the same on every machine. */
function sortedRecord(entries: [string, string[]][]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) out[k] = v;
  return out;
}

/** The whole index, from the corpus. */
export function buildGraphIndex(corpus: GraphCorpus): GraphIndexFile {
  const topics = topicsInOrder(corpus.index, corpus.modules);
  const twins = findTwins(corpus.modules);

  const termEntries: [string, string[]][] = [];
  const notTheGlossary = topics.filter((t) => t.id !== GLOSSARY_TOPIC_ID);
  for (const [term, forms] of glossaryForms(corpus.glossary)) {
    termEntries.push([term, rankTopics(wordMatcher(forms), notTheGlossary, twins)]);
  }

  const codes = new Set<string>(corpus.codes);
  for (const c of corpus.cards) codes.add(c.abbr);
  for (const s of corpus.scripts) codes.add(s.abbr);
  const machineEntries: [string, string[]][] = [];
  for (const [id, names] of machineNames(corpus)) {
    machineEntries.push([id, rankTopics(wordMatcher(machineForms(names, codes)), topics, twins)]);
  }

  const prose = [
    topics.map((t) => `${t.id}\n${t.text}`).join("\n\n"),
    corpus.glossary.map((g) => g.term).join("\n"),
    [...machineNames(corpus)].map(([id, n]) => `${id}:${n.join("|")}`).join("\n"),
    [...codes].sort().join(","),
  ].join("\n\n");

  return {
    corpusHash: `${corpus.index.corpusHash}-${fnv1a(prose)}`,
    termTopics: sortedRecord(termEntries),
    machineTopics: sortedRecord(machineEntries),
  };
}

/** The file as written: keys in a fixed order, two-space indent, a final newline. */
export function formatGraphIndex(file: GraphIndexFile): string {
  const ordered: GraphIndexFile = {
    corpusHash: file.corpusHash,
    termTopics: sortedRecord(Object.entries(file.termTopics)),
    machineTopics: sortedRecord(Object.entries(file.machineTopics)),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
