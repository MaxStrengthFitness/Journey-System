/**
 * QUESTIONS THE ACADEMY'S OWN DATA CAN ASK — built, not written.
 *
 * Round: the Learning vault redesign, Oct 19 2026.
 *
 * The Academy is already structured (src/features/academy/content/*.json,
 * generated from docs/msf-academy/), and some of it is regular enough to ask
 * about mechanically and never be wrong: a glossary term and its first
 * sentence, a cue and the moment it belongs to, the order of a first rep in
 * the machine scripts, which machines begin with a handoff, which two are
 * never taken to failure, and a card that names exactly one target muscle.
 * Everything else is written by hand in authored.ts, with its quote.
 *
 * WHAT KEEPS A BUILT QUESTION HONEST (quiz-sources.md §2 and §5)
 * --------------------------------------------------------------
 * - Glossary: 42 of 52 definitions contain their own term, so the term (and
 *   its acronym and its other names) is masked in the stem. Four first
 *   sentences do not define anything ("arguably the most pervasive…") and are
 *   left out. Terms that define each other (Concentric / Positive, the three
 *   failures) are never offered as each other's wrong answers.
 * - Cues: the three strings in the phrase lists that are not cues are left
 *   out, the two lower and the two upper turnarounds are one moment each
 *   (they differ by machine, so either would be "right"; Read it still opens
 *   the one that holds the phrase), and moments that share phrases
 *   (motivation and apparent failure, speed and the turns) are never offered
 *   as each other's wrong answers. A bracket naming the machines stays on its
 *   cue ("Bend your elbows faster (row or pulldown)").
 * - Scripts: the first rep comes in three shapes; Pullover's script stops
 *   after the squeeze, so it is asked about with no other machine.
 * - Every wrong answer is picked by a hash of the question, never at random,
 *   so the bank is the same every time it is built.
 *
 * PURE MODULE — no React, no Firestore, no JSON import (the data arrives as
 * arguments, from the Academy's lazy loaders).
 */

import type { CueMoment, MachineScript, QuickCard } from "../../academy/types";
import type { MachineDefinition } from "../../../types/machines";
import type { QuizSource, VaultRoute } from "../types";
import type { QuizItem } from "./decks";

/* ------------------------------------------------------------------ *
 * Where each built fact comes from (every path is checked by a test)
 * ------------------------------------------------------------------ */

export const GLOSSARY_PATH =
  "docs/msf-academy/Academy/Academy 1 - Introduction/Academy - Intro 2 - Glossary.txt";
export const CUES_PATH =
  "docs/msf-academy/Academy/Academy 9 - Exercise Instruction/Academy - Exercise Instruction - Cues and Timing.txt";
export const CATEGORIES_PATH = "docs/msf-academy/Academy 2/Exercise Categories (posture_execution_gaps).txt";
export const SCRIPT_FILES: Record<string, string> = {
  "Lower Body": "docs/msf-academy/Workout Setups and Instruction/MSF Lower Body - setup and instruction.txt",
  SpineTrunkCore: "docs/msf-academy/Workout Setups and Instruction/MSF Spine_Trunk_Core - setup and instruction.txt",
  "Upper Body": "docs/msf-academy/Workout Setups and Instruction/MSF Upper Body - setup and instruction.txt",
};
const QRG = "docs/msf-academy/Initial Setups (Comprehensive Overview)/Quick Reference Guides/";
export const CARD_FILES: Record<string, string> = {
  abd: `${QRG}Abd – Quick Reference Guide.txt`,
  abs: `${QRG}Abs – Quick Reference Guide.txt`,
  add: `${QRG}Add – Quick Reference Guide.txt`,
  bi: `${QRG}Bi – Quick Reference Guide.txt`,
  cf: `${QRG}CF – Quick Reference Guide.txt`,
  cp: `${QRG}CP -Quick Reference Guide.txt`,
  cr: `${QRG}CR - Quick Reference Guide.txt`,
  cx: `${QRG}Cx – Quick Reference Guide.txt`,
  lc: `${QRG}LC – Quick Reference Guide.txt`,
  le: `${QRG}LE – Quick Reference Guide.txt`,
  lp: `${QRG}LP – Quick Reference Guide.txt`,
  lumb: `${QRG}Lumb – Quick Reference Guide.txt`,
  oh: `${QRG}OH - Quick Reference Guide.txt`,
  pd: `${QRG}Pd - Quick Reference Guide.txt`,
  po: `${QRG}PO – Quick Reference Guide.txt`,
  sd: `${QRG}SD – Quick Reference Guide.txt`,
  sr: `${QRG}SR – Quick Reference Guide.txt`,
  tr: `${QRG}TR – Quick Reference Guide.txt`,
};

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** FNV-1a 32: a stable number from a string, for picking wrong answers. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function slugOf(text: string, max = 48): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/g, "") || "x";
}

