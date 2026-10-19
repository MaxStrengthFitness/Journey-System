/**
 * THE VAULT'S ENTITIES — every word in Learning that is also a thing.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes).
 *
 * WHY THIS EXISTS
 * ---------------
 * Today's Academy links glossary terms and nothing else (wiki/glossary-links:
 * "the thing that makes prose feel like a wiki"). A trainer reading "the
 * handoff on the Pulldown" still has to leave the page to find out what the
 * handoff is, or which machine "PO" means. Design 2 (the Living Vault) makes
 * every named thing in the prose open a small card where it was tapped, and
 * every card's own words open the next one: the nested tooltip of a strategy
 * game, three deep at most.
 *
 * So one index holds every kind of thing a word can mean, each with ONE id:
 *
 *   term:<lower term>       the Academy glossary (52), its own definition
 *   machine:<m-id>          the twenty machines, by the Catalog's name, the
 *                           Academy's own names for them, and their code
 *   rule:<id>               the method's named rules (RULE_ENTITIES), each
 *                           summary QUOTED from a named Academy topic
 *   clinical:<flag id>      the clinical matrix, by condition name only
 *   topic:<topic id>        the Academy's 98 topics (a few link from prose)
 *   playbook:<id>           the Life Transformer playbooks (drafts)
 *
 * THE MATCHER KEEPS glossary-links' FOUR GOOD RULES
 * -------------------------------------------------
 * 1. Whole words, and nothing under four letters: "Gap" never links, "Rep"
 *    never matches inside "repeat".
 * 2. Longest first: "lower turnaround" beats "turnaround", "continuous
 *    tension" beats "continuous".
 * 3. First appearance only, at most six links a passage: past that the links
 *    stop carrying information.
 * 4. A term with a parenthetical is also found by its bare word: "Failure
 *    (Fatigue)" links "failure".
 *
 * And adds two of its own:
 * 5. CODES ARE CASE-SENSITIVE. A machine's Academy code links only when it is
 *    written in capitals as a whole word: "LP" is the Leg Press, "lp" and
 *    "help" are nothing. Codes that are ordinary words in capitals are left
 *    out: ADD (the Hip Adduction's script code) and, with it, ABD and ABS.
 *    The mixed-case codes (Abd, Pd, Lumb, Cx, Bi, Tri) never link, because
 *    "Add" and "Bi" are words.
 * 6. ONE OWNER PER WORD. Where two things claim the same words, the first
 *    registered keeps them: the method's rules, then the glossary, then the
 *    machines, the clinical flags, the topics and the playbooks. So "static
 *    hold" opens the rule (its topic, quoted), and the rule's card points on
 *    to the glossary's own entry; nothing links two ways.
 *
 * WHAT A CARD SAYS
 * ----------------
 * Every summary is the source's own words, and says which source:
 * - a term: the first sentence (or two) of its glossary definition, verbatim
 *   bar the capital the "Term - definition" layout took away;
 * - a machine: the Catalog's one line under its name (clinicalNote), plus
 *   what its definition records (a handoff start, never to failure);
 * - a rule: a quotation from the Academy topic it names (a test proves every
 *   quotation is in the JSON);
 * - a clinical flag: its group and how many machines it names, NEVER the
 *   matrix's instruction text, which has lines the Sep 28 source check calls
 *   unsourced and still waits on AJ's ruling;
 * - a topic: its module and the module's one-line description;
 * - a playbook: its lede (a draft, waiting on head office).
 *
 * PURE MODULE: no React, no Firestore. Built once per glossary and memoised by
 * the caller, never per paragraph (glossary-links: a 200-term alternation
 * compiled 400 times while a module renders is real jank on an iPad).
 */

import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { ClinicalSafetyFlag } from "../../types";
import type { AcademyMachine } from "../academy/academy-machines";
import type { IndexModule } from "../academy/types";
import { DB_KEY_TO_CANONICAL } from "../catalog/machine-identity";
import type { LinkedSegment, PlaybookPage, VaultEntity, VaultRoute } from "./types";

/* ------------------------------------------------------------------ *
 * The rules of the matcher
 * ------------------------------------------------------------------ */

/** Below this, a word matches too much to be worth linking (glossary-links' MIN_LENGTH). */
export const ENTITY_MIN_LENGTH = 4;
/** Per passage. Past this the links stop being signal (glossary-links' MAX_LINKS). */
export const MAX_LINKS = 6;
/** A card's own summary links fewer: it is two sentences, not a page. */
export const CARD_SUMMARY_LINKS = 4;
/**
 * How many connected things a card offers under its words. Four: a card is a
 * glance, and six chips on a 360px card is a list to read (the full web of
 * connections is the constellation's job).
 */
export const CARD_CONNECTED_MAX = 4;
/** Three cards deep, then the next replaces the third (the contract's depth). */
export const CONCEPT_DEPTH = 3;

/**
 * The index. `byId` is the contract; the rest is the matcher, built once.
 * An alias maps lower-cased words to the one entity that owns them; a code
 * maps exact capitals to theirs.
 */
export interface EntityIndex {
  byId: Map<string, VaultEntity>;
  /** Lower-cased words -> entity id. First writer wins (rule 6). */
  readonly aliases: Map<string, string>;
  /** Exact-case code -> entity id ("LP" -> "machine:m-leg-press"). */
  readonly codes: Map<string, string>;
  /** `\b(longest|...|shortest)\b`, flags gi. Null when nothing links. */
  readonly aliasPattern: RegExp | null;
  /** `\b(LP|CP|...)\b`, flag g only: codes are case-sensitive (rule 5). */
  readonly codePattern: RegExp | null;
}

