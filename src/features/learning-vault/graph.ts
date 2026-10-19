/**
 * THE KNOWLEDGE GRAPH — what in Learning connects to what, and why.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes; see
 * docs/rounds/2026-10-19-learning-vault-redesign.md).
 *
 * WHAT IT IS FOR
 * --------------
 * Every design shows a page's neighbourhood: the Codex's bento has a "local
 * constellation" beside the facts, the Vault draws the whole map on the
 * Overview, the Course lists "what this connects to" under a lesson. All
 * three read THIS graph, so a link says the same thing in all of them.
 *
 * A link is only drawn where the repo can say why it exists:
 *
 *   substitutes     EXERCISE_SUBSTITUTES (routine-builder/academy.ts), the
 *                   Academy's "Exercise Substitutes" table.
 *   same-category   MACHINE_CATEGORY, the Academy's five programming families.
 *   part-of         a topic sits in its module (the Academy index).
 *   explained-in    a topic whose TITLE names the term ("Pace" → Mastery:
 *                   Pace), and every cue moment → the Academy's cues-and-
 *                   timing topic, the prose twin of the phrasebook.
 *   mentions        the topics that talk about a term or a machine most,
 *                   counted once at build time (graph-index.json, made by
 *                   scripts/build-learning-graph.ts), and the words a cue
 *                   moment uses.
 *   cued-at         the turnaround moments name example machines in their
 *                   own headings (CUE_EXAMPLES below, read by hand).
 *   affects         the clinical matrix names the machines a flag touches.
 *                   LABELS ONLY: the matrix's instruction text never enters
 *                   the graph (it is not the Academy's, and a trainer acts
 *                   on the client's own record, not on a map).
 *   see-also        a glossary definition that uses another glossary term.
 *   playbook-for    a Life Transformer playbook's own "related" pages.
 *
 * Nothing is inferred from similarity, nothing is scored, and the counts that
 * rank "mentions" are never shown: they only choose which eight topics are
 * worth a link ("a count is not a score").
 *
 * WHY NO LIBRARY
 * --------------
 * There is no graph or layout package in the repo (gaps.md §8) and adding one
 * means a new vendor chunk for ~230 nodes. The graph is a list of nodes and
 * edges built in one pass; the layout is layout.ts, deterministic geometry.
 *
 * PURE MODULE — no React, no Firestore, no JSON import (the build-time index
 * arrives as an argument, so a test can hand it a fixture).
 */

import type { AcademyMachine } from "../academy/academy-machines";
import type { AcademyIndex, CueMoment } from "../academy/types";
import { DB_KEY_TO_CANONICAL } from "../catalog/machine-identity";
import type { ClinicalSafetyFlag } from "../../types";
import { cueMomentLabel } from "./cue-label";
import type {
  Constellation,
  EdgeKind,
  GraphDomain,
  GraphEdge,
  GraphNode,
  PlaybookPage,
  VaultGraph,
  VaultRoute,
} from "./types";

/* ------------------------------------------------------------------ *
 * The build-time index (graph-index.json)
 * ------------------------------------------------------------------ */

/**
 * What scripts/build-learning-graph.ts writes. Counting mentions across 113,000
 * words on an iPad every time Learning opens would be slow and would load all
 * thirteen module chunks; counting once at build time is a diff a person can
 * read. `corpusHash` is "<the Academy index's hash>-<a hash of the prose>", so
 * a stale index shows in the diff and the runtime can tell it is stale.
 */
export interface GraphIndexFile {
  corpusHash: string;
  /** Glossary term, exactly as the glossary writes it → up to 8 topic ids, most mentions first. */
  termTopics: Record<string, string[]>;
  /** Machine id → up to 8 topic ids, most mentions first. */
  machineTopics: Record<string, string[]>;
}

/* ------------------------------------------------------------------ *
 * Domains: what kind of thing a node is
 * ------------------------------------------------------------------ */

/** The order a legend, a list or a filter reads the domains in. */
export const DOMAIN_ORDER: GraphDomain[] = [
  "machine",
  "method",
  "equipment",
  "cue",
  "module",
  "topic",
  "clinical",
  "playbook",
];