/**
 * `n` distinct items from `list`, chosen by `salt` and nothing else: the
 * same salt always picks the same items, and different salts spread across
 * the list. Fewer than `n` when the list is shorter.
 */
export function pickDistinct<T>(list: readonly T[], n: number, salt: string): T[] {
  if (list.length <= n) return list.slice();
  const h = hashOf(salt);
  const start = h % list.length;
  // A stride that shares no factor with the length visits every item once.
  let stride = 1 + (Math.floor(h / list.length) % Math.max(1, list.length - 1));
  while (gcd(stride, list.length) !== 1) stride++;
  const out: T[] = [];
  for (let i = 0; out.length < n && i < list.length; i++) {
    out.push(list[(start + i * stride) % list.length]);
  }
  return out;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function endWithStop(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------------------------------------------ *
 * The glossary
 * ------------------------------------------------------------------ */

/** First sentences that do not define their term: left out of the quiz. */
export const GLOSSARY_SKIP: ReadonlySet<string> = new Set([
  "Assumed vs. Real Objective (of exercise)",
  "Failure (Fatigue)",
  "Stretch",
  "Range of Motion (of machine)",
]);

/**
 * Terms close enough that one is never offered as the other's wrong answer.
 * By term, as the glossary writes it.
 */
const GLOSSARY_FAMILIES: string[][] = [
  ["Concentric", "Positive"],
  ["Eccentric", "Negative"],
  ["Momentary Muscular Failure", "True Muscular Failure", "Failure (Fatigue)", "Fatigue"],
  ["Pace", "Speed"],
  ["Intent (Purpose)", "Purpose"],
  ["Timed Static Contraction (TSC)", "Static Hold"],
  ["Range of Motion (ROM)", "Range of Motion (of machine)"],
  ["Intensity", "High Intensity"],
  ["Force", "Force-Velocity Relationship"],
  ["Movement Arm (or Work Arm)", "Carriage"],
  ["End Stop", "Upper Turnaround (Upper Turn)"],
  ["Main stack", "Accessory stack"],
  ["Contract(ion)", "Tension (also Mechanical Tension or Muscular Tension)"],
];

function familyOf(term: string): Set<string> {
  const out = new Set<string>([term]);
  for (const f of GLOSSARY_FAMILIES) if (f.includes(term)) for (const t of f) out.add(t);
  return out;
}

/**
 * A term as a reader sees it: "Contract(ion)" reads "Contraction", an
 * acronym stays ("Timed Static Contraction (TSC)"), and the rest of a
 * parenthesis goes ("Bushing (oil impregnated bronze bushing)" reads
 * "Bushing").
 */
export function displayTerm(term: string): string {
  const t = term.trim();
  const glued = /^(.*\w)\((\w+)\)$/.exec(t);
  if (glued) return glued[1] + glued[2];
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(t);
  if (!m) return t;
  const inner = m[2].trim();
  // An acronym stays, and so does a one-word other name the definition uses
  // ("Bone Density (Remodeling)" is defined as remodeling).
  if (/^[A-Z]{2,5}$/.test(inner) || /^[A-Z][a-z]+$/.test(inner)) return `${m[1]} (${inner})`;
  return m[1];
}

/** Every name a term goes by, longest first: the term, its acronym, its other names. */
function namesOfTerm(term: string): string[] {
  const t = term.trim();
  const names = new Set<string>();
  const glued = /^(.*\w)\((\w+)\)$/.exec(t);
  if (glued) {
    names.add(glued[1] + glued[2]);
    names.add(glued[1]);
  } else {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(t);
    if (m) {
      names.add(m[1].trim());
      for (const part of m[2].split(/\/|\bor\b|,/)) {
        const p = part.replace(/^\s*also\s+/i, "").trim();
        if (p.length >= 2) names.add(p);
      }
      // A one-word other name goes with the term's first word too: "Bone
      // Density (Remodeling)" is defined as "Bone remodeling is…", and a stem
      // reading "Bone ____ is…" would point at the one option starting "Bone".
      const inner = m[2].trim();
      if (/^[A-Z][a-z]+$/.test(inner)) names.add(`${m[1].trim().split(/\s+/)[0]} ${inner}`);
    } else {
      names.add(t);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

/**
 * The text up to its first sentence end: a full stop, ! or ? followed by
 * space and a capital (so "i.e. the actual lifting" does not end one).
 *
 * NO REGEX LOOKBEHIND here or anywhere in this folder: older iPadOS Safari
 * throws when it PARSES one, which takes the whole chunk down
 * (src/lib/first-sentences.ts has the story). A lookahead is safe.
 */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = /[.!?] (?=[A-Z(“"])/.exec(flat);
  const one = end ? flat.slice(0, end.index + 1) : flat;
  return endWithStop(capitalise(one));
}

/**
 * The sentence after the first, when there is a usable one: the card's
 * explanation, so turning it over teaches the next thing rather than
 * repeating the stem. Null for a one-sentence definition or a "See also".
 */
export function secondSentence(text: string): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = /[.!?] (?=[A-Z(“"])/.exec(flat);
  if (!end) return null;
  const next = firstSentence(flat.slice(end.index + 2));
  if (next.length < 20 || next.length > 260 || /^see also/i.test(next)) return null;
  return next;
}

/** The sentence with every name of the term blanked out. */
export function maskTerm(sentence: string, term: string): string {
  let out = sentence;
  for (const name of namesOfTerm(term)) {
    const words = name.split(/\s+/).map(escapeRe).join("\\s+");
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9])${words}(?![A-Za-z0-9])`, "gi"), "$1____");
  }
  // A blank followed by its own acronym, or by a second blank, is one blank:
  // "is the ____ (SH)" gives the initials away, and "a ____ (____)" reads oddly.
  out = out.replace(/____\s*\((?:____|[A-Z]{2,5})\)/g, "____");
  return out;
}

/** Sentences of a short text, without a lookbehind (see firstSentence). */
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let rest = text.replace(/\s+/g, " ").trim();
  while (rest.length > 0) {
    const end = /[.!?] /.exec(rest);
    if (!end) {
      out.push(rest);
      break;
    }
    out.push(rest.slice(0, end.index + 1));
    rest = rest.slice(end.index + 2);
  }
  return out;
}

const glossarySource = (term: string): QuizSource => ({
  label: `Academy glossary · ${displayTerm(term)}`,
  route: { kind: "glossary", term },
  path: GLOSSARY_PATH,
});

export function glossaryQuestions(glossary: { term: string; definition: string }[] | null): QuizItem[] {
  if (!glossary || glossary.length === 0) return [];
  const eqStart = glossary.findIndex((g) => g.term === "Accessory stack");
  const eqFrom = eqStart >= 0 ? eqStart : 40;
  const entries = glossary.map((g, i) => ({
    term: g.term,
    display: displayTerm(g.term),
    sentence: firstSentence(g.definition),
    more: secondSentence(g.definition),
    equipment: i >= eqFrom,
  }));
  const usable = entries.filter((e) => !GLOSSARY_SKIP.has(e.term) && e.sentence.length >= 20);
  const out: QuizItem[] = [];

  for (const e of usable) {
    const masked = maskTerm(e.sentence, e.term);
    const words = masked.replace(/____/g, " ").split(/\s+/).filter(Boolean);
    if (words.length < 5 || masked.length > 260) continue;
    const family = familyOf(e.term);
    const same = usable.filter((o) => !family.has(o.term) && o.equipment === e.equipment);
    const others = same.length >= 3 ? same : usable.filter((o) => !family.has(o.term));
    const wrong = pickDistinct(
      others.map((o) => o.display),
      3,
      `g:${e.term}`,
    );
    if (wrong.length < 3) continue;
    out.push({
      id: `g-${slugOf(e.term)}`,
      deck: "glossary",
      kind: "choice",
      prompt: `Which term is this? “${masked}”`,
      options: [e.display, ...wrong],
      answer: 0,
      explain: `${e.display}: ${e.more ?? e.sentence}`,
      source: glossarySource(e.term),
      fact: `glossary:${e.term}`,
    });
  }

  // Equipment or method: the glossary ends with the machine's own words.
  const methodWords = usable.filter((e) => !e.equipment && e.term !== "Range of Motion (ROM)");
  for (const e of usable) {
    if (!e.equipment || e.term === "Axis of rotation") continue;
    const wrong = pickDistinct(
      methodWords.map((m) => m.display),
      3,
      `ge:${e.term}`,
    );
    if (wrong.length < 3) continue;
    out.push({
      id: `ge-${slugOf(e.term)}`,
      deck: "glossary",
      kind: "choice",
      prompt: "Which of these is one of the Academy's equipment words, not a word for the method?",
      options: [e.display, ...wrong],
      answer: 0,
      explain: `${e.display} is in the glossary's equipment list: ${e.sentence}`,
      source: glossarySource(e.term),
      fact: `glossary:${e.term}`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The cueing phrasebook
 * ------------------------------------------------------------------ */

type CueGroupId =
  | "load"
  | "handoff"
  | "speed"
  | "confirm"
  | "face"
  | "lower"
  | "upper"
  | "final"
  | "unload"
  | "motivation"
  | "failure";

interface CueGroup {
  id: CueGroupId;
  /** The moment's heading starts with this (case-insensitive), as the build script matches them. */
  prefix: string;
  label: string;
  ask: string;
  explain: string;
}

/**
 * The phrasebook's moments, each with a short name a button can hold (the
 * headings run to 299 characters). The two lower turnarounds share one
 * entry, and so do the two upper ones.
 */
export const CUE_GROUPS: CueGroup[] = [
  {
    id: "load",
    prefix: "to begin the exercise (gradual load up",
    label: "The start: a gradual load up",
    ask: "Which of these would you say to begin a gradual load up?",
    explain: "It begins a pushing movement: force builds gradually before anything moves.",
  },
  {
    id: "handoff",
    prefix: "to begin the exercise - pulling",
    label: "The start: after a handoff",
    ask: "Which of these would you say just after a handoff?",
    explain: "It follows the handoff on a pulling movement, as the first lowering begins.",
  },
  {
    id: "speed",
    prefix: "speed of motion",
    label: "Keeping the pace",
    ask: "Which of these is about keeping the pace?",
    // The list itself has "Slightly faster" and "Slow – SLOWER", and "Be
    // continuous but do not rush".
    explain: "It is a speed-of-motion cue: one steady pace, slowed or quickened until it is right, never rushed.",
  },
  {
    id: "confirm",
    prefix: "confirmation of good technique",
    label: "Confirming good technique",
    ask: "Which of these tells a client that rep was right?",
    explain: "It confirms good technique, so the client knows that rep was the one.",
  },
  {
    id: "face",
    prefix: "facial expressions",
    // Named for the whole list: it holds "Stay calm", "Don't panic" and
    // "Stoic" as well as the face and the jaw.
    label: "A calm, relaxed face",
    ask: "Which of these would you say for a calm, relaxed face?",
    explain: "It is a facial-expression cue: a calm, relaxed face and a loose jaw.",
  },
  {
    id: "lower",
    prefix: "lower turnaround",
    label: "The lower turnaround",
    ask: "Which of these would you say at the lower turnaround?",
    explain: "It is a lower turnaround cue: change direction at the bottom without a pause.",
  },
  {
    id: "upper",
    prefix: "upper turnaround",
    label: "The upper turnaround",
    ask: "Which of these would you say at the upper turnaround?",
    // The end stop is clicked too ("Pass through my click at the top").
    explain:
      "It is an upper turnaround cue: touch and go through the click at an end stop, or the squeeze, then the click to ease out, on the others.",
  },
  {
    id: "final",
    prefix: "final descent",
    label: "The final descent",
    ask: "Which of these would you say for the final descent?",
    explain: "It is for the final descent, the last lowering of the set.",
  },
  {
    id: "unload",
    prefix: "carefully unload",
    label: "Unloading at the end",
    ask: "Which of these would you say to unload at the end?",
    explain: "It is for unloading carefully once the set is over.",
  },
  {
    id: "motivation",
    prefix: "motivation",
    label: "Motivation, as it gets hard",
    ask: "Which of these would you say as the set gets hard?",
    explain: "It is motivation: more effort to keep the pace as the set gets hard.",
  },
  {
    id: "failure",
    prefix: "at the moment of apparent task failure",
    label: "Apparent task failure",
    ask: "Which of these would you say at apparent task failure?",
    explain: "It is for the moment of apparent task failure.",
  },
];

/**
 * Moments that share words: never each other's wrong answer. Every moment
 * keeps at least five others to draw wrong answers from (generate.test.ts).
 *
 * - upper / failure: on every machine but the four end-stop presses, a set
 *   ends holding the last rep at the top while the trainer counts down
 *   (Exercise Categories), and "Head still, keep breathing as you increase
 *   effort" sits beside "Head stays still...push harder".
 * - speed / final, upper / final: the final descent's own cue is "do not
 *   speed up", like "Don't speed up" and "Ease out, DO NOT speed up".
 * - handoff / lower, handoff / final: the handoff's cues are slow lowerings
 *   ("Slowly allow your arms to lengthen"), on the very machines whose lower
 *   turnaround cues are "most effectively used during the eccentric".
 * - load / upper: "Build your force, increase your respirations" is the load
 *   up's "With breath, gradually apply force" in other words.
 */
const CUE_CONFUSABLE: [CueGroupId, CueGroupId][] = [
  ["load", "handoff"],
  ["speed", "motivation"],
  ["speed", "lower"],
  ["speed", "upper"],
  ["lower", "upper"],
  ["motivation", "failure"],
  ["confirm", "motivation"],
  ["final", "unload"],
  ["final", "failure"],
  ["face", "failure"],
  ["upper", "failure"],
  ["speed", "final"],
  ["upper", "final"],
  ["handoff", "lower"],
  ["handoff", "final"],
  ["load", "upper"],
];

function confusable(a: CueGroupId, b: CueGroupId): boolean {
  return a === b || CUE_CONFUSABLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Strings in the phrase lists that are not things to say (quiz-sources.md §2.2). */
const NOT_CUES: ReadonlySet<string> = new Set([
  "SEE INDIVIDUAL EXERCISE SCRIPTS FOR MORE SPECIFIC EXAMPLES",
  "After the loading transfer near contracted position (i.e. “handoff”):",
  "(Change vocal tone, excited but not loud, almost whisper, accentuate key words)",
]);

/**
 * Cues that would fit almost any moment, so no single answer is fair. "Keep
 * it moving" (an upper turnaround cue) fits keeping the pace and motivation
 * just as well ("Keep your speed, don't let it bog down").
 */
const TOO_GENERAL: ReadonlySet<string> = new Set([
  "Breathe Freely",
  "Be meticulous",
  "Be sneaky about it",
  "Calm",
  "Keep it moving",
]);

/**
 * A phrase as a quiz shows it: stage directions in brackets dropped, spacing
 * tidied. A bracket that names the machines stays, because without it the cue
 * says something else: "Bend your elbows faster (row or pulldown)" is not a
 * cue for every machine.
 */
export function cleanCue(phrase: string): string {
  return phrase
    .replace(/\s*\(([^)]*)\)/g, (_whole: string, inner: string) =>
      /\b(row|pulldown)\b/i.test(inner) ? ` (${inner})` : "",
    )
    .replace(/\s+([,.!?…])/g, "$1")
    .replace(/…\s*,\s*/g, "… ")
    .replace(/,\s*,/g, ",")
    .replace(/:\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cueGroupOf(moment: string): CueGroup | null {
  const m = moment.trim().toLowerCase();
  return CUE_GROUPS.find((g) => m.startsWith(g.prefix)) ?? null;
}

function isCue(phrase: string): boolean {
  if (NOT_CUES.has(phrase) || TOO_GENERAL.has(phrase.trim())) return false;
  if (phrase.trim().startsWith("(") || phrase.trim().endsWith(":")) return false;
  const letters = phrase.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 10 && letters === letters.toUpperCase()) return false;
  return cleanCue(phrase).length >= 2;
}

/** A phrase as the quiz shows it, and the phrasebook moment (its index) that holds it. */
interface CuePhrase {
  text: string;
  moment: number;
}

export function cueQuestions(cues: CueMoment[] | null): QuizItem[] {
  if (!cues || cues.length === 0) return [];
  // Two moments share a group (the two lower turnarounds, the two upper
  // ones), so each phrase keeps the moment it came from: Read it opens the
  // moment that holds the words, not the group's first one.
  const groups = new Map<CueGroupId, { group: CueGroup; phrases: CuePhrase[] }>();
  cues.forEach((c, i) => {
    const group = cueGroupOf(c.moment);
    if (!group) return;
    const slot = groups.get(group.id) ?? { group, phrases: [] };
    for (const p of c.phrases) {
      if (!isCue(p)) continue;
      const clean = cleanCue(p);
      if (!slot.phrases.some((x) => x.text === clean)) slot.phrases.push({ text: clean, moment: i });
    }
    groups.set(group.id, slot);
  });

  const present = CUE_GROUPS.filter((g) => (groups.get(g.id)?.phrases.length ?? 0) > 0);
  const source = (id: CueGroupId, moment: number): QuizSource => ({
    label: `Cueing phrasebook · ${groups.get(id)?.group.label ?? ""}`,
    route: { kind: "cueing", moment },
    path: CUES_PATH,
  });
  const out: QuizItem[] = [];
  const seen = new Set<string>();

  for (const g of present) {
    const slot = groups.get(g.id);
    if (!slot) continue;
    const far = present.filter((o) => !confusable(o.id, g.id));
    slot.phrases.forEach((phrase, n) => {
      const wrong = pickDistinct(
        far.map((o) => o.label),
        3,
        `c:${phrase.text}`,
      );
      if (wrong.length < 3) return;
      let id = `c-${g.id}-${slugOf(phrase.text, 36)}`;
      if (seen.has(id)) id = `${id}-${n}`;
      seen.add(id);
      out.push({
        id,
        deck: "cues",
        kind: "choice",
        prompt: `When would you say this? “${phrase.text}”`,
        options: [g.label, ...wrong],
        answer: 0,
        explain: g.explain,
        source: source(g.id, phrase.moment),
        fact: `cue:${phrase.text.toLowerCase()}`,
      });
    });

    // One the other way round: the moment named, the words to pick.
    const answer = slot.phrases[hashOf(`cr:${g.id}`) % slot.phrases.length];
    const groupsForWrong = pickDistinct(far, 3, `cr:${g.id}`);
    const wrong = groupsForWrong
      .map((o) => {
        const ps = groups.get(o.id)?.phrases ?? [];
        return ps.length > 0 ? ps[hashOf(`cr:${g.id}:${o.id}`) % ps.length].text : null;
      })
      .filter((p): p is string => p !== null);
    if (wrong.length === 3) {
      out.push({
        id: `cr-${g.id}`,
        deck: "cues",
        kind: "choice",
        prompt: g.ask,
        options: [answer.text, ...wrong],
        answer: 0,
        explain: g.explain,
        source: source(g.id, answer.moment),
        fact: `cue:${answer.text.toLowerCase()}`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The first rep, from the machine scripts
 * ------------------------------------------------------------------ */

/** The scripts' beat names, as a reader says them. */
export const BEAT_LABEL: Record<string, string> = {
  SETUP: "Set up",
  "LOAD UP + FIRST CONCENTRIC": "Load up, then the first lift",
  "UPPER TURN": "The upper turn",
  "UPPER TURN + PAUSE/SQUEEZE": "The upper turn, with the pause or squeeze",
  "FIRST ECCENTRIC + LOWER TURN": "The first lowering, then the lower turn",
  "HANDOFF + FIRST ECCENTRIC": "The handoff, then the first lowering",
  "LOWER TURN + FIRST CONCENTRIC + PAUSE/SQUEEZE": "The lower turn, the first lift, then the pause or squeeze",
  "SECOND ECCENTRIC": "The second lowering",
};

type ScriptShape = "endStop" | "squeeze" | "handoff";

const SHAPE_WHY: Record<ScriptShape, string> = {
  endStop: "There is no pause or squeeze at the top on these machines: the upper turn touches the end stop and goes.",
  squeeze: "These machines pause at the top on the first reps, and squeeze from the third.",
  handoff: "These begin with a handoff, so the first movement is a lowering, not a lift.",
};

const SHAPE_ASK: Record<ScriptShape, string> = {
  endStop: "a machine with no pause or squeeze at the top",
  squeeze: "a machine with a pause or squeeze at the top",
  handoff: "a machine that begins with a handoff",
};

function shapeOfBeats(beats: string[]): ScriptShape {
  if (beats.some((b) => b.startsWith("HANDOFF"))) return "handoff";
  if (beats.includes("UPPER TURN + PAUSE/SQUEEZE")) return "squeeze";
  return "endStop";
}

export function scriptQuestions(scripts: MachineScript[] | null, names: (machineId: string) => string): QuizItem[] {
  if (!scripts || scripts.length === 0) return [];
  const bySignature = new Map<string, MachineScript[]>();
  for (const s of scripts) {
    const beats = s.beats.map((b) => b.beat.trim());
    if (beats.length < 3 || beats.some((b) => !BEAT_LABEL[b])) continue;
    const sig = beats.join(" > ");
    const list = bySignature.get(sig) ?? [];
    list.push(s);
    bySignature.set(sig, list);
  }
  const out: QuizItem[] = [];
  for (const [sig, list] of bySignature) {
    // A shape one machine has alone is that script's own quirk (Pullover
    // stops after the squeeze), not a shape to teach.
    if (list.length < 2) continue;
    const beats = sig.split(" > ");
    const shape = shapeOfBeats(beats);
    const machineNames = list.map((s) => (s.machineId ? names(s.machineId) : s.abbr));
    const prompt =
      machineNames.length <= 5
        ? `Put the first rep in order on the ${listWords(machineNames)}.`
        : `Put the first rep in order on ${SHAPE_ASK[shape]}, like the ${machineNames[0]} or the ${machineNames[1]}.`;
    const first = list[0];
    const firstName = machineNames[0];
    out.push({
      id: `s-${shape}-${slugOf(sig, 40)}`,
      deck: "rep",
      kind: "order",
      prompt,
      options: beats.map((b) => BEAT_LABEL[b]),
      answer: -1,
      explain: SHAPE_WHY[shape],
      source: {
        label: `${first.workout === "SpineTrunkCore" ? "Spine, trunk and core" : first.workout} script · ${firstName}`,
        route: { kind: "script", id: first.id },
        path: SCRIPT_FILES[first.workout],
      },
      fact: `beats:${shape}`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The machines: how each begins, what is never done, what it targets
 * ------------------------------------------------------------------ */

type DefMap = Record<string, Partial<MachineDefinition>>;

/**
 * A card's never-to-failure line, and the (up to two) lines straight after
 * it that speak to failure or intensity: the card's own reason. On the
 * Cervical Extension card that is "NEVER train to failure", "Stop the set
 * before technical failure", "Prioritize control and safety over intensity";
 * the Lumbar card's one line already carries its precaution. Empty when the
 * card has no such line.
 */
export function neverLinesOf(card: QuickCard | null | undefined): string[] {
  const items = card?.sections.flatMap((s) => s.items) ?? [];
  const k = items.findIndex((t) => /\bnever\b/i.test(t) && /\bfailure\b/i.test(t));
  if (k < 0) return [];
  return [items[k], ...items.slice(k + 1, k + 3).filter((t) => /\b(failure|intensity)\b/i.test(t))];
}

function sorted(ids: string[], names: (id: string) => string): string[] {
  return ids.slice().sort((a, b) => names(a).localeCompare(names(b)) || a.localeCompare(b));
}

export function machineQuestions(
  defs: DefMap,
  cards: QuickCard[] | null,
  names: (machineId: string) => string,
): QuizItem[] {
  const out: QuizItem[] = [];
  const known = Object.keys(defs).filter((id) => typeof defs[id]?.execution?.requiresHandoff === "boolean");
  const cardFor = new Map<string, QuickCard>();
  for (const c of cards ?? []) if (c.machineId) cardFor.set(c.machineId, c);
  const machineRoute = (id: string): VaultRoute => ({ kind: "machine", id });

  // Which machines begin with a handoff (execution.requiresHandoff).
  const handoff = sorted(
    known.filter((id) => defs[id]?.execution?.requiresHandoff === true),
    names,
  );
  const loadUp = sorted(
    known.filter((id) => defs[id]?.execution?.requiresHandoff === false),
    names,
  );
  for (const id of handoff) {
    const wrong = pickDistinct(loadUp, 3, `mh:${id}`);
    if (wrong.length < 3) continue;
    const name = names(id);
    out.push({
      id: `m-handoff-${slugOf(id)}`,
      deck: "machines",
      kind: "choice",
      prompt: "Which of these machines begins with a handoff, not a gradual load up?",
      options: [name, ...wrong.map(names)],
      answer: 0,
      explain: `The ${name} begins with a handoff. The ${names(wrong[0])} starts from a dead stop with a gradual load up.`,
      source: { label: `${name} · how it begins`, route: machineRoute(id), path: CATEGORIES_PATH },
      fact: "machine:handoff",
    });
  }

  // Never to failure (execution.neverToFailure: Lumbar and Cervical Extension).
  const never = sorted(
    known.filter((id) => defs[id]?.execution?.neverToFailure === true),
    names,
  );
  const toFailure = sorted(
    known.filter((id) => defs[id]?.execution?.neverToFailure !== true),
    names,
  );
  for (const id of never) {
    const wrong = pickDistinct(toFailure, 3, `mn:${id}`);
    if (wrong.length < 3) continue;
    const name = names(id);
    const card = cardFor.get(id);
    // The Academy card's own line when it has one ("NEVER train to
    // failure"), with the card's next lines when they say why (the floor's
    // rule: a never-to-failure machine carries its reason, because an
    // unexplained prohibition gets ignored; the-floor.md:27). Else the first
    // sentence of the definition's notice.
    const cardLines = neverLinesOf(card);
    const notice = sentencesOf((defs[id]?.execution?.safetyNotice ?? "").replace(/^\s*safety notice:\s*/i, ""))[0];
    out.push({
      id: `m-never-${slugOf(id)}`,
      deck: "machines",
      kind: "choice",
      prompt: "Which of these machines is never taken to failure?",
      options: [name, ...wrong.map(names)],
      answer: 0,
      explain:
        cardLines.length > 0
          ? `Its Quick Reference card says: “${cardLines.map((l) => l.trim().replace(/[.;:,]+$/, "")).join(". ")}.”`
          : notice || `The ${name} is never taken to failure.`,
      source: {
        label: `${name} · safety`,
        route: machineRoute(id),
        path: card ? CARD_FILES[card.id] : undefined,
      },
      fact: "machine:never-to-failure",
    });
  }

  // A card that names exactly one target muscle.
  const withMachine = (cards ?? []).filter((c) => c.machineId);
  for (const card of withMachine) {
    const targets = (card.sections.find((s) => s.heading === "Target Muscles")?.items ?? []).filter(
      (t) => !t.trim().startsWith("→"),
    );
    if (targets.length !== 1 || !card.machineId) continue;
    const parts = targets[0].split(/\s[–-]\s|:\s*/);
    const muscle = parts[0]?.trim() ?? "";
    const action = (parts[1] ?? "").trim();
    if (!muscle || !action) continue;
    const key = muscle.split(/\s+/)[0].toLowerCase();
    const mentions = (c: QuickCard) =>
      c.sections
        .filter((s) => s.heading === "Target Muscles" || s.heading === "Synergists")
        .some((s) => s.items.some((i) => i.toLowerCase().includes(key)));
    const others = withMachine.filter((c) => c.id !== card.id && !mentions(c)).map((c) => c.machineId as string);
    const wrong = pickDistinct(sorted(others, names), 3, `mt:${card.id}`);
    if (wrong.length < 3) continue;
    const name = names(card.machineId);
    const doing = action.toLowerCase().replace(/\s*\/\s*/g, " and ");
    out.push({
      id: `m-target-${card.id}`,
      deck: "machines",
      kind: "choice",
      prompt: `Which machine's card names one target muscle: the ${muscle}, for ${doing}?`,
      options: [name, ...wrong.map(names)],
      answer: 0,
      explain: `The ${name} card names the ${muscle} as its one target muscle (${doing}).`,
      source: {
        label: `${name} · Quick Reference card`,
        route: { kind: "card", id: card.id },
        path: CARD_FILES[card.id],
      },
      fact: `target:${card.id}`,
    });
  }
  return out;
}
