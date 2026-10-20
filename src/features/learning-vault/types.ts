/**
 * THE LEARNING VAULT — the shapes every part of the redesign shares.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes; see
 * docs/rounds/2026-10-19-learning-vault-redesign.md). Three designs (the
 * Tactical Codex, the Living Vault, the Interactive Course) draw the SAME
 * pages, markup, submissions, links and quiz; only the furniture differs. So
 * the words, the rules and the data live here once, and each design is a
 * different way of laying them out.
 *
 * PURE MODULE: types only, no React, no Firestore.
 */

import type { LearningRef } from "../learning/ref";

/* ------------------------------------------------------------------ *
 * Designs
 * ------------------------------------------------------------------ */

/** Which Learning the tab draws. "current" is today's, untouched. */
export type LearningDesign = "codex" | "current";

/* ------------------------------------------------------------------ *
 * Pages and blocks
 * ------------------------------------------------------------------ */

/**
 * A page the vault can point at. Every LearningRef, plus the Life
 * Transformer playbooks (drafts written from docs/business, which are not
 * the Academy and so have no LearningRef kind of their own).
 */
export type VaultTargetRef = LearningRef | { kind: "playbook"; id: string };

/**
 * One line a reader can mark: a paragraph, a bullet, a cue, a method line.
 *
 * `key` is blockKeyFor(text): it is made from the WORDS, never the position,
 * the same call safetyLineKey makes for a machine's safety lines. A rebuilt
 * Academy corpus can reorder blocks and rename ids; a key made from the words
 * keeps a studio's mark on the line it was made on, and a line whose words
 * changed shows up as an orphan ("this line has changed since …") instead of
 * the mark silently moving onto a different sentence.
 */
export type VaultBlockKind =
  | "heading"
  | "subheading"
  | "para"
  | "bullet"
  | "cue"
  | "said"
  | "do"
  | "line";

export interface VaultBlock {
  key: string;
  kind: VaultBlockKind;
  text: string;
  /** A method line's label ("The load-up", "Clinical warning"), or a glossary term. */
  label?: string;
  /** Where these words come from, as a reader says it ("Academy 4.6 Turnaround Technique"). */
  source?: string;
}

export interface VaultSection {
  /** Stable within its page ("setup", "leaf-stop", "beat-0", "moment-3"). */
  id: string;
  title: string;
  blocks: VaultBlock[];
  /** One quiet line under the title: a source, never a caption that restates the content. */
  note?: string;
}

/** The four depths of a machine page (Design 1's switcher; the others use them as order). */
export type CodexTierId = "glance" | "script" | "adapt" | "science";

export interface CodexTier {
  id: CodexTierId;
  n: 1 | 2 | 3 | 4;
  title: string;
  sections: VaultSection[];
}

/** Life Transformer playbook pillars (the 101-to-mastery shelf). */
export type PillarId = "floor" | "equipment" | "programming" | "consult" | "retention";

export type QuizDeckId =
  | "mixed"
  | "glossary"
  | "cues"
  | "rep"
  | "machines"
  | "method"
  | "hutchins"
  | "playbooks";

/** Where a design can be. Each design keeps a stack of these (useVaultNav). */
export type VaultRoute =
  | { kind: "home" }
  | { kind: "catalog" }
  | { kind: "academy" }
  | { kind: "machine"; id: string; tier?: CodexTierId }
  | { kind: "module"; moduleId: string }
  | { kind: "topic"; moduleId: string; topicId: string }
  | { kind: "card"; id: string }
  | { kind: "script"; id: string }
  | { kind: "overview"; id: string }
  | { kind: "glossary"; term?: string }
  | { kind: "cueing"; moment?: number }
  | { kind: "playbook"; id: string }
  | { kind: "track"; id: string }
  | { kind: "quiz"; deck?: QuizDeckId }
  | { kind: "map"; focus?: string }
  | { kind: "queue" };

/** A page's identity for markup, links and submissions. */
export interface VaultTarget {
  ref: VaultTargetRef;
  /** learningRefKey(ref), or "playbook:<id>". The markup document is keyed by it. */
  key: string;
  title: string;
}

/** A fact for an infobox or a bento ("Code · LP", "Workout · Lower Body"). */
export interface VaultFact {
  label: string;
  value: string;
}

/** Everything a design needs to draw one page. Built by pages.ts, drawn by ArticleBlocks. */
export interface VaultPage {
  route: VaultRoute;
  target: VaultTarget;
  eyebrow: string;
  title: string;
  lede?: string;
  /** The page in reading order (for a machine: every tier's sections, glance first). */
  sections: VaultSection[];
  /** A machine page only: the same sections, grouped by depth. */
  tiers?: CodexTier[];
  facts: VaultFact[];
  /** "docs/msf-academy/…/Turnaround Technique.txt", or a playbook's sources line. */
  source?: string;
  /** A playbook is a draft until head office has read it (Corporate owns the method). */
  draft?: boolean;
  related: { route: VaultRoute; title: string; why: string }[];
  /** Graph node id of this page, for its local constellation. */
  nodeId?: string;
}

