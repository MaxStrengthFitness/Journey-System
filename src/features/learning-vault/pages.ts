/**
 * PAGES — every Learning page, built once, for all three designs to draw.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes).
 *
 * WHY THIS EXISTS
 * ---------------
 * The Tactical Codex, the Living Vault and the Interactive Course are three
 * layouts of the SAME pages. If each design read the Academy's JSON itself,
 * the three would soon disagree about a page's title, where its sections
 * break, or which words a studio's mark sits on — and a studio's crossed-out
 * line would land on a different sentence depending on which prototype AJ
 * opened. So a page is built here, once, as a VaultPage (types.ts): its
 * target (the key its markup, links and head-office notes hang on), a title,
 * sections of lines with keys made from their words, a few facts, and the
 * pages it leads to. A design only decides where those go on the screen.
 *
 * THE RULES IT KEEPS
 * ------------------
 *  - A page that cannot draw yet says "loading"; a page that will never draw
 *    (an id the corpus no longer has) says "gone". Never a throw, never an
 *    empty page pretending to be a real one. A topic whose module chunk is
 *    not here asks for it (data.loadModule) and says "loading"; a chunk that
 *    failed is still "loading" here, and data.moduleFailed lets the design
 *    say so in words.
 *  - A machine is named the Catalog's way, everywhere (Oct 2 2026, AJ: one
 *    name per machine across Learning). A quick card's own `title` is often
 *    a bare code ("Pd"), so a card page is titled by its machine, never by
 *    the card.
 *  - A topic's eyebrow is its module's title. The corpus's `moduleLabel` is a
 *    file's first line and is often a page marker ("LP  pg 1 of 2"), so it is
 *    never shown.
 *  - The corpus has no markup; its classifier guesses headings from shape and
 *    "fails toward body" (academy/parse.ts). So a topic is split into
 *    sections only where the split reads well: at its ALL-CAPS headings when
 *    it has them, else at subheadings that really head something (followed by
 *    prose, not a lead-in ending in a colon, not one of a run of list items).
 *    Where the guesses are mostly list items (the Executive Summary), the
 *    topic stays one section and its subheadings stay lines. The run before
 *    a topic's first break is a section with an EMPTY title: a design draws
 *    no heading for it, because the page's own title already heads it.
 *  - Shouting capitals from the source ("LOAD UP + FIRST CONCENTRIC",
 *    "POSTURE") are calmed to sentence case for a title; machine codes stay
 *    capitals. A line's words are never reworded (a key is made from its
 *    words, case aside), so a mark always sits on the Academy's own sentence.
 *  - A script page draws exactly the beats and lines the machine page's
 *    "Script & cues" tier draws (codex-reader's scriptSections), and the
 *    phrasebook sorts cue from stage direction with the same test
 *    (rep-phases' isCuePhrase), so a line reads the same wherever it shows.
 *  - A route that is not a page (the home, an index, the quiz, the map, the
 *    queue, a reading path) answers "gone": a design draws those itself.
 *
 * PURE MODULE: no React, no Firestore. The one effect is data.loadModule,
 * which only asks for a chunk (useVaultData makes that safe to call while
 * drawing).
 */

import { cardTitle, scriptTitle, type AcademyMachine } from "../academy/academy-machines";
import type { CueMoment, MachineScript, QuickCard, Topic } from "../academy/types";
import { canonicalMachineId } from "../catalog/machine-identity";
import { movementOf } from "../catalog/names";
import { readingTime } from "../learning/home";
import { presetLine, presetOf, switchesOf } from "../machine-codex/format";
import {
  CATEGORY_LABEL,
  EXERCISE_SUBSTITUTES,
  MACHINE_CATEGORY,
  abbr as academyAbbr,
} from "../routine-builder/academy";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import type { ClinicalSafetyFlag } from "../../types";
import type { MachineCatalogEntry } from "../../types/machines";
import { blockKeyFor, toVaultBlocks, vaultSection } from "./blocks";
import { codexTiers, EMPTY_TIER_LINE, scriptSections, workoutWords } from "./codex-reader";
import { nodeIdForRoute } from "./graph";
import { vaultTarget } from "./learning-link";
import { playbookSourceLabel, playbookSourcesLine } from "./playbooks";
import { cueMomentLabel } from "./cue-label";
import { CUE_SOURCE_LABEL, isCuePhrase } from "./rep-phases";
import type {
  CodexTier,
  PlaybookPage,
  VaultBlock,
  VaultBlockKind,
  VaultFact,
  VaultPage,
  VaultPageState,
  VaultRoute,
  VaultSection,
} from "./types";
import type { VaultData } from "./useVaultData";

type Related = VaultPage["related"][number];
type RawBlock = { kind: string; text: string };

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/**
 * Codes and abbreviations that stay in capitals when a shouting line is
 * calmed: the Academy's machine codes ("LE + LC + ABD" is a substitute set,
 * not a sentence) and the method's own initials.
 */