/** A heading for a group of one domain ("Machines", "Academy topics"). */
export const DOMAIN_LABEL: Record<GraphDomain, string> = {
  machine: "Machines",
  method: "The method's words",
  equipment: "Equipment words",
  cue: "Cue moments",
  module: "Academy modules",
  topic: "Academy topics",
  clinical: "Clinical flags",
  playbook: "Playbooks",
};

/** One of them, for a screen reader ("Pace, Academy topic"). */
export const DOMAIN_NOUN: Record<GraphDomain, string> = {
  machine: "machine",
  method: "glossary word",
  equipment: "equipment word",
  cue: "cue moment",
  module: "Academy module",
  topic: "Academy topic",
  clinical: "clinical flag",
  playbook: "playbook",
};

/**
 * Each domain's colour, as token strings an SVG fill or an inline custom
 * property can take (the Catalog passes "var(--wk-muscle-primary)" to the body
 * figure the same way). Learning's own category accents, borrowed where the
 * Academy index already uses them: machines are the index's "By machine"
 * accent (push), the curriculum is its curriculum accent (pull, blue for
 * modules and topics alike, told apart by size and icon), the method's words
 * are its "Cueing & language" accent (posterior). A clinical flag is the
 * caution plum, as a clinical warning is everywhere else: never the crimson,
 * which is critical and rep quality only. Orange stays Learning's brand mark:
 * no domain is --wk-hero. `text` is the shade that may colour words or a glyph
 * (4.5:1, learning-tokens.test.ts measures the cat-*-text shades).
 */
export const DOMAIN_COLOUR: Record<GraphDomain, { accent: string; fill: string; text: string }> = {
  machine: { accent: "var(--wk-cat-push)", fill: "var(--wk-cat-push-fill)", text: "var(--wk-cat-push-text)" },
  method: { accent: "var(--wk-cat-posterior)", fill: "var(--wk-cat-posterior-fill)", text: "var(--wk-cat-posterior-text)" },
  equipment: { accent: "var(--wk-cat-other)", fill: "var(--wk-cat-other-fill)", text: "var(--wk-cat-other-text)" },
  cue: { accent: "var(--wk-cat-legs)", fill: "var(--wk-cat-legs-fill)", text: "var(--wk-cat-legs-text)" },
  module: { accent: "var(--wk-cat-pull)", fill: "var(--wk-cat-pull-fill)", text: "var(--wk-cat-pull-text)" },
  topic: { accent: "var(--wk-cat-pull)", fill: "var(--wk-cat-pull-fill)", text: "var(--wk-cat-pull-text)" },
  clinical: { accent: "var(--wk-warn)", fill: "var(--wk-warn-fill)", text: "var(--wk-warn)" },
  playbook: { accent: "var(--wk-cat-trunk)", fill: "var(--wk-cat-trunk-fill)", text: "var(--wk-cat-trunk-text)" },
};

/* ------------------------------------------------------------------ *
 * Node ids
 * ------------------------------------------------------------------ */

export const machineNodeId = (id: string): string => `machine:${id}`;
export const moduleNodeId = (id: string): string => `module:${id}`;
export const topicNodeId = (id: string): string => `topic:${id}`;
/** "term:<the term, lower-case>", e.g. "term:failure (fatigue)". */
export const termNodeId = (term: string): string => `term:${term.trim().toLowerCase()}`;
export const cueNodeId = (index: number): string => `cue:${index}`;
export const clinicalNodeId = (id: string): string => `clinical:${id}`;
export const playbookNodeId = (id: string): string => `playbook:${id}`;

/**
 * The graph node a route stands for, or null when the route is not one node
 * (a home, a list, the quiz). A clinical flag has no page in Learning, so its
 * node's route is the map focused on it, and that route maps back here.
 * A quick card, a script and a deep dive are pages OF a machine, not nodes of
 * their own: the page builder that knows the card's machine uses its node.
 */