/** What a page builder answers when it cannot draw yet, or ever. */
export type VaultPageState = VaultPage | "loading" | "gone";

/* ------------------------------------------------------------------ *
 * Studio markup (the {Studio}'s version)
 * ------------------------------------------------------------------ */

export interface VaultPerson {
  /** The Auth uid, never the trainer document's id (CLAUDE.md, "Always on"). */
  uid: string;
  name: string;
}

/**
 * A line one studio has crossed out on its own version of a page. Studio
 * leaders only. Asks why first, like a safety line taken off a unit
 * (admin/machines/editor/safety-removal.tsx): reasonIsEnough, 3 to 300.
 */
export interface StudioStrike {
  blockKey: string;
  /** The words as they were when crossed out, so a changed line can say so. */
  originalText: string;
  reason: string;
  /** What this studio does instead, in its own words (optional, at most 300). */
  replacement?: string;
  by: VaultPerson;
  /** ISO date-time. */
  at: string;
}

/** A studio's note on one line. Anyone who works at the studio. */
export interface StudioBlockNote {
  id: string;
  blockKey: string;
  /** The line it was written on, as it read then (at most 400). */
  quote: string;
  body: string;
  author: VaultPerson;
  at: string;
}

/** One studio's markup on one page. Never read by another studio. */
export interface StudioMarkup {
  studioId: string;
  studioName: string;
  targetKey: string;
  title: string;
  strikes: StudioStrike[];
  notes: StudioBlockNote[];
}

/** Which version a reader is looking at. */
export type MarkupLens = "studio" | "original";

/** A block with this studio's markup laid on it (studio lens), or bare (original lens). */
export interface MarkedBlock extends VaultBlock {
  strike?: StudioStrike;
  notes: StudioBlockNote[];
  /** The studio lens with crossed-out lines hidden. Never true in the original lens. */
  hidden: boolean;
}

/** A mark whose line is no longer on the page: the words changed, or the corpus moved. */
export type OrphanMark =
  | { kind: "strike"; mark: StudioStrike }
  | { kind: "note"; mark: StudioBlockNote };

/* ------------------------------------------------------------------ *
 * Submissions to head office (dispute, or add)
 * ------------------------------------------------------------------ */

export type SubmissionIntent = "dispute" | "addition";
export type SubmissionStatus = "pending" | "taken" | "declined";

export interface LearningSubmission {
  id: string;
  intent: SubmissionIntent;
  ref: VaultTargetRef;
  targetKey: string;
  targetTitle: string;
  /** Present when it is about one line. */
  blockKey?: string;
  quote?: string;
  /** The trainer's words: what is wrong, or what to add. */
  body: string;
  /** Proposed wording, if they have one. */
  proposed?: string;
  studioId: string;
  studioName: string;
  by: VaultPerson;
  at: string;
  status: SubmissionStatus;
  decision?: { note?: string; byName: string; at: string };
}

/** How many studios crossed out the same line: head office's signal, one tap from its proof. */
export interface StrikeSignal {
  targetKey: string;
  targetTitle: string;
  blockKey: string;
  quote: string;
  studios: { studioId: string; studioName: string; reason: string; replacement?: string; at: string }[];
}

/* ------------------------------------------------------------------ *
 * Entities and concept cards (nested popovers)
 * ------------------------------------------------------------------ */

export type EntityKind = "term" | "machine" | "rule" | "clinical" | "topic" | "cue" | "playbook";

export interface VaultEntity {
  /** "term:concentric", "machine:m-leg-press", "rule:tsc", "clinical:osteoporosis". */
  id: string;
  kind: EntityKind;
  label: string;
  /** Words that link to it, matched case-insensitively on whole words. */
  aliases: string[];
  /** Codes matched case-SENSITIVELY on whole words ("LP", "CP"). */
  codes?: string[];
  /** One or two sentences in the source's own words. Nested links are found in it. */
  summary: string;
  route: VaultRoute;
  /** Other entity ids, for the card's "connected" row and the constellation. */
  related: string[];
  /** Where the summary comes from ("Academy glossary", "Machine definition", "Clinical matrix"). */
  source: string;
}

export type LinkedSegment = { text: string; entityId?: undefined } | { text: string; entityId: string };

/* ------------------------------------------------------------------ *
 * The knowledge graph (the constellation, the rumor map)
 * ------------------------------------------------------------------ */

export type GraphDomain =
  | "machine"
  | "method"
  | "equipment"
  | "module"
  | "topic"
  | "cue"
  | "clinical"
  | "playbook";

