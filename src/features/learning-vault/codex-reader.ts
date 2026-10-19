/**
 * THE MACHINE IN FOUR DEPTHS — the codex reader (Learning vault redesign,
 * Oct 19 2026).
 *
 * A machine page in all three prototype designs is one set of sections,
 * grouped by how much time the reader has: the Tactical Codex shows them as
 * a four-tier switcher, the other two in this order. The tiers follow the
 * Codex's own split of its twelve leaves (machine-codex/format.ts: "floor"
 * is needed at the machine, "study" is read between clients):
 *
 *   1 Floor glance      Stop, Set up, Get set, Begin — the iPad in one hand
 *                       at the machine
 *   2 Script & cues     The rep and Finish, the Academy's spoken script beat
 *                       by beat, and the phrasebook's moments that fit how
 *                       this machine turns around
 *   3 Adapt & clinical  If something goes wrong, Adapt, Faults and fixes,
 *                       the client conditions the clinical matrix names here
 *                       (their names only), and the substitutes
 *   4 Deep science      Understand, Program it, the quick card's target
 *                       muscles and synergists, and the Academy's deep dive
 *
 * WHERE THE WORDS COME FROM
 * -------------------------
 * The method lines are the codex's one reader (methodLines), so this page,
 * the editor's Sources view and Compare can never list different lines. Each
 * line says where it comes from: the source an administrator recorded for
 * it (sourceLabel), else "Machine definition" — the seed's prose is lifted
 * from the setup guides, which the codex source check calls "guide only",
 * so the page does not claim the Academy for a line nobody has checked.
 * The Academy's own pieces (the script, the phrasebook, the card, the deep
 * dive) say so on every line.
 *
 * EVERY LINE IS MARKABLE
 * ----------------------
 * Every block's key is blockKeyFor(its words), so a studio's crossing-out
 * stays on the line it was made on. A line's words appear once on a page:
 * "Barely touch, barely start" is both a key cue and a phrasebook line on
 * the Leg Press, and one tap must select one line, so the second is left
 * out. A section with nothing left in it is left out; a tier with nothing at
 * all keeps one honest line ("Nothing written for this machine yet."), as
 * its section's note, so it carries no mark of its own.
 *
 * PURE MODULE: no React, no Firestore. The Academy pieces arrive as
 * arguments (the source files never import the corpus JSON).
 */

import type { MachineDefinition } from "../../types/machines";
import { machineName as standardMachineName } from "../academy/academy-machines";
import type { CueMoment, MachineScript, QuickCard } from "../academy/types";
import { CODEX_LEAVES, methodLines, sourceLabel, switchesOf, type LeafId, type MethodLine } from "../machine-codex/format";
import { blockKeyFor, toVaultBlocks, vaultSection } from "./blocks";
import { CUE_SOURCE_LABEL, CUE_TITLES, findCueMoment, isCuePhrase, lowerCueKeys, repShapeOf, type CueKey } from "./rep-phases";
import type { CodexTier, CodexTierId, VaultBlock, VaultBlockKind, VaultSection } from "./types";

/* ------------------------------------------------------------------ *
 * The four tiers
 * ------------------------------------------------------------------ */

export const TIER_TITLES: Record<CodexTierId, string> = {
  glance: "Floor glance",
  script: "Script & cues",
  adapt: "Adapt & clinical",
  science: "Deep science",
};

export const TIER_ORDER: readonly CodexTierId[] = ["glance", "script", "adapt", "science"];

const TIER_N: Record<CodexTierId, 1 | 2 | 3 | 4> = { glance: 1, script: 2, adapt: 3, science: 4 };

/** The codex leaves each tier reads, in order. Leaf 12 ("On our floor") is computed elsewhere. */
export const TIER_LEAVES: Record<CodexTierId, readonly LeafId[]> = {
  glance: ["stop", "setup", "getset", "begin"],
  script: ["rep", "finish"],
  adapt: ["wrong", "adapt", "faults"],
  science: ["understand", "program"],
};

/** What a tier with nothing in it says. */
export const EMPTY_TIER_LINE = "Nothing written for this machine yet.";