/* ------------------------------------------------------------------ *
 * The method's named rules (each summary quoted; entities.test proves it)
 * ------------------------------------------------------------------ */

function topicRoute(moduleId: string, topicId: string): VaultRoute {
  return { kind: "topic", moduleId, topicId };
}

/**
 * The method's named rules. Each summary is a QUOTATION from the Academy
 * topic its route opens (whitespace aside: the corpus has the odd double
 * space), so a card never says something the Academy does not.
 * `entities.test.ts` imports the module JSON and fails if any quotation is not
 * in its topic, or if a related id names nothing.
 *
 * Kept off the list on purpose: a rep count as a rule ("the Academy advises 6
 * to 10" is a range, never a target; docs/business/the-floor.md), starting
 * weights (no house starting weight), and anything the Sep 28 source check
 * calls contradicted.
 */
export const RULE_ENTITIES: VaultEntity[] = [
  {
    id: "rule:four-ps",
    kind: "rule",
    label: "The four P's",
    aliases: ["four p's", "four p’s", "4 p's", "4 p’s", "four ps", "4 ps"],
    summary:
      "The 4 P's - Posture, Pace, Path, Purpose - What to look for at a high level when instructing or performing proper resistance training.",
    route: topicRoute("intro", "intro-posture-path-pace-purpose"),
    related: [
      "term:posture",
      "term:pace",
      "term:path",
      "term:purpose",
      "topic:mastery-posture",
      "topic:mastery-pace",
      "topic:mastery-path",
      "topic:mastery-purpose",
    ],
    source: "Academy · Introduction · Posture, Path, Pace, Purpose",
  },
  {
    id: "rule:continuous-tension",
    kind: "rule",
    label: "The Continuous Tension Method",
    aliases: ["continuous tension method", "continuous tension protocol", "continuous tension"],
    summary:
      "A Continuous Tension repetition involves lifting the resistance in 6 to 10 seconds (the positive or concentric phase of movement) and lowering the resistance in 6 to 10 seconds (the negative or eccentric phase of movement).",
    route: topicRoute("continuous-tension", "continuous-tension-performing-the-continuous-tension-method"),
    related: [
      "rule:repetition-cycle",
      "rule:turnarounds",
      "term:continuous",
      "term:tension (also mechanical tension or muscular tension)",
      "topic:continuous-tension-about-our-continuous-tension-method",
    ],
    source: "Academy · Continuous Tension Method · Performing the Continuous Tension Method",
  },
  {
    id: "rule:repetition-cycle",
    kind: "rule",
    label: "The repetition cycle",
    aliases: ["repetition cycle", "repetition cycles", "rep cycle"],
    summary:
      "An approximate 12 to 20-second repetition cycle, consisting of a 6 to 10-second positive, followed by a brief pause in the contracted position or continuous upper turnaround, and then a 6 to 10-second negative, followed by a continuous lower turnaround, appears to be adequately slow for this purpose.",
    route: topicRoute("performance", "performance-speed-of-movement"),
    related: [
      "rule:continuous-tension",
      "rule:squeeze",
      "term:pace",
      "term:speed",
      "topic:performance-components-of-a-repetition",
    ],
    source: "Academy · Exercise Performance · Speed of Movement",
  },
  {
    id: "rule:gradual-load-up",
    kind: "rule",
    label: "The gradual load up",
    aliases: ["gradual load up", "gradual load-up", "gradual loadup", "gradual load ups", "load up", "load-up"],
    summary:
      "As the name implies, a gradual load up needs to happen gradually. This is different than slowly. Slowly refers to the speed at which we are moving. Gradual indicates a graded or incrementally increasing effort.",
    route: topicRoute("mastery", "mastery-gradual-load-up"),
    related: ["term:gradual", "rule:handoff", "topic:performance-gradual-load-up", "rule:repetition-cycle"],
    source: "Academy · Mastery Series · Gradual Load Up",
  },
  {
    id: "rule:handoff",
    kind: "rule",
    label: "The handoff",
    aliases: ["handoff", "handoffs", "hand-off", "hand-offs", "resistance transfer", "loading transfer"],
    summary:
      "There are several instances during the course of a workout where there will require a transfer of resistance between the instructor and the subject. These will primarily be the Cervical Extension, Compound Row, Pulldown, Pullover, and Abdominals.",
    route: topicRoute("further", "further-resistance-transfer-techniques"),
    related: [
      "machine:m-neck",
      "machine:m-compound-row",
      "machine:m-pulldown",
      "machine:m-pullover",
      "machine:m-abs",
      "rule:gradual-load-up",
      "rule:static-hold",
    ],
    source: "Academy · Further Reading · Resistance Transfer Techniques",
  },
  {
    id: "rule:turnarounds",
    kind: "rule",
    label: "Turnarounds",
    aliases: ["turnaround", "turnarounds", "turnaround technique"],
    summary:
      "Turnaround performance should prevent the unloading of target muscles and avoid placing the involved joints or muscular structures in potentially harmful positions.",
    route: topicRoute("performance", "performance-turnaround-technique"),
    related: [
      "term:lower turnaround (lower turn/bottom)",
      "term:upper turnaround (upper turn)",
      "rule:squeeze",
      "term:end stop",
      "topic:mastery-lower-turnarounds",
    ],
    source: "Academy · Exercise Performance · Turnaround Technique",
  },
  {
    id: "rule:squeeze",
    kind: "rule",
    label: "The squeeze",
    aliases: ["squeeze technique", "squeeze", "squeezes"],
    summary:
      "When we instruct you to squeeze, we are looking for you to continue the contraction of the targeted muscle (not the hands).",
    route: topicRoute("mastery", "mastery-squeeze-technique"),
    related: [
      "rule:turnarounds",
      "term:upper turnaround (upper turn)",
      "topic:performance-turnaround-technique",
      "term:contract(ion)",
    ],
    source: "Academy · Mastery Series · Squeeze Technique",
  },
  {
    id: "rule:tsc",
    kind: "rule",
    label: "Timed Static Contraction (TSC)",
    aliases: ["timed static contraction", "timed static contractions"],
    codes: ["TSC"],
    summary:
      "As the name implies, a Timed Static Contraction (TSC) is an approach to strength training that involves applying an effort without movement.",
    route: topicRoute("variations", "variations-timed-static-contraction-tsc"),
    related: ["term:timed static contraction (tsc)", "rule:static-hold"],
    source: "Academy · Variations on the Protocol · Timed Static Contraction (TSC)",
  },
  {
    id: "rule:static-hold",
    kind: "rule",
    label: "Static Hold (SH)",
    aliases: ["static hold", "static holds"],
    codes: ["SH"],
    summary:
      "A closely related method of static strength training to a Timed Static Contraction (TSC) but not as conservative is the Static Hold (SH). While safer than dynamic exercise, it is potentially more risky than a TSC because during a Static Hold, the subject is actually holding or supporting a load.",
    route: topicRoute("variations", "variations-static-hold-sh"),
    related: ["term:static hold", "rule:tsc", "rule:handoff"],
    source: "Academy · Variations on the Protocol · Static Hold (SH)",
  },
  {
    id: "rule:forced-reps",
    kind: "rule",
    label: "Forced reps",
    aliases: ["forced reps", "forced rep", "forced repetitions"],
    summary:
      "This technique should be used RARELY and only by a seasoned instructor. There is risk to both the client and the trainer in this situation and an abundance of caution is required.",
    route: topicRoute("variations", "variations-forced-reps"),
    related: ["rule:drop-sets", "term:momentary muscular failure", "term:intensity"],
    source: "Academy · Variations on the Protocol · Forced Reps",
  },
  {
    id: "rule:drop-sets",
    kind: "rule",
    label: "Drop sets",
    aliases: ["drop sets", "drop set"],
    summary:
      "A drop set is performed by briefly pausing to reduce the weight by an appropriate amount after the maximum tolerable perception of effort has been reached to enable the trainee to continue.",
    route: topicRoute("variations", "variations-drop-sets"),
    related: ["rule:forced-reps", "term:momentary muscular failure"],
    source: "Academy · Variations on the Protocol · Drop Sets",
  },
  {
    id: "rule:stimulating-reps",
    kind: "rule",
    label: "The Stimulating Reps model",
    aliases: ["stimulating reps model", "stimulating reps", "stimulating repetitions"],
    summary:
      "The Stimulating Reps model, developed by Chris Beardsley, explains which repetitions in a strength training set actually stimulate muscle growth and strength gains.",
    route: topicRoute("principles", "principles-productive-exercise-the-stimulating-reps-model"),
    related: [
      "term:tension (also mechanical tension or muscular tension)",
      "term:motor unit recruitment (mur)",
      "term:inroad",
      "term:momentary muscular failure",
    ],
    source: "Academy · Basic Principles of Exercise · Productive Exercise - The Stimulating Reps Model",
  },
  {
    id: "rule:clicker",
    kind: "rule",
    label: "The clicker",
    aliases: ["clicker", "clickers"],
    summary:
      "Obviously there is a quantitative measure associated with the clicker and we record the number of repetitions performed. But what should be emphasized here is that only worthy repetitions are recorded.",
    route: topicRoute("further", "further-registering-performance-use-of-the-clicker"),
    related: ["rule:repetition-cycle", "rule:squeeze", "rule:turnarounds"],
    source: "Academy · Further Reading · Registering Performance - Use of the Clicker",
  },
  {
    id: "rule:valsalva",
    kind: "rule",
    label: "The Valsalva maneuver",
    aliases: ["valsalva maneuver", "valsalva manoeuvre", "valsalva"],
    summary:
      "The most important of the other factors is the prevention of the Valsalva maneuver. The Valsalva is an instinctive mechanism whereby the subject will hold their breath while simultaneously exerting physically.",
    route: topicRoute("continuous-tension", "continuous-tension-other-factors-to-consider"),
    related: ["rule:continuous-tension", "term:exercise induced headache (eih)", "topic:mastery-breathing"],
    source: "Academy · Continuous Tension Method · Other Factors to Consider",
  },
];