const KEEP_CAPITALS: ReadonlySet<string> = new Set([
  "MSF", "TSC", "EIH", "MUR", "ROM", "FAQ", "LT", "UT", "PPT", "B",
  "LP", "LE", "LC", "CR", "SR", "PD", "PO", "CP", "CF", "OH", "LR", "SD", "TR", "CX",
  "ABD", "ADD", "LUMB", "ABS", "BI", "TRI",
]);

/** The first letter of a line in capitals, past any opening quote or bracket. */
export function capitaliseFirst(text: string): string {
  return text.replace(/^([^A-Za-z]*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

/** Names that keep their own capitals when a shouting line is calmed. */
const PROPER_NAMES: readonly string[] = ["Imagine Strength", "MaxStrength", "Nautilus", "MedX", "Hoist"];

/**
 * "LOAD UP + FIRST CONCENTRIC" -> "Load up + first concentric". Only a line
 * with no lower-case letters at all is touched; machine codes stay capitals.
 */
export function calmCaps(text: string): string {
  if (/[a-z]/.test(text) || !/[A-Z]{2}/.test(text)) return text;
  let calm = text.replace(/[A-Za-z]+/g, (w) => (KEEP_CAPITALS.has(w) ? w : w.toLowerCase()));
  for (const name of PROPER_NAMES) {
    calm = calm.replace(new RegExp(`\\b${name}\\b`, "gi"), name);
  }
  return capitaliseFirst(calm);
}

/** A section title from a source heading: calmed, its trailing colon gone. */
function titleFrom(text: string): string {
  return calmCaps(text.trim()).replace(/\s*:\s*$/, "").trim();
}

function slugOf(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return s || "section";
}

/** A section id unique within its page: "setup", then "setup-2". */
function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/** One markable line, keyed on its words. Callers leave out lines with no words. */
function line(kind: VaultBlockKind, text: string, source?: string, label?: string): VaultBlock {
  const t = text.trim();
  const b: VaultBlock = { key: blockKeyFor(t), kind, text: t };
  if (label) b.label = label;
  if (source) b.source = source;
  return b;
}

function section(id: string, title: string, blocks: VaultBlock[], note?: string): VaultSection {
  return vaultSection(id, title, blocks, note);
}

/* ------------------------------------------------------------------ *
 * Where a topic's sections break
 * ------------------------------------------------------------------ */

/** "LP  pg 1 of 2": a page marker the classifier kept as a subheading. Never a line. */
const PAGE_MARKER = /^[A-Za-z]{1,6}\s+pg\s+\d+\s+of\s+\d+$/i;

/** A line that ends like a sentence or a lead-in, once closing quotes are set aside. */
function endsLikeASentence(text: string): boolean {
  return /[.:?!;,]$/.test(text.trim().replace(/[”"’')\]]+$/, ""));
}

/** Of the subheadings the classifier guessed, the ones that really head what follows. */
function headsWhatFollows(blocks: RawBlock[], i: number): boolean {
  const b = blocks[i];
  if (b.kind !== "subheading" || b.text.trim().length > 80 || endsLikeASentence(b.text)) return false;
  const next = blocks[i + 1];
  if (!next) return false;
  return next.kind === "body" || next.kind === "bullet" || (next.kind === "subheading" && /:\s*$/.test(next.text));
}

/**
 * Where a run of blocks breaks into sections. Headings when there are any;
 * else the subheadings that head something, but only when the topic's
 * subheadings are mostly real headings: when more than a quarter of them run
 * straight into another subheading, they are a list the classifier misread,
 * and the topic reads better whole.
 */
function breaksOf(blocks: RawBlock[]): Set<number> {
  const headings = blocks.flatMap((b, i) => (b.kind === "heading" ? [i] : []));
  if (headings.length > 0) return new Set(headings);
  let subs = 0;
  let runs = 0;
  blocks.forEach((b, i) => {
    if (b.kind !== "subheading") return;
    subs += 1;
    if (blocks[i + 1]?.kind === "subheading") runs += 1;
  });
  const candidates = blocks.flatMap((_b, i) => (headsWhatFollows(blocks, i) ? [i] : []));
  if (candidates.length < 2 || runs > subs * 0.25) return new Set();
  return new Set(candidates);
}

interface RawSection {
  title: string;
  blocks: RawBlock[];
  /** Opened by a break (not the untitled opening run). */
  fromBreak: boolean;
}

/**
 * Cut blocks at the given breaks. Two headings in a row would leave the first
 * heading over nothing, so the second stays a line under the first instead:
 * no section is ever a title with no words, and no words are dropped.
 */
function cutAt(blocks: RawBlock[], breaks: Set<number>, leadTitle = ""): RawSection[] {
  const out: RawSection[] = [];
  let current: RawSection = { title: leadTitle, blocks: [], fromBreak: false };
  blocks.forEach((b, i) => {
    if (!breaks.has(i)) {
      current.blocks.push(b);
      return;
    }
    if (current.fromBreak && current.blocks.length === 0) {
      current.blocks.push({ kind: "subheading", text: titleFrom(b.text) });
      return;
    }
    if (current.blocks.length > 0) out.push(current);
    current = { title: titleFrom(b.text), blocks: [], fromBreak: true };
  });
  if (current.blocks.length > 0) out.push(current);
  return out;
}

function toSections(raw: RawSection[], source: string | undefined, leadId = "opening"): VaultSection[] {
  const used = new Set<string>();
  return raw.map((s) => {
    const id = uniqueId(s.title ? slugOf(s.title) : leadId, used);
    const blocks = toVaultBlocks(s.blocks, source ? { source } : undefined);
    return section(id, s.title, blocks);
  });
}

/**
 * A topic's sections, in reading order. The opening run before the first
 * break has no title (draw no heading for it): the page's own title heads it.
 */
export function topicSections(blocks: RawBlock[], source?: string): VaultSection[] {
  const clean = blocks.filter((b) => b.text.trim() !== "" && !(b.kind === "subheading" && PAGE_MARKER.test(b.text.trim())));
  return toSections(cutAt(clean, breaksOf(clean)), source);
}

/**
 * A deep dive's sections. Every one of the nineteen opens with its target
 * muscles, then labels its parts with a line ending in a colon
 * ("Synergists:", "Considerations for setup:") and closes with NOTES, so it
 * breaks at exactly those. A muscle line is a list item, not a heading.
 */
export function overviewSections(blocks: RawBlock[], source?: string): VaultSection[] {
  const clean = blocks.filter((b) => b.text.trim() !== "");
  const breaks = new Set(
    clean.flatMap((b, i) => (b.kind === "heading" || (b.kind === "subheading" && /:\s*$/.test(b.text)) ? [i] : [])),
  );
  const raw = cutAt(clean, breaks, "Target muscles").map((s): RawSection => {
    const title = s.title.replace(/\s*\/\s*/g, " / ");
    const isList = title === "Target muscles" || /^synergists$/i.test(title);
    return { ...s, title, blocks: isList ? s.blocks.map((b) => ({ kind: "bullet", text: b.text })) : s.blocks };
  });
  return toSections(raw, source, "target-muscles");
}

/* ------------------------------------------------------------------ *
 * The cueing phrasebook's moments
 * ------------------------------------------------------------------ */

/**
 * A moment's heading, short enough to read as a section title; the full
 * words stay as the section's note. One name per moment everywhere: the
 * map's node reads the same function (cue-label.ts).
 */
export { cueMomentLabel };

/* ------------------------------------------------------------------ *
 * Machines
 * ------------------------------------------------------------------ */

/**
 * The clinical flags whose matrix entries name this machine, labels only
 * (never a protocol's instruction text). The matrix names machines by their
 * old database keys ("leg_press", "4_way_neck"), so each is read through
 * canonicalMachineId before it is compared.
 */
export function clinicalFlagsFor(
  machineId: string,
  matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX,
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const flag of matrix) {
    const names = flag.protocolHandling.some((p) =>
      p.affectedMachineIds.some((a) => a === machineId || canonicalMachineId(a) === machineId),
    );
    if (names) out.push({ id: flag.id, label: (flag.label ?? flag.conditionName).trim() });
  }
  return out;
}

/** The Academy's code for a machine, the way the Catalog's floor row finds it. */
function codeOf(machineId: string, am: AcademyMachine | undefined): string | null {
  return movementOf({ id: machineId })?.code ?? am?.abbr ?? academyAbbr(machineId);
}

function categoryOf(machineId: string): string | null {
  const c = MACHINE_CATEGORY[machineId];
  return c ? CATEGORY_LABEL[c] : null;
}

/** "Card · Script · Deep dive", or null when the Academy has nothing on it. */
function academyHas(am: AcademyMachine | undefined): string | null {
  if (!am) return null;
  const parts: string[] = [];
  if (am.cardId) parts.push("Card");
  if (am.scriptId) parts.push("Script");
  if (am.overviewId) parts.push("Deep dive");
  return parts.length ? parts.join(" · ") : null;
}

/** The Academy's own pieces on a machine, as links: card, script, deep dive. */
function academyLinks(am: AcademyMachine | undefined, skip?: "card" | "script" | "overview"): Related[] {
  if (!am) return [];
  const out: Related[] = [];
  if (am.cardId && skip !== "card") {
    out.push({ route: { kind: "card", id: am.cardId }, title: "Quick reference card", why: "Muscles, setup, posture, turnarounds." });
  }
  if (am.scriptId && skip !== "script") {
    out.push({ route: { kind: "script", id: am.scriptId }, title: "Full spoken script", why: "Word for word, setup to the last rep." });
  }
  if (am.overviewId && skip !== "overview") {
    out.push({ route: { kind: "overview", id: am.overviewId }, title: "Deep dive", why: "The complete write-up." });
  }
  return out;
}

function machineLink(machineId: string, data: VaultData): Related {
  return {
    route: { kind: "machine", id: machineId },
    title: data.names(machineId),
    why: "Its page: set-up, cues and safety.",
  };
}

/** The substitute sets as machine names, for the Adapt tier ("All of these together replace the main exercise"). */
function substituteNames(machineId: string, data: VaultData): string[][] {
  return (EXERCISE_SUBSTITUTES[machineId] ?? []).map((set) => set.machineIds.map((id) => data.names(id)));
}

const MAX_RELATED = 10;

function machineRelated(machineId: string, am: AcademyMachine | undefined, data: VaultData): Related[] {
  const out: Related[] = academyLinks(am);
  const seen = new Set<string>([machineId]);
  for (const set of EXERCISE_SUBSTITUTES[machineId] ?? []) {
    for (const id of set.machineIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      // The Academy's sets replace this machine TOGETHER: a machine in a set
      // of two or more is only part of the answer, and says who with.
      const others = set.machineIds.filter((o) => o !== id).map((o) => data.names(o));
      out.push({
        route: { kind: "machine", id },
        title: data.names(id),
        why: others.length
          ? `Together with ${others.join(" and ")}, it can replace this one.`
          : "On its own, it can replace this one.",
      });
    }
  }
  const category = MACHINE_CATEGORY[machineId];
  if (category) {
    for (const [id, c] of Object.entries(MACHINE_CATEGORY)) {
      if (c !== category || seen.has(id)) continue;
      seen.add(id);
      out.push({ route: { kind: "machine", id }, title: data.names(id), why: `Also ${CATEGORY_LABEL[c]}.` });
    }
  }
  return out.slice(0, MAX_RELATED);
}

function machinePage(route: Extract<VaultRoute, { kind: "machine" }>, data: VaultData): VaultPageState {
  const id = route.id;
  const def: MachineCatalogEntry | undefined = data.defs[id];
  const onFloor = data.floor?.find((f) => f.id === id);

  if (!def) {
    // A studio's own machine (sm-…) has no standard and no Academy pages. It
    // is a page when the floor has it; unknown until the floor is read.
    if (onFloor) return ownMachinePage(route, onFloor, data);
    return data.floor === null ? "loading" : "gone";
  }
  if (!data.cards || !data.scripts || !data.overviews || !data.cues) return "loading";

  const am = data.machines.find((m) => m.machineId === id);
  const name = data.names(id);
  const card = am?.cardId ? (data.cards.find((c) => c.id === am.cardId) ?? null) : null;
  const script = am?.scriptId ? (data.scripts.find((s) => s.id === am.scriptId) ?? null) : null;
  const ov = am?.overviewId ? data.overviews.find((o) => o.id === am.overviewId) : undefined;

  const lede = (def.clinicalNote ?? "").trim();
  const tiers = withoutLede(
    codexTiers(
      def,
      { card, script, overview: ov ? { id: ov.id, title: ov.title, blocks: ov.blocks } : null, cues: data.cues },
      { substitutes: substituteNames(id, data), clinical: clinicalFlagsFor(id), machineName: name },
    ),
    lede,
  );

  const code = codeOf(id, am);
  const category = categoryOf(id);
  const sw = switchesOf(def);
  const facts: VaultFact[] = [];
  if (code) facts.push({ label: "Code", value: code });
  if (category) facts.push({ label: "Category", value: category });
  if (am?.workout) facts.push({ label: "Workout", value: workoutWords(am.workout) });
  facts.push({ label: "Begins with", value: sw.beginsWith === "handoff" ? "A handoff" : "A gradual load-up" });
  if (sw.neverToFailure) facts.push({ label: "Failure", value: "Never to failure" });
  facts.push({ label: "Preset", value: presetLine(presetOf(def)) });
  const has = academyHas(am);
  if (has) facts.push({ label: "In the Academy", value: has });

  const page: VaultPage = {
    route,
    target: vaultTarget({ kind: "machine", id }, name),
    eyebrow: [code, category].filter(Boolean).join(" · ") || "Machine",
    title: name,
    sections: tiers.flatMap((t) => t.sections),
    tiers,
    facts,
    related: machineRelated(id, am, data),
  };
  if (lede) page.lede = lede;
  return withNode(page);
}

/**
 * The tiers without a line that only repeats the page's lede (review fix,
 * Oct 19 2026): a machine's clinical note is its lede, under the title in
 * every design, and Deep science opened by saying the same sentence again
 * under "Clinical note". Said once, at the top. A section left with no lines
 * goes; a tier left with none keeps codexTiers' honest empty line.
 */
export function withoutLede(tiers: CodexTier[], lede: string): CodexTier[] {
  const said = lede.trim();
  if (!said) return tiers;
  return tiers.map((tier) => {
    let changed = false;
    const sections: VaultSection[] = [];
    for (const s of tier.sections) {
      const blocks = s.blocks.filter((b) => b.text.trim() !== said);
      if (blocks.length === s.blocks.length) {
        sections.push(s);
        continue;
      }
      changed = true;
      if (blocks.length > 0 || (s.note ?? "").trim()) sections.push({ ...s, blocks });
    }
    if (!changed) return tier;
    if (sections.length === 0) sections.push(vaultSection(`${tier.id}-empty`, tier.title, [], EMPTY_TIER_LINE));
    return { ...tier, sections };
  });
}

/**
 * A machine page that cannot be drawn because the studio's floor could not
 * be read (review fix, Oct 19 2026): a studio's own machine has no standard,
 * so it is a page only once the floor is read, and "unreadable" is final.
 * pageFor still answers "loading" for it (the floor may yet arrive on a
 * retry); a design asks this before it draws a spinner, and says "Can't read
 * {Studio}'s floor right now" with its way back instead of spinning forever.
 */
export function floorUnreadableFor(route: VaultRoute, data: Pick<VaultData, "defs" | "floor" | "floorState">): boolean {
  return route.kind === "machine" && !data.defs[route.id] && data.floor === null && data.floorState === "unreadable";
}


/** A machine a studio made itself: its name and code, and the honest "nothing written yet" of each tier. */
function ownMachinePage(
  route: Extract<VaultRoute, { kind: "machine" }>,
  entry: { id: string; name: string; code: string | null },
  data: VaultData,
): VaultPage {
  // `names` answers the bare id for a machine it does not know; the floor's own name is better than that.
  const named = data.names(entry.id);
  const name = named && named !== entry.id ? named : entry.name || entry.id;
  const tiers = codexTiers({ name }, {}, { machineName: name });
  const facts: VaultFact[] = entry.code ? [{ label: "Code", value: entry.code }] : [];
  return withNode({
    route,
    target: vaultTarget({ kind: "machine", id: entry.id }, name),
    eyebrow: "This studio's own machine",
    title: name,
    sections: tiers.flatMap((t) => t.sections),
    tiers,
    facts,
    related: [],
  });
}

/* ------------------------------------------------------------------ *
 * Academy pages
 * ------------------------------------------------------------------ */

function moduleOf(data: VaultData, moduleId: string) {
  return data.index.modules.find((m) => m.id === moduleId) ?? null;
}

/** The module that holds a topic, by the index. */
function ownerOf(data: VaultData, topicId: string) {
  return data.index.modules.find((m) => m.topics.some((t) => t.id === topicId)) ?? null;
}

function moduleContentOf(data: VaultData, moduleId: string) {
  return data.modules[moduleId] ?? data.cachedModule?.(moduleId) ?? null;
}

/** "Academy 4.6 Turnaround Technique", or "Academy 10 · FAQ" for an unnumbered topic. */
export function topicSourceLabel(moduleN: number, topic: Pick<Topic, "order" | "title">): string {
  return topic.order > 0 && topic.order < 999
    ? `Academy ${moduleN}.${topic.order} ${topic.title}`
    : `Academy ${moduleN} · ${topic.title}`;
}

function modulePage(route: Extract<VaultRoute, { kind: "module" }>, data: VaultData): VaultPageState {
  const mod = moduleOf(data, route.moduleId);
  if (!mod) return "gone";
  // A reader on a module's page usually opens one of its topics next: ask now.
  if (!data.modules[mod.id]) data.loadModule(mod.id);
  const minutes = mod.topics.reduce((sum, t) => sum + t.readingMinutes, 0);
  return withNode({
    route,
    target: vaultTarget({ kind: "academy-module", id: mod.id }, mod.title),
    eyebrow: `Academy module ${mod.n}`,
    title: mod.title,
    lede: mod.blurb,
    sections: [],
    facts: [
      { label: "Topics", value: String(mod.topics.length) },
      { label: "Read", value: readingTime(minutes) },
    ],
    related: mod.topics.map((t) => ({
      route: { kind: "topic", moduleId: mod.id, topicId: t.id },
      title: calmCaps(t.title),
      why: readingTime(t.readingMinutes),
    })),
  });
}

function topicPage(route: Extract<VaultRoute, { kind: "topic" }>, data: VaultData): VaultPageState {
  // The index is the truth about which module holds a topic; a stored route
  // with a stale module still finds it.
  const named = moduleOf(data, route.moduleId);
  const mod = named && named.topics.some((t) => t.id === route.topicId) ? named : ownerOf(data, route.topicId);
  if (!mod) return "gone";
  const content = moduleContentOf(data, mod.id);
  if (!content) {
    data.loadModule(mod.id);
    return "loading";
  }
  const topics = content.topics;
  const at = topics.findIndex((t) => t.id === route.topicId);
  if (at < 0) return "gone";
  const topic = topics[at];
  const moduleTitle = content.title || mod.title;
  // A few topic titles shout ("POSTURE", "MSF OVERVIEW"); a page title never does.
  const title = calmCaps(topic.title);
  const canonical: VaultRoute = { kind: "topic", moduleId: mod.id, topicId: topic.id };

  const related: Related[] = [];
  const next = topics[at + 1];
  const before = topics[at - 1];
  if (next) related.push({ route: { kind: "topic", moduleId: mod.id, topicId: next.id }, title: calmCaps(next.title), why: `Next in ${moduleTitle}.` });
  if (before) related.push({ route: { kind: "topic", moduleId: mod.id, topicId: before.id }, title: calmCaps(before.title), why: `Before this in ${moduleTitle}.` });

  return withNode({
    route: route.moduleId === mod.id ? route : canonical,
    target: vaultTarget({ kind: "academy-topic", id: topic.id, moduleId: mod.id }, title),
    eyebrow: moduleTitle,
    title,
    sections: topicSections(topic.blocks, topicSourceLabel(mod.n, topic)),
    facts: [
      { label: "Module", value: `${mod.n} · ${moduleTitle}` },
      { label: "Read", value: readingTime(topic.readingMinutes) },
    ],
    source: topic.source,
    related,
  });
}

/** The machine an Academy piece belongs to, by the joined rows. */
function machineFor(data: VaultData, pick: (m: AcademyMachine) => boolean): AcademyMachine | undefined {
  return data.machines.find(pick);
}

function cardPage(route: Extract<VaultRoute, { kind: "card" }>, data: VaultData): VaultPageState {
  if (!data.cards) return "loading";
  const card: QuickCard | undefined = data.cards.find((c) => c.id === route.id);
  if (!card) return "gone";
  const am = card.machineId ? machineFor(data, (m) => m.machineId === card.machineId) : undefined;
  const title = card.machineId ? data.names(card.machineId) : cardTitle(card);
  // The machine page labels a card line the same way (codex-reader).
  const source = `Quick Reference Guide · ${card.abbr}`;
  const used = new Set<string>();
  const sections = card.sections.map((s) => {
    const heads = new Set(s.subheads ?? []);
    const blocks = s.items.flatMap((item, i) =>
      item.trim() ? [line(heads.has(i) ? "subheading" : "bullet", item, source)] : [],
    );
    return section(uniqueId(slugOf(s.heading), used), s.heading, blocks);
  });
  const facts: VaultFact[] = [{ label: "Code", value: card.abbr }];
  const category = card.machineId ? categoryOf(card.machineId) : null;
  if (category) facts.push({ label: "Category", value: category });
  if (am?.workout) facts.push({ label: "Workout", value: workoutWords(am.workout) });
  const related: Related[] = [];
  if (card.machineId) related.push(machineLink(card.machineId, data));
  related.push(...academyLinks(am, "card"));
  return withNode(
    {
      route,
      target: vaultTarget({ kind: "academy-card", id: card.id }, title),
      eyebrow: `${card.abbr} · Quick reference card`,
      title,
      sections,
      facts,
      source: `MSF Academy · ${card.abbr} Quick Reference Guide`,
      related,
    },
    card.machineId,
  );
}

/** "Leg Curl - Gap 3 for most – starts at LT, chest up" -> "Gap 3 for most – starts at LT, chest up". */
export function scriptLede(summary: string | undefined): string | null {
  if (!summary) return null;
  const parts = summary.split(/\s[-–—]\s/);
  if (parts.length < 2) return null;
  const rest = parts
    .slice(1)
    .join(" – ")
    .replace(/^[\s\-–—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return rest ? capitaliseFirst(rest) : null;
}

function scriptPage(route: Extract<VaultRoute, { kind: "script" }>, data: VaultData): VaultPageState {
  if (!data.scripts) return "loading";
  const script: MachineScript | undefined = data.scripts.find((s) => s.id === route.id);
  if (!script) return "gone";
  const am = script.machineId ? machineFor(data, (m) => m.machineId === script.machineId) : undefined;
  const title = script.machineId ? data.names(script.machineId) : scriptTitle(script);
  // The same beats, lines and words the machine page's "Script & cues" tier
  // draws (codex-reader), so a line reads, and is keyed, the same in both.
  const sections = scriptSections(script);
  const workout = workoutWords(script.workout);
  const related: Related[] = [];
  if (script.machineId) related.push(machineLink(script.machineId, data));
  related.push(...academyLinks(am, "script"));
  related.push({ route: { kind: "cueing" }, title: "Cueing phrasebook", why: "The Academy's phrases for each moment of a set." });
  const page: VaultPage = {
    route,
    target: vaultTarget({ kind: "academy-script", id: script.id }, title),
    eyebrow: `${workout} · Spoken script`,
    title,
    sections,
    facts: [
      { label: "Code", value: script.abbr },
      { label: "Workout", value: workout },
    ],
    source: `MSF Academy · ${workout} setup and instruction`,
    related,
  };
  const lede = scriptLede(script.summary);
  if (lede) page.lede = lede;
  return withNode(page, script.machineId);
}

function overviewPage(route: Extract<VaultRoute, { kind: "overview" }>, data: VaultData): VaultPageState {
  if (!data.overviews) return "loading";
  const ov = data.overviews.find((o) => o.id === route.id);
  if (!ov) return "gone";
  const am = machineFor(data, (m) => m.overviewId === ov.id);
  const title = am ? data.names(am.machineId) : ov.title;
  const related: Related[] = [];
  if (am) related.push(machineLink(am.machineId, data));
  related.push(...academyLinks(am, "overview"));
  return withNode(
    {
      route,
      target: vaultTarget({ kind: "academy-overview", id: ov.id }, title),
      eyebrow: am?.abbr ? `${am.abbr} · Deep dive` : "Deep dive",
      title,
      sections: overviewSections(ov.blocks, `Academy deep dive · ${ov.title}`),
      facts: [{ label: "Read", value: readingTime(ov.readingMinutes) }],
      source: `MSF Academy · ${ov.title}, comprehensive overview`,
      related,
    },
    am?.machineId,
  );
}

/** Where a glossary or cueing page sends a reader on: a topic, when the index still has it. */
function topicLink(data: VaultData, topicId: string, title: string, why: string): Related[] {
  const mod = ownerOf(data, topicId);
  return mod ? [{ route: { kind: "topic", moduleId: mod.id, topicId }, title, why }] : [];
}

/** The glossary file lists its concept terms first and the equipment terms after (from index 40). */
const EQUIPMENT_FROM = 40;

function glossaryPage(route: Extract<VaultRoute, { kind: "glossary" }>, data: VaultData): VaultPageState {
  if (!data.glossary) return "loading";
  const byLetter = new Map<string, VaultBlock[]>();
  const sorted = data.glossary
    .map((g, i) => ({ ...g, equipment: i >= EQUIPMENT_FROM }))
    .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
  for (const g of sorted) {
    const letter = (g.term.match(/[A-Za-z0-9]/)?.[0] ?? "#").toUpperCase();
    const text = capitaliseFirst(g.definition.trim());
    const list = byLetter.get(letter) ?? [];
    list.push(line("line", text, g.equipment ? "Academy glossary · Equipment" : "Academy glossary", g.term));
    byLetter.set(letter, list);
  }
  const sections = [...byLetter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, blocks]) => section(`letter-${letter.toLowerCase()}`, letter, blocks));
  return withNode({
    route,
    target: vaultTarget({ kind: "academy-glossary" }, "Glossary"),
    eyebrow: "Academy",
    title: "Glossary",
    lede: "The exact words the Academy asks trainers to use.",
    sections,
    facts: [],
    related: [
      ...topicLink(data, "intro-glossary", "Glossary, in the Introduction", "Where these terms come from, and why the exact words matter."),
      { route: { kind: "cueing" }, title: "Cueing phrasebook", why: "What to say, moment by moment." },
    ],
  });
}

function cueingPage(route: Extract<VaultRoute, { kind: "cueing" }>, data: VaultData): VaultPageState {
  if (!data.cues) return "loading";
  const source = CUE_SOURCE_LABEL;
  const sections = data.cues.map((c: CueMoment, i) => {
    const label = cueMomentLabel(c.moment);
    // A phrase that is not words to say (a pointer in capitals, a lead-in
    // ending in a colon, a stage direction in brackets) stays on the page as
    // a plain line, never as a cue (the same test the machine page uses).
    const blocks: VaultBlock[] = [
      ...c.notes.filter((n) => n.trim()).map((n) => line("para", n.trim(), source)),
      ...c.phrases
        .filter((p) => p.trim())
        .map((p) => (isCuePhrase(p) ? line("cue", p.trim(), source) : line("para", calmCaps(p.trim()), source))),
    ];
    return section(`moment-${i}`, label, blocks, label !== c.moment.trim() ? c.moment.trim() : undefined);
  });
  return withNode({
    route,
    target: vaultTarget({ kind: "academy-cueing" }, "Cueing phrasebook"),
    eyebrow: "Academy",
    title: "Cueing phrasebook",
    lede: "What to say, moment by moment through a set.",
    sections,
    facts: [],
    source: "MSF Academy · Exercise Instruction, cues and timing",
    related: [
      ...topicLink(
        data,
        "instruction-exercise-instruction-cues-and-timing",
        "Cues and timing",
        "The same phrases, with the Academy's notes on when to say them.",
      ),
      { route: { kind: "glossary" }, title: "Glossary", why: "The exact words the Academy asks trainers to use." },
      { route: { kind: "quiz", deck: "cues" }, title: "What would you say?", why: "Try the phrases as a quiz." },
    ],
  });
}

/* ------------------------------------------------------------------ *
 * Playbooks
 * ------------------------------------------------------------------ */

function playbookPage(route: Extract<VaultRoute, { kind: "playbook" }>, data: VaultData): VaultPageState {
  const p: PlaybookPage | undefined = data.playbooks.find((x) => x.id === route.id);
  if (!p) return "gone";
  const pillar = data.pillars.find((x) => x.id === p.pillar);
  const used = new Set<string>();
  const sections = p.sections.map((s) =>
    section(
      uniqueId(s.id || slugOf(s.title), used),
      s.title,
      // Each line says where it comes from as a reader says it ("The floor · line 66").
      s.blocks.filter((b) => b.text.trim()).map((b) => line(b.kind, b.text, playbookSourceLabel(b.source))),
    ),
  );
  const page: VaultPage = {
    route,
    target: vaultTarget({ kind: "playbook", id: p.id }, p.title),
    eyebrow: pillar?.title ?? "Life Transformer playbook",
    title: p.title,
    sections,
    facts: [],
    draft: true,
    related: p.related,
  };
  if (p.lede.trim()) page.lede = p.lede.trim();
  const sources = playbookSourcesLine(p);
  if (sources) page.source = sources;
  return withNode(page);
}

/* ------------------------------------------------------------------ *
 * The one door
 * ------------------------------------------------------------------ */

/**
 * The page's node in the knowledge graph. A quick card, a script and a deep
 * dive are pages OF a machine, not nodes of their own (graph.ts), so they
 * stand on their machine's node.
 */
function withNode(page: VaultPage, machineId?: string | null): VaultPage {
  const nodeId = nodeIdForRoute(machineId ? { kind: "machine", id: machineId } : page.route);
  if (nodeId) page.nodeId = nodeId;
  return page;
}

/**
 * The page a route shows: a VaultPage, "loading" while its chunk is not here,
 * or "gone" for an id the corpus no longer has (and for a route that is not
 * a page). Never throws.
 */
export function pageFor(route: VaultRoute, data: VaultData): VaultPageState {
  try {
    switch (route.kind) {
      case "machine":
        return machinePage(route, data);
      case "module":
        return modulePage(route, data);
      case "topic":
        return topicPage(route, data);
      case "card":
        return cardPage(route, data);
      case "script":
        return scriptPage(route, data);
      case "overview":
        return overviewPage(route, data);
      case "glossary":
        return glossaryPage(route, data);
      case "cueing":
        return cueingPage(route, data);
      case "playbook":
        return playbookPage(route, data);
      default:
        return "gone";
    }
  } catch (err) {
    // A malformed corpus entry must cost one page, never the screen.
    console.warn("[learning-vault] could not build a page", route, err);
    return "gone";
  }
}

/**
 * What a route is called in a breadcrumb, a peek sheet's head or a link,
 * without loading anything it does not already have.
 */
export function titleOf(route: VaultRoute, data: VaultData): string {
  switch (route.kind) {
    case "home":
      return "Overview";
    case "catalog":
      return "Catalog";
    case "academy":
      return "Academy";
    case "machine":
      return data.names(route.id);
    case "module":
      return moduleOf(data, route.moduleId)?.title ?? "Academy module";
    case "topic": {
      const mod = ownerOf(data, route.topicId);
      const t = mod?.topics.find((x) => x.id === route.topicId);
      return t ? calmCaps(t.title) : "Academy topic";
    }
    case "card": {
      const am = data.machines.find((m) => m.cardId === route.id);
      if (am) return data.names(am.machineId);
      const card = data.cards?.find((c) => c.id === route.id);
      return card ? (card.machineId ? data.names(card.machineId) : cardTitle(card)) : "Quick reference card";
    }
    case "script": {
      const am = data.machines.find((m) => m.scriptId === route.id);
      if (am) return data.names(am.machineId);
      const script = data.scripts?.find((s) => s.id === route.id);
      return script ? (script.machineId ? data.names(script.machineId) : scriptTitle(script)) : "Spoken script";
    }
    case "overview": {
      const am = data.machines.find((m) => m.overviewId === route.id);
      if (am) return data.names(am.machineId);
      return data.overviews?.find((o) => o.id === route.id)?.title ?? "Deep dive";
    }
    case "glossary":
      return route.term ?? "Glossary";
    case "cueing": {
      const c = route.moment !== undefined ? data.cues?.[route.moment] : undefined;
      return c ? cueMomentLabel(c.moment) : "Cueing phrasebook";
    }
    case "playbook":
      return data.playbooks.find((p) => p.id === route.id)?.title ?? "Playbook";
    case "track":
      return data.tracks.find((t) => t.id === route.id)?.title ?? "Reading path";
    case "quiz":
      return "Quiz";
    case "map":
      return "Map";
    case "queue":
      return "Waiting for review";
  }
}