/** A method line with no recorded source: the machine's definition is where it comes from. */
export const MACHINE_DEFINITION_SOURCE = "Machine definition";

/** The clinical matrix, named on each condition's line. */
export const CLINICAL_SOURCE = "Clinical matrix";

/** Exercise Substitutes (Academy 6; routine-builder/academy.ts EXERCISE_SUBSTITUTES). */
export const SUBSTITUTES_SOURCE = "Academy 6 · Exercise Substitutes";

/* ------------------------------------------------------------------ *
 * Small pieces, each tested on its own
 * ------------------------------------------------------------------ */

function block(kind: VaultBlockKind, text: string, extra?: { label?: string; source?: string }): VaultBlock | null {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return null;
  const b: VaultBlock = { key: blockKeyFor(t), kind, text: t };
  if (extra?.label) b.label = extra.label;
  if (extra?.source) b.source = extra.source;
  return b;
}

function present<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

/** A method line as a markable line: its label, its words, and where they come from. */
export function lineBlock(line: MethodLine): VaultBlock | null {
  return block("line", line.text, {
    label: line.label,
    source: line.source ? sourceLabel(line.source) : MACHINE_DEFINITION_SOURCE,
  });
}

function leafTitle(leaf: LeafId): string {
  return CODEX_LEAVES.find((l) => l.id === leaf)?.title ?? leaf;
}

function leafSections(lines: MethodLine[], leaves: readonly LeafId[]): VaultSection[] {
  return leaves.map((leaf) =>
    vaultSection(
      `leaf-${leaf}`,
      leafTitle(leaf),
      lines
        .filter((l) => l.leaf === leaf)
        .map(lineBlock)
        .filter(present),
    ),
  );
}

/**
 * A script beat's name as a title. The corpus writes them in capitals
 * joined by "+" ("LOAD UP + FIRST CONCENTRIC"); the page says
 * "Load up · first concentric" (no new capitals, type-voice.test.ts).
 */
export function beatTitle(beat: string): string {
  const parts = (beat ?? "")
    .split("+")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const joined = parts.join(" · ");
  return joined ? joined.charAt(0).toUpperCase() + joined.slice(1) : "";
}

/** "Spine / Trunk / Core" for the corpus's "SpineTrunkCore" (academy.md §2). */
export function workoutWords(workout: string): string {
  const w = (workout ?? "").trim();
  if (/^spine\s*\/?\s*trunk\s*\/?\s*core$/i.test(w.replace(/\s+/g, ""))) return "Spine / Trunk / Core";
  return w;
}

/**
 * A spoken script line, tidied only where the corpus left a stray: a closing
 * curly quote with no opening one (the generator strips the opening quote of
 * a spoken line, so "…parallel to each other.”  (NOTE: …" keeps its
 * closer), and a run of spaces. The words themselves are the Academy's.
 */
export function tidyScriptLine(text: string): string {
  let t = typeof text === "string" ? text : "";
  if (t.includes("\u201D") && !t.includes("\u201C")) t = t.replace(/\u201D/g, "");
  return t.replace(/\s{2,}/g, " ").trim();
}

/** The script's beats, one section each: spoken lines are "said", the trainer's actions "do". */
export function scriptSections(script: MachineScript | null | undefined): VaultSection[] {
  if (!script || !Array.isArray(script.beats)) return [];
  const source = `Academy script · ${workoutWords(script.workout)}`;
  return script.beats.map((b, i) =>
    vaultSection(
      `beat-${i}`,
      beatTitle(b.beat) || `Beat ${i + 1}`,
      (b.lines ?? []).map((l) => block(l.spoken ? "said" : "do", tidyScriptLine(l.text), { source })).filter(present),
      i === 0 ? source : undefined,
    ),
  );
}

/**
 * The phrasebook's moments that fit how this machine runs: how it begins
 * (a load-up or a handoff), its upper turn (at an end stop, or with a
 * squeeze) and its lower turn (where the stack touches, or not), in the
 * order the set meets them. The lower turn is the codex switch when one is
 * recorded, else the moment whose examples name the machine, else both.
 */