/* ------------------------------------------------------------------ *
 * Machines: the words a machine is known by
 * ------------------------------------------------------------------ */

/**
 * The Academy's own names for a machine, beside the Catalog's ("Chest Flye"
 * for CHEST/PEC FLY, "Cervical Extension" for CX (4 WAY NECK), "Torso Arm"
 * for the Pulldown). Every word here is a deep-dive title, the part of one
 * before or inside its brackets, a script's opening name or a card's title:
 * entities.test checks each against the corpus, so nothing is invented.
 *
 * Left out on purpose, because in running prose they name a muscle or a
 * movement, not the machine: "Abdominals", "Abduction", "Adduction",
 * "Lumbar", "Biceps", "Triceps".
 */
export const ACADEMY_MACHINE_WORDS: Readonly<Record<string, readonly string[]>> = {
  "m-leg-curl": ["Leg Curl"],
  "m-ext": ["Leg Extension"],
  "m-leg-press": ["Leg Press"],
  "m-neck": ["Cervical Extension"],
  "m-lumbar": ["Lumbar Extension"],
  "m-torso-rotation": ["Torso Rotation"],
  "m-bicep": ["Biceps Curl"],
  "m-chest-fly": ["Chest Flye"],
  "m-chest-press": ["Chest Press"],
  "m-compound-row": ["Compound Row"],
  "m-lateral-raise": ["Lateral Raise"],
  "m-overhead-press": ["Overhead Press"],
  "m-pulldown": ["Pulldown", "Torso Arm"],
  "m-pullover": ["Pullover"],
  "m-dip": ["Seated Dip"],
  "m-simple-row": ["Simple Row"],
  "m-tricep-ext": ["Triceps Extension"],
};