export function nodeIdForRoute(route: VaultRoute): string | null {
  switch (route.kind) {
    case "machine":
      return machineNodeId(route.id);
    case "module":
      return moduleNodeId(route.moduleId);
    case "topic":
      return topicNodeId(route.topicId);
    case "glossary":
      return route.term ? termNodeId(route.term) : null;
    case "cueing":
      return typeof route.moment === "number" ? cueNodeId(route.moment) : null;
    case "playbook":
      return playbookNodeId(route.id);
    case "map":
      return route.focus ?? null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Words: the one matcher the build script and the runtime share
 * ------------------------------------------------------------------ */

/**
 * The ways a term or a machine is written in prose. `words` match whole
 * words, case-insensitively, with an optional plural ("Lower Turnarounds",
 * "Exercise Induced Headaches"); `codes` match whole words with their case
 * ("EIH", "TSC"), never as a word, so a bare "rom" or "tsc" in a sentence
 * is not taken for one.
 */
export interface WordForms {
  words: string[];
  codes: string[];
}

const RE_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/** Longest first, so "lower turnaround" wins over "turnaround"; spaces bend. */
function alternation(forms: readonly string[]): string {
  return [...forms]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .map((f) => f.replace(RE_SPECIAL, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|");
}

export interface WordMatcher {
  /** How many times any form appears. */
  count(text: string): number;
  /** Where the first appearance starts, or -1. */
  first(text: string): number;
}

/** A matcher for one term's or one machine's forms; null when it has none. */
export function wordMatcher(forms: WordForms): WordMatcher | null {
  const res: RegExp[] = [];
  if (forms.words.length > 0) res.push(new RegExp(`\\b(?:${alternation(forms.words)})(?:es|s)?\\b`, "gi"));
  if (forms.codes.length > 0) res.push(new RegExp(`\\b(?:${alternation(forms.codes)})\\b`, "g"));
  if (res.length === 0) return null;
  return {
    count(text) {
      let n = 0;
      for (const re of res) {
        re.lastIndex = 0;
        while (re.exec(text) !== null) n += 1;
      }
      return n;
    },
    first(text) {
      let at = -1;
      for (const re of res) {
        re.lastIndex = 0;
        const m = re.exec(text);
        if (m && (at < 0 || m.index < at)) at = m.index;
      }
      return at;
    },
  };
}

/** An all-capitals abbreviation inside a term's brackets: "EIH", "TSC", "MUR", "ROM". */
const ABBREVIATION = /^[A-Z]{2,5}$/;

/**
 * How a glossary term is written in prose.
 *
 *   "Failure (Fatigue)"                 failure          (Fatigue is its own term)
 *   "Timed Static Contraction (TSC)"    timed static contraction · code TSC
 *   "Lower Turnaround (Lower Turn/Bottom)"  lower turnaround · lower turn
 *   "Tension (also Mechanical Tension or Muscular Tension)"  tension · mechanical tension · muscular tension
 *   "Contract(ion)"                     contract · contraction
 *   "Range of Motion (of machine)"      (nothing: "range of motion" belongs to the ROM entry)
 *
 * One-word names in the brackets are left out ("Fatigue", "Purpose",
 * "Bottom"): they are either a term of their own or too common a word to
 * stand for this one. `claimed` holds forms an earlier term already took
 * (first writer wins, as features/wiki/glossary-links does).
 */
export function termForms(term: string, claimed?: Set<string>): WordForms {
  const words: string[] = [];
  const codes: string[] = [];
  const take = (form: string) => {
    const f = form.replace(/\s+/g, " ").trim().toLowerCase();
    if (f.length < 3 || words.includes(f) || claimed?.has(f)) return;
    words.push(f);
    claimed?.add(f);
  };
  const t = term.trim();
  const spaced = /^(.*?)\s+\(([^)]*)\)\s*$/.exec(t);
  const attached = spaced ? null : /^(.*\S)\(([^)\s]+)\)$/.exec(t);
  if (spaced) {
    take(spaced[1]);
    const inner = spaced[2].trim().replace(/^(also|or)\s+/i, "");
    for (const raw of inner.split(/\s*\/\s*|\s*,\s*|\s+or\s+/i)) {
      const part = raw.trim();
      if (!part) continue;
      if (ABBREVIATION.test(part)) {
        if (!codes.includes(part)) codes.push(part);
      } else if (part.split(/\s+/).length >= 2 && !/^of\b/i.test(part)) {
        take(part);
      }
    }
  } else if (attached) {
    take(attached[1]);
    take(attached[1] + attached[2]);
  } else {
    take(t);
  }
  return { words, codes };
}

/** Every glossary term's forms, in glossary order, first writer winning a shared form. */
export function glossaryForms(glossary: readonly { term: string }[]): Map<string, WordForms> {
  const claimed = new Set<string>();
  const out = new Map<string, WordForms>();
  for (const g of glossary) out.set(g.term, termForms(g.term, claimed));
  return out;
}

/**
 * How a machine is written in prose: the Catalog's name and the Academy's
 * own titles for it ("CHEST/PEC FLY" → chest fly · pec fly; "Chest Flye";
 * "CX (4 WAY NECK)" → 4 way neck; "Cervical Extension"). Never a bare code:
 * "LP", "Cx", "Abs", "Biceps" (MACHINE_ABBR spells the biceps machine
 * "Biceps") name a muscle or a dozen things in a sentence, so any name that
 * IS a code is dropped. A bracket holding a list ("Lumbar Extension (Lumbar,
 * Lower Back)") is a gloss, not a name, and is left out.
 */
export function machineForms(names: readonly (string | null | undefined)[], codes: Iterable<string>): WordForms {
  const banned = new Set<string>();
  for (const c of codes) banned.add(c.trim().toLowerCase());
  const words: string[] = [];
  const take = (form: string) => {
    const f = form.replace(/\s+/g, " ").trim().toLowerCase();
    if (f.length < 3 || banned.has(f) || words.includes(f)) return;
    words.push(f);
  };
  for (const raw of names) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(name);
    const heads = paren ? [paren[1]] : [name];
    if (paren && !paren[2].includes(",") && paren[2].trim().split(/\s+/).length >= 2) heads.push(paren[2]);
    for (const head of heads) {
      // "CHEST/PEC FLY" is two names sharing a last word.
      const slash = /^(\S+)\/(\S+)(\s+.+)$/.exec(head.trim());
      if (slash) {
        take(slash[1] + slash[3]);
        take(slash[2] + slash[3]);
      } else {
        take(head);
      }
    }
  }
  return { words, codes: [] };
}

/* ------------------------------------------------------------------ *
 * Cue moments
 * ------------------------------------------------------------------ */

/**
 * A cue moment's name, short enough for a node. The phrasebook's headings
 * carry their examples inside the heading ("Lower Turnaround (movements where
 * weight stack touches - ex. leg press, chest press, overhead) - most
 * effectively used during the eccentric"); the examples are links here, so
 * the label keeps what tells the moments apart: "Lower turnaround, where the
 * stack touches". It is the cueing page's own section title (cue-label.ts),
 * so a node and the section it opens say the same words (wave A
 * integration, Oct 19 2026).
 */
export function cueLabel(moment: string): string {
  return cueMomentLabel(moment);
}

/** The topic every cue moment is explained in: the phrasebook's prose twin. */
export const CUES_TOPIC_ID = "instruction-exercise-instruction-cues-and-timing";

/**
 * The machines the turnaround moments name in their own headings (cues.json,
 * read by hand, Oct 19 2026). "row" is both rows; "abd/add" both hip
 * machines; "po" is the Pullover; "abdominal" the Abs machine; "overhead" the
 * Overhead Press. graph.test.ts holds each prefix to a real heading.
 */
export const CUE_EXAMPLES: { prefix: string; machineIds: string[] }[] = [
  {
    prefix: "Lower Turnaround (movements where weight stack touches",
    machineIds: ["m-leg-press", "m-chest-press", "m-overhead-press"],
  },
  {
    prefix: "Lower Turnaround (movements where weight stack does not touch",
    machineIds: ["m-pulldown", "m-compound-row", "m-simple-row"],
  },
  {
    prefix: "Upper Turnaround (movements with an end stop",
    machineIds: ["m-leg-press", "m-chest-press", "m-overhead-press", "m-dip"],
  },
  {
    prefix: "Upper Turnaround (movements without an end stop",
    machineIds: [
      "m-compound-row",
      "m-simple-row",
      "m-chest-fly",
      "m-bicep",
      "m-lateral-raise",
      "m-abs",
      "m-hip-abd",
      "m-hip-add",
      "m-lumbar",
      "m-pullover",
      "m-pulldown",
      "m-torso-rotation",
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Edges: what each kind says
 * ------------------------------------------------------------------ */

/** Read from `from` to `to`: "Leg Extension substitutes for Leg Press". */
export const EDGE_LABEL: Record<EdgeKind, string> = {
  substitutes: "substitutes for",
  "same-category": "is in the same family as",
  "explained-in": "is explained in",
  mentions: "talks about",
  "part-of": "is part of",
  "cued-at": "is cued at",
  affects: "affects",
  "see-also": "see also",
  "playbook-for": "goes with",
};

/**
 * A group heading from the centre's side of the link. "out" is a link the
 * centre starts (a topic that talks about Pace); "in" is one that ends at it
 * (Pace, which comes up in that topic).
 */
const LINK_HEADING: Record<EdgeKind, { out: string; in: string }> = {
  substitutes: { out: "Substitutes for", in: "Substitutes" },
  "same-category": { out: "Same family", in: "Same family" },
  "explained-in": { out: "Explained in", in: "Explains" },
  mentions: { out: "Talks about", in: "Comes up in" },
  "part-of": { out: "Part of", in: "Topics" },
  "cued-at": { out: "Cue moments", in: "Machines" },
  affects: { out: "Machines", in: "Clinical flags" },
  "see-also": { out: "See also", in: "See also" },
  "playbook-for": { out: "Goes with", in: "Playbooks" },
};

/** The order links are shown in: the strongest reasons first. */
export const KIND_PRIORITY: EdgeKind[] = [
  "explained-in",
  "part-of",
  "substitutes",
  "cued-at",
  "affects",
  "playbook-for",
  "same-category",
  "see-also",
  "mentions",
];

const UNDIRECTED: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["same-category", "see-also"]);

export type ConstellationLink = Constellation["links"][number];

/** "Comes up in", "Substitutes for": what a link is, said from the centre. */
export function linkHeading(link: Pick<ConstellationLink, "edge" | "direction">): string {
  const h = LINK_HEADING[link.edge.kind];
  return UNDIRECTED.has(link.edge.kind) ? h.out : link.direction === "out" ? h.out : h.in;
}

/* ------------------------------------------------------------------ *
 * Building the graph
 * ------------------------------------------------------------------ */

/** The Academy glossary's concept terms come first; from here on it is the Equipment Nomenclature. */
export const EQUIPMENT_FROM = 40;
/** How many topics may claim to explain one term by their title. */
const EXPLAINED_MAX = 3;
/** How many other glossary words one definition may point at. */
const SEE_ALSO_MAX = 6;
/** How many words one cue moment may point at. */
const CUE_WORDS_MAX = 4;

export interface VaultGraphInput {
  index: AcademyIndex;
  machines: AcademyMachine[];
  /** The glossary; a definition, when present, gives "see also" links. */
  glossary: { term: string; definition?: string }[] | null;
  cues: CueMoment[] | null;
  clinical: ClinicalSafetyFlag[];
  playbooks: PlaybookPage[];
  graphIndex: GraphIndexFile;
  /** EXERCISE_SUBSTITUTES (routine-builder/academy.ts). */
  substitutes: Record<string, { machineIds: string[] }[]>;
  /** MACHINE_CATEGORY (routine-builder/academy.ts). */
  categories: Record<string, string>;
}

class Builder {
  readonly nodes: GraphNode[] = [];
  readonly edges: GraphEdge[] = [];
  private readonly byId = new Map<string, GraphNode>();
  private readonly seen = new Set<string>();

  has(id: string): boolean {
    return this.byId.has(id);
  }

  node(id: string, label: string, domain: GraphDomain, route: VaultRoute): void {
    if (this.byId.has(id)) return;
    const n: GraphNode = { id, label, domain, route, weight: 0 };
    this.byId.set(id, n);
    this.nodes.push(n);
  }

  /** Adds a link once, both ends known, never a node to itself. */
  edge(from: string, to: string, kind: EdgeKind): void {
    if (from === to || !this.byId.has(from) || !this.byId.has(to)) return;
    const key = UNDIRECTED.has(kind) ? [kind, ...[from, to].sort()].join("|") : `${kind}|${from}|${to}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.edges.push({ from, to, kind, label: EDGE_LABEL[kind] });
  }

  done(): VaultGraph {
    for (const e of this.edges) {
      this.byId.get(e.from)!.weight += 1;
      this.byId.get(e.to)!.weight += 1;
    }
    return { nodes: this.nodes, edges: this.edges };
  }
}

/** A clinical matrix machine id (a MACHINE_DATABASE key) as the app's canonical id. */
function canonicalMachine(id: string): string | null {
  if (id.startsWith("m-")) return id;
  return DB_KEY_TO_CANONICAL[id] ?? null;
}

/**
 * The whole graph, from what Learning already holds. Deterministic: the same
 * input gives the same nodes and edges in the same order. A topic id in the
 * build-time index that the Academy index no longer has (a rebuilt corpus
 * renamed it) is dropped, never drawn as a link to a page that is gone.
 */
export function buildVaultGraph(input: VaultGraphInput): VaultGraph {
  const b = new Builder();

  // The curriculum: modules, and each topic part of its module. Six titles
  // repeat across modules ("Introduction", "FAQ", "Exercise Selection
  // Template"…), and the Executive Summary names three of its topics after
  // whole modules ("Exercise Performance"). Two links both reading "FAQ", or a
  // topic link reading like a module, tell a reader nothing, so a title that
  // repeats carries its module: "FAQ · Mastery Series".
  const topicTitles: { id: string; title: string }[] = [];
  const titleCount = new Map<string, number>();
  for (const m of input.index.modules) {
    const own = m.title.trim().toLowerCase();
    titleCount.set(own, (titleCount.get(own) ?? 0) + 1);
    for (const t of m.topics) {
      const key = t.title.trim().toLowerCase();
      titleCount.set(key, (titleCount.get(key) ?? 0) + 1);
    }
  }
  for (const m of input.index.modules) {
    b.node(moduleNodeId(m.id), m.title, "module", { kind: "module", moduleId: m.id });
    for (const t of m.topics) {
      const label = (titleCount.get(t.title.trim().toLowerCase()) ?? 0) > 1 ? `${t.title} · ${m.title}` : t.title;
      b.node(topicNodeId(t.id), label, "topic", { kind: "topic", moduleId: m.id, topicId: t.id });
      b.edge(topicNodeId(t.id), moduleNodeId(m.id), "part-of");
      topicTitles.push({ id: t.id, title: t.title });
    }
  }

  // Machines, their substitutes and their families.
  const machineIds = input.machines.map((m) => m.machineId);
  for (const m of input.machines) {
    b.node(machineNodeId(m.machineId), m.name, "machine", { kind: "machine", id: m.machineId });
  }
  for (const main of Object.keys(input.substitutes).sort()) {
    for (const set of input.substitutes[main]) {
      for (const sub of set.machineIds) b.edge(machineNodeId(sub), machineNodeId(main), "substitutes");
    }
  }
  for (let i = 0; i < machineIds.length; i += 1) {
    for (let j = i + 1; j < machineIds.length; j += 1) {
      const a = input.categories[machineIds[i]];
      if (a && a === input.categories[machineIds[j]]) {
        b.edge(machineNodeId(machineIds[i]), machineNodeId(machineIds[j]), "same-category");
      }
    }
  }

  // The glossary: each term, the topics titled for it, the topics that talk
  // about it, and the other terms its definition uses.
  const glossary = input.glossary ?? [];
  const forms = glossaryForms(glossary);
  const matchers = new Map<string, WordMatcher | null>();
  for (const [term, f] of forms) matchers.set(term, wordMatcher(f));
  glossary.forEach((g, i) => {
    b.node(termNodeId(g.term), g.term, i >= EQUIPMENT_FROM ? "equipment" : "method", {
      kind: "glossary",
      term: g.term,
    });
  });
  for (const g of glossary) {
    const id = termNodeId(g.term);
    const matcher = matchers.get(g.term);
    const explained = new Set<string>();
    if (matcher) {
      for (const t of topicTitles) {
        if (explained.size >= EXPLAINED_MAX) break;
        if (matcher.first(t.title) >= 0) {
          explained.add(t.id);
          b.edge(id, topicNodeId(t.id), "explained-in");
        }
      }
    }
    for (const topicId of input.graphIndex.termTopics[g.term] ?? []) {
      if (!explained.has(topicId)) b.edge(topicNodeId(topicId), id, "mentions");
    }
  }
  for (const g of glossary) {
    if (!g.definition) continue;
    const hits: { at: number; term: string }[] = [];
    for (const other of glossary) {
      if (other.term === g.term) continue;
      const at = matchers.get(other.term)?.first(g.definition) ?? -1;
      if (at >= 0) hits.push({ at, term: other.term });
    }
    hits.sort((x, y) => x.at - y.at);
    for (const h of hits.slice(0, SEE_ALSO_MAX)) b.edge(termNodeId(g.term), termNodeId(h.term), "see-also");
  }

  // Machines in the curriculum.
  for (const id of machineIds) {
    for (const topicId of input.graphIndex.machineTopics[id] ?? []) {
      b.edge(topicNodeId(topicId), machineNodeId(id), "mentions");
    }
  }

  // The cueing phrasebook.
  (input.cues ?? []).forEach((c, i) => {
    b.node(cueNodeId(i), cueLabel(c.moment), "cue", { kind: "cueing", moment: i });
  });
  (input.cues ?? []).forEach((c, i) => {
    const id = cueNodeId(i);
    b.edge(id, topicNodeId(CUES_TOPIC_ID), "explained-in");
    const example = CUE_EXAMPLES.find((e) => c.moment.startsWith(e.prefix));
    for (const m of example?.machineIds ?? []) b.edge(machineNodeId(m), id, "cued-at");
    const text = [c.moment, ...c.phrases, ...c.notes].join("\n");
    const hits: { at: number; term: string }[] = [];
    for (const g of glossary) {
      const at = matchers.get(g.term)?.first(text) ?? -1;
      if (at >= 0) hits.push({ at, term: g.term });
    }
    hits.sort((x, y) => x.at - y.at);
    for (const h of hits.slice(0, CUE_WORDS_MAX)) b.edge(id, termNodeId(h.term), "mentions");
  });

  // The clinical matrix: a flag that names no machine connects to nothing on
  // this map and is left out (its page is the client's record, not Learning).
  for (const flag of input.clinical) {
    const touched: string[] = [];
    for (const h of flag.protocolHandling) {
      for (const raw of h.affectedMachineIds) {
        const m = canonicalMachine(raw);
        if (m && b.has(machineNodeId(m)) && !touched.includes(m)) touched.push(m);
      }
    }
    if (touched.length === 0) continue;
    const id = clinicalNodeId(flag.id);
    b.node(id, (flag.label ?? flag.conditionName).trim(), "clinical", { kind: "map", focus: id });
    for (const m of touched) b.edge(id, machineNodeId(m), "affects");
  }

  // The Life Transformer playbooks and the pages each names as related.
  for (const p of input.playbooks) {
    b.node(playbookNodeId(p.id), p.title, "playbook", { kind: "playbook", id: p.id });
  }
  for (const p of input.playbooks) {
    for (const r of p.related) {
      const to = nodeIdForRoute(r.route);
      if (!to) continue;
      b.edge(playbookNodeId(p.id), to, to.startsWith("playbook:") ? "see-also" : "playbook-for");
    }
  }

  return b.done();
}

/* ------------------------------------------------------------------ *
 * A node's neighbourhood
 * ------------------------------------------------------------------ */

const NODE_INDEX = new WeakMap<VaultGraph, Map<string, GraphNode>>();

/** A node by id, through a per-graph index (the graph is built once per corpus). */
export function nodeById(graph: VaultGraph, id: string): GraphNode | null {
  let index = NODE_INDEX.get(graph);
  if (!index) {
    index = new Map(graph.nodes.map((n) => [n.id, n]));
    NODE_INDEX.set(graph, index);
  }
  return index.get(id) ?? null;
}

const priorityOf = (kind: EdgeKind) => KIND_PRIORITY.indexOf(kind);

/**
 * One node and what connects to it: one link per neighbour (the strongest
 * reason when there are two), at most `max`. When there are more, every kind
 * of link keeps a share (round robin, strongest kind first) rather than the
 * strongest kind taking every place: a machine shows its substitutes AND its
 * clinical flags AND where it comes up, not twelve topics. Links come back
 * grouped by kind, strongest first, each group in the graph's own order
 * (for "mentions", most mentions first).
 */
export function constellationOf(graph: VaultGraph, nodeId: string, max = 12): Constellation | null {
  const center = nodeById(graph, nodeId);
  if (!center) return null;
  const best = new Map<string, ConstellationLink>();
  const order: string[] = [];
  for (const edge of graph.edges) {
    let other: string;
    let direction: "out" | "in";
    if (edge.from === nodeId) {
      other = edge.to;
      direction = "out";
    } else if (edge.to === nodeId) {
      other = edge.from;
      direction = "in";
    } else continue;
    const node = nodeById(graph, other);
    if (!node) continue;
    const had = best.get(other);
    if (!had) {
      best.set(other, { node, edge, direction });
      order.push(other);
    } else if (priorityOf(edge.kind) < priorityOf(had.edge.kind)) {
      best.set(other, { node, edge, direction });
    }
  }
  const groups = new Map<string, ConstellationLink[]>();
  for (const id of order) {
    const link = best.get(id)!;
    const key = groupKey(link);
    const list = groups.get(key);
    if (list) list.push(link);
    else groups.set(key, [link]);
  }
  const keys = [...groups.keys()].sort((a, b) => compareGroupKeys(a, b));
  const limit = Math.max(0, Math.floor(max));
  const take = new Map<string, number>(keys.map((k) => [k, 0]));
  let left = limit;
  let moved = true;
  while (left > 0 && moved) {
    moved = false;
    for (const k of keys) {
      if (left === 0) break;
      const n = take.get(k)!;
      if (n < groups.get(k)!.length) {
        take.set(k, n + 1);
        left -= 1;
        moved = true;
      }
    }
  }
  const links: ConstellationLink[] = [];
  for (const k of keys) links.push(...groups.get(k)!.slice(0, take.get(k)!));
  return { center, links };
}

/** Links that read the same from the centre share a group: kind and direction. */
function groupKey(link: ConstellationLink): string {
  const dir = UNDIRECTED.has(link.edge.kind) ? "out" : link.direction;
  return `${link.edge.kind}:${dir}`;
}

function compareGroupKeys(a: string, b: string): number {
  const [ka, da] = a.split(":") as [EdgeKind, string];
  const [kb, db] = b.split(":") as [EdgeKind, string];
  return priorityOf(ka) - priorityOf(kb) || (da === db ? 0 : da === "out" ? -1 : 1);
}

export interface LinkGroup {
  key: string;
  heading: string;
  links: ConstellationLink[];
}

/** A constellation's links as the groups a list draws, in its own order. */
export function groupLinks(c: Constellation): LinkGroup[] {
  const out: LinkGroup[] = [];
  for (const link of c.links) {
    const key = groupKey(link);
    const last = out[out.length - 1];
    if (last && last.key === key) last.links.push(link);
    else out.push({ key, heading: linkHeading(link), links: [link] });
  }
  return out;
}