export function cueKeysFor(
  def: Partial<MachineDefinition> | null | undefined,
  cues: readonly CueMoment[] | null | undefined,
  machineName?: string,
): CueKey[] {
  const s = switchesOf(def);
  const shape = repShapeOf(def);
  const begin: CueKey = s.beginsWith === "handoff" ? "handoff" : "loadUp";
  const upper: CueKey =
    s.upperTurn === "passThrough" || s.upperTurn === "hardStop"
      ? "upperEndStop"
      : s.upperTurn === "pauseSqueeze"
        ? "upperSqueeze"
        : shape === "endStop"
          ? "upperEndStop"
          : "upperSqueeze";
  const lower = lowerCueKeys(s.lowerTurn, cues, machineName ?? def?.name);
  return shape === "handoff" ? [begin, ...lower, upper] : [begin, upper, ...lower];
}

/** One phrasebook moment as a section: its explanations as paragraphs, then the lines to say. */
export function cueSection(cues: readonly CueMoment[], index: number, key: CueKey): VaultSection | null {
  const m = cues[index];
  if (!m) return null;
  const notes = (m.notes ?? []).map((n) => block("para", n, { source: CUE_SOURCE_LABEL }));
  const phrases = (m.phrases ?? []).filter(isCuePhrase).map((p) => block("cue", p, { source: CUE_SOURCE_LABEL }));
  return vaultSection(`moment-${index}`, CUE_TITLES[key], [...notes, ...phrases].filter(present));
}

function cueSections(
  def: Partial<MachineDefinition>,
  cues: readonly CueMoment[] | null | undefined,
  machineName?: string,
): VaultSection[] {
  if (!cues || cues.length === 0) return [];
  const out: VaultSection[] = [];
  const used = new Set<number>();
  for (const key of cueKeysFor(def, cues, machineName)) {
    const i = findCueMoment(cues, key);
    if (i < 0 || used.has(i)) continue;
    used.add(i);
    const s = cueSection(cues, i, key);
    if (!s || s.blocks.length === 0) continue;
    // The phrasebook names itself once, under its first moment.
    out.push(out.length === 0 ? vaultSection(s.id, s.title, s.blocks, CUE_SOURCE_LABEL) : s);
  }
  return out;
}

/** A machine id read as its standard name; anything else is already a name. */
function substituteName(entry: string): string {
  const e = (entry ?? "").trim();
  if (/^(m|sm)-[a-z0-9-]+$/i.test(e)) return standardMachineName(e) ?? e;
  return e;
}

/**
 * The Academy's substitute sets: each line is machines that together stand
 * in for this one ("All of these together replace the main exercise").
 */
export function substituteSection(sets: readonly (readonly string[])[] | null | undefined): VaultSection | null {
  if (!sets || sets.length === 0) return null;
  const blocks = sets
    .map((set) => (set ?? []).map(substituteName).filter(Boolean).join(" + "))
    .map((text) => block("bullet", text, { source: SUBSTITUTES_SOURCE }))
    .filter(present);
  if (blocks.length === 0) return null;
  return vaultSection("substitutes", "Substitutes", blocks, "Each line, all together, stands in for it");
}

/**
 * The client conditions the clinical matrix names for this machine, by name
 * only: the matrix's instructions are for a client's own watch-outs in the
 * session, never a teaching page (the round's contract, A2: "labels only").
 */
export function clinicalSection(flags: readonly { id: string; label: string }[] | null | undefined): VaultSection | null {
  if (!flags || flags.length === 0) return null;
  const seen = new Set<string>();
  const blocks: VaultBlock[] = [];
  for (const f of flags) {
    const label = typeof f?.label === "string" ? f.label.trim() : "";
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const b = block("bullet", label, { source: CLINICAL_SOURCE });
    if (b) blocks.push(b);
  }
  if (blocks.length === 0) return null;
  return vaultSection(
    "clinical",
    "When a client has one of these",
    blocks,
    "The clinical matrix names this machine for each; a client's watch-outs say what to do",
  );
}