/**
 * A one-word machine name that is also a body part or a movement. "LUMBAR"
 * and "BICEP" are the Catalog's names for two machines, but "the lumbar
 * spine" and "a bicep" in the Academy's prose are not about the machine.
 */
const MACHINE_WORD_DENY = new Set([
  "lumbar",
  "bicep",
  "biceps",
  "tricep",
  "triceps",
  "abdominals",
  "abdominal",
  "abs",
  "abduction",
  "adduction",
  "neck",
  "chest",
  "back",
  "legs",
  "row",
  "press",
  "curl",
  "extension",
  "rotation",
  "dip",
  "fly",
  "flye",
]);

/**
 * Capitals that are ordinary words: never a code, even where the Academy
 * writes one (the Hip Adduction's script says "ADD").
 */
const CODE_DENY = new Set(["ADD", "ABD", "ABS", "AND", "THE", "FOR", "NOT", "ALL"]);

/** An Academy code that links: two to four capitals (rule 5). */
export function isLinkableCode(code: string | null | undefined): code is string {
  return !!code && /^[A-Z]{2,4}$/.test(code) && !CODE_DENY.has(code);
}

/**
 * The words a machine's display name gives: the name, the name without its
 * bracket, and a bracket that is itself a name ("CX (4 WAY NECK)"); never a
 * lone body part, and never a one-word bracket, which is a maker or a model
 * ("Leg Press (Hammer)" must not link every "hammer", nor "(Nautilus)" the
 * Academy's history of Arthur Jones).
 */
export function machineNameWords(name: string): string[] {
  const out: string[] = [];
  const whole = (name ?? "").trim();
  if (!whole) return out;
  const parens = [...whole.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter((p) => p.split(/\s+/).length >= 2);
  const bare = whole.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  for (const candidate of [whole, bare, ...parens]) {
    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (words.length === 1 && MACHINE_WORD_DENY.has(words[0].toLowerCase())) continue;
    out.push(candidate);
  }
  return out;
}

/** The second sentence of a machine card: what its definition records, in plain words. */
function machineFacts(machineId: string): string[] {
  const exec = MACHINE_DEFINITIONS[machineId]?.execution;
  const out: string[] = [];
  if (exec?.requiresHandoff) out.push("It starts with a handoff.");
  if (exec?.neverToFailure) out.push("It is never taken to failure.");
  return out;
}

/** Method entities a machine's definition points at: its start and its upper turnaround. */
function machineMethodLinks(machineId: string): string[] {
  const exec = MACHINE_DEFINITIONS[machineId]?.execution;
  if (!exec) return [];
  const out: string[] = [];
  if (exec.requiresHandoff) out.push("rule:handoff");
  else out.push("rule:gradual-load-up");
  // The squeeze machines pause at the top; the others (LP, CP, OH, SD: the
  // Academy's end-stop group, cues.json moment 8) are continuous there.
  if (exec.upperTurnaround?.style === "pause-squeeze") out.push("rule:squeeze");
  else if (exec.upperTurnaround) out.push("term:end stop");
  return out;
}

/* ------------------------------------------------------------------ *
 * Clinical flags: names only
 * ------------------------------------------------------------------ */

/** A word inside a condition's name that would mislead in running prose. */
const CLINICAL_WORD_DENY = new Set(["stroke", "unrepaired"]);

/**
 * The words that link to a clinical flag: the condition name split at its
 * slashes, brackets taken off ("Osteoporosis", "Severe Osteopenia"); a
 * bracket that is itself a name ("Scoliosis", "Neck Pain"); never an
 * abbreviation, a number or a qualifier ("Resting BP > 180/100 mmHg").
 * The "Common constraints" flags ("Knee limitation") link only by their whole
 * name: split, "Elbow / wrist / hand limitation" would link every "wrist".
 */
export function clinicalAliases(flag: Pick<ClinicalSafetyFlag, "category" | "conditionName" | "label">): string[] {
  const name = (flag.label ?? flag.conditionName ?? "").trim();
  if (!name) return [];
  if (/common constraints/i.test(flag.category ?? "")) return [name];
  const parens = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const stripped = name.replace(/\s*\([^)]*\)/g, "");
  const parts = stripped.split("/").map((p) => p.trim());
  for (const inner of parens) {
    for (const p of inner.split("/").map((x) => x.trim())) {
      // A name in Title Case, not an abbreviation and not a qualifier.
      if (/^[A-Z][A-Za-z'-]+(?: [A-Z][A-Za-z'-]+)*$/.test(p) && !/^[A-Z]+$/.test(p)) parts.push(p);
    }
  }
  return parts.filter((p) => p.length >= ENTITY_MIN_LENGTH && !CLINICAL_WORD_DENY.has(p.toLowerCase()));
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "It names four machines." in words up to ten, so the card reads as a sentence. */
function machinesSentence(count: number): string {
  const n = count <= 10 ? NUMBER_WORDS[count] : String(count);
  return `It names ${n} ${count === 1 ? "machine" : "machines"}.`;
}