export interface GraphNode {
  id: string;
  label: string;
  domain: GraphDomain;
  route: VaultRoute;
  /** How connected it is (edge count), for sizing. */
  weight: number;
}

export type EdgeKind =
  | "substitutes"
  | "same-category"
  | "explained-in"
  | "mentions"
  | "part-of"
  | "cued-at"
  | "affects"
  | "see-also"
  | "playbook-for";

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Says WHY the two connect, read from `from` to `to` ("is part of a set that replaces", "is explained in"). */
  label: string;
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Constellation {
  center: GraphNode;
  links: { node: GraphNode; edge: GraphEdge; direction: "out" | "in" }[];
}

/* ------------------------------------------------------------------ *
 * The repetition (the scrubber)
 * ------------------------------------------------------------------ */

export type RepPhaseId = "loadup" | "handoff" | "concentric" | "upper" | "eccentric" | "lower" | "final";

/** Which first repetition a machine has (scripts.json's three shapes). */
export type RepShape = "endStop" | "squeeze" | "handoff";

export interface RepPhase {
  id: RepPhaseId;
  label: string;
  /** Seconds on the scrubber's timeline. A turnaround is drawn as a short window. */
  from: number;
  to: number;
  /** The rule, in the Academy's words or a close paraphrase of them. */
  rule: string;
  /** Where the rule comes from ("Academy 4.5 Speed of Movement"). */
  source: string;
  /** cues.json index of the moment whose phrases belong here, when there is one. */
  cueMoment?: number;
}

export interface RepModel {
  shape: RepShape;
  /** Seconds each way, 6 to 10 (the Academy's window; 6 is the house default). */
  pace: number;
  phases: RepPhase[];
  total: number;
}

/* ------------------------------------------------------------------ *
 * The quiz (game mode)
 * ------------------------------------------------------------------ */

export interface QuizSource {
  /** What the reader sees ("Academy glossary · Concentric", "Paraphrased from …"). */
  label: string;
  /** Where "Read it" goes; null when the source is not a page in Learning. */
  route: VaultRoute | null;
  /** The file the fact traces back to (docs/msf-academy/… or docs/business/…). */
  path?: string;
  /** True for anything restated rather than quoted (Hutchins: never quoted). */
  paraphrased?: boolean;
}

export interface QuizQuestion {
  id: string;
  deck: QuizDeckId;
  kind: "choice" | "truefalse" | "order";
  prompt: string;
  /** choice / truefalse: the options. order: the items in their CORRECT order. */
  options: string[];
  /** Index of the right option; -1 for an order question. */
  answer: number;
  /** One or two sentences: why, in the source's words or a paraphrase of them. */
  explain: string;
  source: QuizSource;
}

export interface QuizDeck {
  id: QuizDeckId;
  title: string;
  /** One short line on what it covers. */
  blurb: string;
}

/** A round as played: questions in play order, options already shuffled. */
export interface QuizRound {
  deck: QuizDeckId;
  questions: QuizQuestion[];
}

/** Kept in memory for the round only. Nothing is stored, ranked or shown to anyone else. */
export interface QuizAnswer {
  questionId: string;
  right: boolean;
  /** choice / truefalse: the index picked. order: the order picked. */
  picked: number | number[];
}

/* ------------------------------------------------------------------ *
 * Life Transformer playbooks and tracks
 * ------------------------------------------------------------------ */

export interface PlaybookBlock {
  kind: "para" | "bullet";
  text: string;
  /** "docs/business/the-floor.md:66": every line says where it comes from. */
  source: string;
}

export interface PlaybookPage {
  id: string;
  title: string;
  lede: string;
  pillar: PillarId;
  /**
   * "draft": written by Claude from Journey's business notes, and head office
   * has not read it yet, so no reader sees it (playbooks/index.ts,
   * SHOWN_PLAYBOOKS). "read": someone has read it for head office and set
   * this in its file; it shows, with no draft line.
   */
  status: "draft" | "read";
  sections: { id: string; title: string; blocks: PlaybookBlock[] }[];
  related: { route: VaultRoute; title: string; why: string }[];
}

/** An ordered reading path for a role. Nothing is scored, stored or compared. */
export interface Track {
  id: string;
  title: string;
  /** Who it is for, in a few words ("A new Life Transformer"). */
  who: string;
  steps: { route: VaultRoute; title: string; why: string }[];
}

/* ------------------------------------------------------------------ *
 * Who is reading (the prototype's viewer)
 * ------------------------------------------------------------------ */

export interface VaultViewer {
  /** The Auth uid; null when nobody is signed in (a harness). */
  uid: string | null;
  name: string;
  /** Crosses lines out on the studio's version (canWriteStudioPages). */
  canStrike: boolean;
  /** Writes notes on the studio's version (writesForStudioPerRules). */
  canNote: boolean;
  /** Sees head office's queue (administrators). */
  isHeadOffice: boolean;
}