/** One of the quick card's sections, by its heading, as bullets. */
function cardSection(card: QuickCard | null | undefined, heading: RegExp, id: string, title: string): VaultSection | null {
  if (!card || !Array.isArray(card.sections)) return null;
  const section = card.sections.find((s) => heading.test((s.heading ?? "").trim()));
  if (!section) return null;
  const source = `Quick Reference Guide · ${card.abbr}`;
  const blocks = (section.items ?? []).map((item) => block("bullet", item, { source })).filter(present);
  return blocks.length ? vaultSection(id, title, blocks) : null;
}

/** A heading the corpus wrote in capitals ("NOTES"), said in sentence case. */
function sentenceCaseShout(text: string): string {
  const t = (text ?? "").trim();
  if (!/[A-Z]/.test(t) || /[a-z]/.test(t)) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** The Academy's deep dive (overviews.json) for this machine, whole, as one section. */
export function deepDiveSection(
  overview: { id: string; title: string; blocks: { kind: string; text: string }[] } | null | undefined,
): VaultSection | null {
  if (!overview || !Array.isArray(overview.blocks)) return null;
  const tidy = overview.blocks.map((b) =>
    b && (b.kind === "heading" || b.kind === "subheading") ? { kind: b.kind, text: sentenceCaseShout(b.text) } : b,
  );
  const blocks = toVaultBlocks(tidy, { source: `Academy deep dive · ${overview.title}` });
  return blocks.length ? vaultSection("deep-dive", "Deep dive", blocks, `Academy · ${overview.title}`) : null;
}

/* ------------------------------------------------------------------ *
 * The reader
 * ------------------------------------------------------------------ */

/**
 * A machine's page in four tiers, glance first. `def` is the machine as the
 * studio reads it (a resolved copy, a studio's own, or the seed); `academy`
 * is whatever the Academy has for it, each piece optional; `opts` carries
 * what the caller already worked out (the substitute sets, the clinical
 * conditions that name this machine, its name on the floor).
 */
export function codexTiers(
  def: Partial<MachineDefinition>,
  academy: {
    card?: QuickCard | null;
    script?: MachineScript | null;
    overview?: { id: string; title: string; blocks: { kind: string; text: string }[] } | null;
    cues?: CueMoment[] | null;
  },
  opts?: { substitutes?: string[][]; clinical?: { id: string; label: string }[]; machineName?: string },
): CodexTier[] {
  const d: Partial<MachineDefinition> = def ?? {};
  const lines = methodLines(d);
  const name = opts?.machineName ?? d.name;

  const raw: Record<CodexTierId, (VaultSection | null)[]> = {
    glance: leafSections(lines, TIER_LEAVES.glance),
    script: [
      ...leafSections(lines, TIER_LEAVES.script),
      ...scriptSections(academy?.script),
      ...cueSections(d, academy?.cues, name),
    ],
    adapt: [
      ...leafSections(lines, TIER_LEAVES.adapt),
      clinicalSection(opts?.clinical),
      substituteSection(opts?.substitutes),
    ],
    science: [
      ...leafSections(lines, TIER_LEAVES.science),
      cardSection(academy?.card, /^target muscles$/i, "card-target", "Target muscles"),
      cardSection(academy?.card, /^synergists$/i, "card-synergists", "Synergists"),
      deepDiveSection(academy?.overview),
    ],
  };

  // One line, once per page: the first place it appears keeps it.
  const seen = new Set<string>();
  return TIER_ORDER.map((id): CodexTier => {
    const sections: VaultSection[] = [];
    for (const s of raw[id]) {
      if (!s) continue;
      const blocks = s.blocks.filter((b) => {
        if (seen.has(b.key)) return false;
        seen.add(b.key);
        return true;
      });
      if (blocks.length === 0) continue;
      sections.push(vaultSection(s.id, s.title, blocks, s.note));
    }
    if (sections.length === 0) sections.push(vaultSection(`${id}-empty`, TIER_TITLES[id], [], EMPTY_TIER_LINE));
    return { id, n: TIER_N[id], title: TIER_TITLES[id], sections };
  });
}

/** Every section of a machine page in reading order (glance first), for the designs that do not switch tiers. */
export function codexSections(tiers: readonly CodexTier[]): VaultSection[] {
  return tiers.flatMap((t) => t.sections);
}