/** The canonical machine ids a flag names (the matrix stores database keys; KNOWN-TRAPS). */
export function clinicalMachineIds(flag: Pick<ClinicalSafetyFlag, "protocolHandling">): string[] {
  const out: string[] = [];
  for (const handling of flag.protocolHandling ?? []) {
    for (const raw of handling.affectedMachineIds ?? []) {
      const id = DB_KEY_TO_CANONICAL[raw] ?? raw;
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** A clinical card's words: its group and its count, never the instruction text. */
export function clinicalSummary(flag: Pick<ClinicalSafetyFlag, "category" | "protocolHandling">): string {
  const group = (flag.category ?? "").trim();
  const lead = group ? `A clinical flag in the matrix's ${group} group.` : "A clinical flag in the matrix.";
  return `${lead} ${machinesSentence(clinicalMachineIds(flag).length)}`;
}

/* ------------------------------------------------------------------ *
 * Glossary terms
 * ------------------------------------------------------------------ */

/** The entity id of a glossary term: the same key the graph uses ("term:<lower term>"). */
export function termEntityId(term: string): string {
  return `term:${term.trim().toLowerCase()}`;
}

/** Abbreviations whose full stop does not end a sentence. */
const NOT_AN_END = /(?:\bi\.e|\be\.g|\bvs|\betc|\bapprox|\bex|\bdr|\bmr|\bmrs|\bms)$/i;

/**
 * A passage cut into its sentences, verbatim (whitespace squashed). A full
 * stop ends a sentence only before a capital (or the end), and never after
 * "i.e." or "vs.", so "(i.e. the actual lifting of the weight)." stays inside
 * its sentence.
 */
export function sentencesOf(text: string): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  const re = /[.!?]["”’')]?(?=\s+["“‘(]?[A-Z0-9]|\s*$)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    if (m[0][0] === "." && NOT_AN_END.test(clean.slice(0, m.index))) continue;
    const end = m.index + m[0].length;
    out.push(clean.slice(start, end).trim());
    start = end;
  }
  const rest = clean.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * The first sentence of a passage, or the first two when the first is short,
 * verbatim. `stopAt` ends the passage early at a sentence it matches (a
 * glossary entry's "See also", which a card shows as connections instead).
 */
export function firstSentences(text: string, opts: { short?: number; max?: number; stopAt?: RegExp } = {}): string {
  const short = opts.short ?? 90;
  const max = opts.max ?? 300;
  const all = sentencesOf(text);
  const cut = opts.stopAt ? all.findIndex((s) => opts.stopAt!.test(s)) : -1;
  const usable = cut >= 0 ? all.slice(0, cut) : all;
  if (usable.length === 0) return "";
  const first = usable[0];
  if (first.length < short && usable.length > 1 && first.length + 1 + usable[1].length <= max) {
    return `${first} ${usable[1]}`;
  }
  return first;
}

function capitalFirst(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * A glossary term's card words: its definition's first sentence (or two),
 * with the capital back, stopping before any "See also" (those are the
 * card's connections).
 */
export function termSummary(definition: string): string {
  return capitalFirst(firstSentences(definition, { stopAt: /^See also\b/i }));
}

/**
 * The words a glossary term links by (rule 4): the whole term and its bare
 * word ("Failure (Fatigue)" -> "failure"), "contraction" for "Contract(ion)".
 * The extras inside a bracket ("Mechanical Tension", "Work Arm", "Lower
 * Turn") come second, so they can never take a word another term owns.
 */
function termWords(term: string): { first: string[]; extra: string[]; codes: string[] } {
  const whole = term.trim();
  const first: string[] = [whole];
  const extra: string[] = [];
  const codes: string[] = [];
  const glued = /^([A-Za-z]+)\(([a-z]+)\)$/.exec(whole);
  if (glued) {
    first.push(glued[1], glued[1] + glued[2]);
    return { first, extra, codes };
  }
  const bare = whole.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (bare && bare !== whole) first.push(bare);
  const paren = /\(([^)]*)\)\s*$/.exec(whole);
  if (paren) {
    const inner = paren[1].trim();
    if (/^[A-Z]{2,5}$/.test(inner)) codes.push(inner);
    else {
      for (const part of inner.replace(/^also\s+/i, "").split(/\s*\/\s*|\s+or\s+/)) {
        const p = part.replace(/^or\s+/i, "").trim();
        // Two words or more, and not a phrase that starts "of the ...".
        if (p.split(/\s+/).length >= 2 && !/^(of|the|a|an|in|on)\b/i.test(p)) extra.push(p);
      }
    }
  }
  return { first, extra, codes };
}

/** The names after "See also" in a definition ("Failure and Fatigue for more."). */
export function seeAlsoNames(definition: string): string[] {
  const out: string[] = [];
  for (const m of definition.matchAll(/See also ([^.]+)/gi)) {
    for (const raw of m[1].split(/\s*,\s*|\s+and\s+/)) {
      const name = raw
        .replace(/^and\s+/i, "")
        .replace(/\s+for more$/i, "")
        .trim();
      if (name) out.push(name);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Topics
 * ------------------------------------------------------------------ */

/**
 * The few topic titles that may link from running prose, each to its topic.
 * Most titles cannot: "Introduction", "FAQ", "Breathing" and "Effort" would
 * link half the corpus to the wrong page, and a title that repeats across
 * modules ("Exercise Substitutes" is three topics) has no one owner. These
 * are distinctive phrases that mean the page itself. entities.test checks
 * every id is a real topic.
 */
export const TOPIC_LINK_WORDS: Readonly<Record<string, readonly string[]>> = {
  "benefits-sarcopenia": ["sarcopenia"],
  "benefits-body-composition": ["body composition"],
  "benefits-cardiovascular-efficiency": ["cardiovascular efficiency"],
  "principles-specificity": ["specificity"],
  "principles-individual-variability": ["individual variability"],
  "performance-speed-of-movement": ["speed of movement"],
  "performance-set-duration": ["set duration"],
  "performance-rest-interval-between-exercises": ["rest interval", "rest intervals"],
  "performance-number-of-sets": ["number of sets"],
  "performance-warm-up-considerations": ["warm-up", "warm up"],
  "programming-ab-routines-how-to-optimize-programming": ["ab routines", "ab routine", "a/b routines", "a/b routine"],
  "further-exercise-variety": ["exercise variety"],
  "further-msf-fundamentals-of-high-intensity-exercise": ["high intensity exercise", "high-intensity exercise"],
};

/** "POSTURE" -> "Posture": the Mastery Series' shouted one-word titles, as a reader says them. */
export function topicLabel(title: string): string {
  const t = title.trim();
  return /^[A-Z]{3,}$/.test(t) ? t[0] + t.slice(1).toLowerCase() : t;
}

/* ------------------------------------------------------------------ *
 * Building the index
 * ------------------------------------------------------------------ */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A word can be matched on word boundaries only if it starts and ends with a letter or digit. */
function linkableAlias(alias: string): boolean {
  return alias.length >= ENTITY_MIN_LENGTH && /^[A-Za-z0-9]/.test(alias) && /[A-Za-z0-9]$/.test(alias);
}

function routeEntityId(route: VaultRoute): string | null {
  switch (route.kind) {
    case "machine":
      return `machine:${route.id}`;
    case "topic":
      return `topic:${route.topicId}`;
    case "glossary":
      return route.term ? termEntityId(route.term) : null;
    case "playbook":
      return `playbook:${route.id}`;
    case "map":
      return route.focus && route.focus.startsWith("clinical:") ? route.focus : null;
    default:
      return null;
  }
}

function uniq(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) if (id && !out.includes(id)) out.push(id);
  return out;
}

/**
 * Build the index once per glossary (memoise it). Never throws: an odd row is
 * skipped, never a reason for Learning to stop drawing.
 */
export function buildEntityIndex(input: {
  glossary: { term: string; definition: string }[] | null;
  machines: AcademyMachine[];
  clinical: ClinicalSafetyFlag[];
  playbooks: PlaybookPage[];
  modules: IndexModule[];
}): EntityIndex {
  const byId = new Map<string, VaultEntity>();
  const aliases = new Map<string, string>();
  const codes = new Map<string, string>();

  /** Rule 6: the first entity to claim a word keeps it. Returns the words it won. */
  const claim = (id: string, words: readonly string[]): string[] => {
    const won: string[] = [];
    for (const w of words) {
      const key = w.replace(/\s+/g, " ").trim().toLowerCase();
      if (!linkableAlias(key)) continue;
      const owner = aliases.get(key);
      if (owner === undefined) {
        aliases.set(key, id);
        won.push(key);
      } else if (owner === id && !won.includes(key)) won.push(key);
    }
    return won;
  };
  const claimCodes = (id: string, list: readonly string[]): string[] => {
    const won: string[] = [];
    for (const c of list) {
      if (!isLinkableCode(c)) continue;
      if (!codes.has(c)) codes.set(c, id);
      if (codes.get(c) === id && !won.includes(c)) won.push(c);
    }
    return won;
  };
  const add = (entity: VaultEntity) => {
    if (!byId.has(entity.id)) byId.set(entity.id, entity);
  };

  // 1. The method's rules (copied: the constant is never mutated).
  for (const rule of RULE_ENTITIES) {
    const entity: VaultEntity = { ...rule, aliases: [], related: [...rule.related] };
    entity.aliases = claim(rule.id, rule.aliases);
    const wonCodes = claimCodes(rule.id, rule.codes ?? []);
    if (wonCodes.length) entity.codes = wonCodes;
    else delete entity.codes;
    add(entity);
  }

  // 2. The glossary: whole terms and bare words first, bracket extras after.
  const terms: { entity: VaultEntity; definition: string; extra: string[] }[] = [];
  for (const row of input.glossary ?? []) {
    const term = (row?.term ?? "").trim();
    if (!term) continue;
    const id = termEntityId(term);
    if (byId.has(id)) continue;
    const words = termWords(term);
    const entity: VaultEntity = {
      id,
      kind: "term",
      label: term,
      aliases: claim(id, words.first),
      summary: termSummary(row.definition ?? ""),
      route: { kind: "glossary", term },
      related: [],
      source: "Academy glossary",
    };
    const wonCodes = claimCodes(id, words.codes);
    if (wonCodes.length) entity.codes = wonCodes;
    add(entity);
    terms.push({ entity, definition: row.definition ?? "", extra: words.extra });
  }
  for (const t of terms) {
    for (const w of claim(t.entity.id, t.extra)) if (!t.entity.aliases.includes(w)) t.entity.aliases.push(w);
  }

  // 3. The machines: the Academy's own names, the Catalog's, the code.
  const machineEntities = new Map<string, VaultEntity>();
  for (const m of input.machines ?? []) {
    if (!m?.machineId) continue;
    const id = `machine:${m.machineId}`;
    if (byId.has(id)) continue;
    const name = (m.name ?? "").trim() || m.machineId;
    const words = [...(ACADEMY_MACHINE_WORDS[m.machineId] ?? []), ...machineNameWords(name)];
    const note = (MACHINE_DEFINITIONS[m.machineId]?.clinicalNote ?? "").trim();
    const facts = machineFacts(m.machineId);
    const lead = note ? (/[.!?]$/.test(note) ? note : `${note}.`) : m.workout ? `${m.workout.replace("SpineTrunkCore", "Spine, trunk and core")} machine.` : "";
    const entity: VaultEntity = {
      id,
      kind: "machine",
      label: name,
      aliases: claim(id, words),
      summary: [lead, ...facts].filter(Boolean).join(" ") || name,
      route: { kind: "machine", id: m.machineId },
      related: machineMethodLinks(m.machineId),
      source: note ? "Machine definition" : "Academy",
    };
    const wonCodes = claimCodes(id, m.abbr ? [m.abbr] : []);
    if (wonCodes.length) entity.codes = wonCodes;
    add(entity);
    machineEntities.set(m.machineId, entity);
  }

  // 4. The clinical matrix: names and counts only.
  const clinicalReach = new Map<string, number>();
  for (const flag of input.clinical ?? []) {
    if (!flag?.id) continue;
    const id = `clinical:${flag.id}`;
    if (byId.has(id)) continue;
    const machineIds = clinicalMachineIds(flag);
    // A flag that names none of the Academy's machines is not on the map
    // (graph.ts leaves it out: it connects to nothing there), so its card's
    // "Show on the map" would land on nothing, and its words would only say
    // it names no machines. It gets no card (wave A integration, Oct 19 2026).
    if (!machineIds.some((mid) => machineEntities.has(mid))) continue;
    const entity: VaultEntity = {
      id,
      kind: "clinical",
      label: (flag.label ?? flag.conditionName ?? flag.id).trim(),
      aliases: claim(id, clinicalAliases(flag)),
      summary: clinicalSummary(flag),
      route: { kind: "map", focus: id },
      related: machineIds.map((mid) => `machine:${mid}`),
      source: "Clinical matrix",
    };
    add(entity);
    clinicalReach.set(id, machineIds.length);
    // The machine's card points back at the flags that name it.
    for (const mid of machineIds) machineEntities.get(mid)?.related.push(id);
  }
  // Most particular first: a flag that names this machine alone (a knee
  // replacement and the Leg Press) says more about it than one that names
  // eight. The method links stay ahead of them; the sort is stable.
  for (const entity of machineEntities.values()) {
    const reach = (id: string) => (id.startsWith("clinical:") ? clinicalReach.get(id) ?? 99 : 0);
    entity.related = entity.related
      .map((id, at) => ({ id, at }))
      .sort((a, b) => reach(a.id) - reach(b.id) || a.at - b.at)
      .map((x) => x.id);
  }

  // 5. The Academy's topics: every one is an entity; a few link from prose.
  for (const mod of input.modules ?? []) {
    for (const topic of mod?.topics ?? []) {
      if (!topic?.id) continue;
      const id = `topic:${topic.id}`;
      if (byId.has(id)) continue;
      const blurb = (mod.blurb ?? "").trim();
      const entity: VaultEntity = {
        id,
        kind: "topic",
        label: topicLabel(topic.title ?? topic.id),
        aliases: claim(id, TOPIC_LINK_WORDS[topic.id] ?? []),
        summary: `${mod.title}, module ${mod.n} of the Academy.${blurb ? ` ${blurb}` : ""}`,
        route: { kind: "topic", moduleId: mod.id, topicId: topic.id },
        related: [],
        source: topic.readingMinutes
          ? `Academy · ${mod.title} · ${topic.readingMinutes} min read`
          : `Academy · ${mod.title}`,
      };
      add(entity);
    }
  }
  // A topic's card points at the rules quoted from it.
  for (const rule of RULE_ENTITIES) {
    if (rule.route.kind !== "topic") continue;
    byId.get(`topic:${rule.route.topicId}`)?.related.push(rule.id);
  }

  // 6. The playbooks: drafts, found from other cards (no prose links).
  for (const page of input.playbooks ?? []) {
    if (!page?.id) continue;
    const id = `playbook:${page.id}`;
    if (byId.has(id)) continue;
    add({
      id,
      kind: "playbook",
      label: page.title,
      aliases: [],
      summary: page.lede,
      route: { kind: "playbook", id: page.id },
      related: uniq((page.related ?? []).map((r) => routeEntityId(r.route) ?? "")),
      source: "Life Transformer playbook · draft",
    });
  }

  const index: EntityIndex = {
    byId,
    aliases,
    codes,
    aliasPattern: patternFor([...aliases.keys()], "gi"),
    codePattern: patternFor([...codes.keys()], "g"),
  };

  // 7. A term's connections: its "See also" first, then what its definition
  // names, read with the finished matcher.
  const termByLower = new Map<string, string>();
  for (const t of terms) termByLower.set(t.entity.label.toLowerCase(), t.entity.id);
  for (const t of terms) {
    const related: string[] = [];
    for (const name of seeAlsoNames(t.definition)) {
      const key = name.toLowerCase();
      const hit =
        aliases.get(key) ??
        termByLower.get(key) ??
        [...termByLower.entries()].find(([label]) => label.startsWith(key))?.[1];
      if (hit) related.push(hit);
    }
    for (const seg of linkText(t.definition, index, { skip: t.entity.id, maxLinks: 8 })) {
      if (seg.entityId) related.push(seg.entityId);
    }
    t.entity.related = uniq(related.filter((id) => id !== t.entity.id));
  }
  for (const entity of machineEntities.values()) entity.related = uniq(entity.related);

  return index;
}

function patternFor(words: string[], flags: string): RegExp | null {
  if (words.length === 0) return null;
  const alternation = [...words]
    // Longest first (rule 2): JavaScript's alternation is ordered, not greedy.
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`\\b(${alternation})\\b`, flags);
}

/* ------------------------------------------------------------------ *
 * Linking a passage
 * ------------------------------------------------------------------ */

interface Hit {
  start: number;
  end: number;
  id: string;
}

function collect(pattern: RegExp | null, text: string, owner: (raw: string) => string | undefined, out: Hit[]): void {
  if (!pattern) return;
  // A /g pattern carries lastIndex between calls: reset it, every time
  // (glossary-links: without this, alternate paragraphs silently lose links).
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    const id = owner(m[0]);
    if (id) out.push({ start: m.index, end: m.index + m[0].length, id });
  }
  pattern.lastIndex = 0;
}

/**
 * Split one passage into words and links: longest first, whole words, each
 * thing on its first appearance only, at most `maxLinks` (6). Codes are
 * matched in capitals only. `skip` is never linked (the page's or the card's
 * own entity); `seen` carries "already linked" across passages when a caller
 * wants first appearance per page, and is added to.
 *
 * Every character of the text comes back, in order. Without an index the
 * passage is one plain segment.
 */
export function linkText(
  text: string,
  index: EntityIndex | null,
  opts: { maxLinks?: number; skip?: string; seen?: Set<string> } = {},
): LinkedSegment[] {
  if (!text) return [];
  if (!index || (!index.aliasPattern && !index.codePattern)) return [{ text }];
  const max = opts.maxLinks ?? MAX_LINKS;
  if (max <= 0) return [{ text }];
  const seen = opts.seen ?? new Set<string>();

  const hits: Hit[] = [];
  collect(index.aliasPattern, text, (raw) => index.aliases.get(raw.toLowerCase()), hits);
  collect(index.codePattern, text, (raw) => index.codes.get(raw), hits);
  if (hits.length === 0) return [{ text }];
  // Leftmost first; at one start, the longer match.
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const out: LinkedSegment[] = [];
  let cursor = 0;
  let blocked = 0;
  let count = 0;
  for (const hit of hits) {
    if (count >= max) break;
    if (hit.start < blocked) continue;
    // A skipped match still owns its words: a code inside it must not link.
    blocked = hit.end;
    if (hit.id === opts.skip || seen.has(hit.id) || !index.byId.has(hit.id)) continue;
    if (hit.start > cursor) out.push({ text: text.slice(cursor, hit.start) });
    out.push({ text: text.slice(hit.start, hit.end), entityId: hit.id });
    cursor = hit.end;
    seen.add(hit.id);
    count += 1;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

/* ------------------------------------------------------------------ *
 * Cards and the stack
 * ------------------------------------------------------------------ */

/**
 * What a concept card shows: the entity, its summary with its own links
 * (never to itself), and up to six connected things that the summary does not
 * already link. Null for an id the index does not know.
 */
export function conceptCard(
  entityId: string,
  index: EntityIndex,
): { entity: VaultEntity; summary: LinkedSegment[]; connected: VaultEntity[] } | null {
  const entity = index?.byId.get(entityId);
  if (!entity) return null;
  // A clinical card's words are a sentence about the matrix ("the Bone
  // Density & Aging group"), not prose: a link inside a group's name would
  // open a glossary term the flag is not about. Its machines are its links.
  const summary =
    entity.kind === "clinical"
      ? linkText(entity.summary, null)
      : linkText(entity.summary, index, { skip: entity.id, maxLinks: CARD_SUMMARY_LINKS });
  const inSummary = new Set(summary.map((s) => s.entityId).filter((id): id is string => !!id));
  const connected: VaultEntity[] = [];
  for (const id of entity.related) {
    if (connected.length >= CARD_CONNECTED_MAX) break;
    if (id === entity.id || inSummary.has(id)) continue;
    const other = index.byId.get(id);
    if (other && !connected.includes(other)) connected.push(other);
  }
  return { entity, summary, connected };
}

/**
 * The card stack, three deep (the nested tooltip). Opening one already in the
 * stack trims back to it; a fourth replaces the third, so the way back to
 * where you started is always one tap.
 */
export function pushConcept(stack: string[], id: string, max: number = CONCEPT_DEPTH): string[] {
  const depth = Math.max(1, Math.floor(max));
  const at = stack.indexOf(id);
  if (at >= 0) return stack.slice(0, at + 1);
  if (stack.length < depth) return [...stack, id];
  return [...stack.slice(0, depth - 1), id];
}
