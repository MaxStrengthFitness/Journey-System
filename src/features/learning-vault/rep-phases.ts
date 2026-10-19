/**
 * THE REPETITION — the rep model behind the scrubber (Learning vault
 * redesign, Oct 19 2026).
 *
 * The Interactive Course's showpiece is a timeline a trainer drags a thumb
 * along: the start of a set, one rep's cycle, and the last rep, with the
 * Academy's rule and cue phrases for whatever moment the thumb is on. This
 * file is the arithmetic and the words; ui/RepScrubber.tsx draws it.
 *
 * WHAT IT MAY SAY (decision 10 of the round, and the floor doc)
 * ---------------------------------------------------------------
 * The Academy's window, never a fixed number: 6 to 10 seconds up and 6 to
 * 10 down, "an approximate 12 to 20-second repetition cycle" (Academy 4.5,
 * Speed of Movement), with 6 the house default (DEFAULT_CADENCE). A rep is
 * never said to BE 20 seconds; the scrubber shows each stroke's own seconds
 * and the window, and a test holds every word here to that.
 *
 * THE THREE SHAPES (scripts.json's beats; Academy 2, Exercise Categories)
 *   endStop   a gradual load-up, then touch and go at the end stop: no pause,
 *             no squeeze (Leg Press, Chest Press, Overhead Press, Seated Dip)
 *   squeeze   a gradual load-up, then a pause and a squeeze at the top
 *             (every other machine that does not begin with a handoff)
 *   handoff   the trainer brings the movement arm into position and hands
 *             the load over; the set begins with the lowering (Compound Row,
 *             Pulldown, Pullover, Abdominals, Cervical Extension). Where the
 *             arm is brought differs by machine (Resistance Transfer
 *             Techniques: "usually the midpoint"; the Cervical at neutral), so
 *             no place is named here
 *
 * HOW THE TIMELINE IS DRAWN
 * -------------------------
 * The two strokes are exactly `pace` seconds each, so the bar never shows a
 * 6-second concentric as 5.5. A CONTINUOUS turnaround (every lower turn, and
 * the upper turn at an end stop) has no time of its own in the Academy: it
 * is drawn as a one-second window centred on the moment of reversal,
 * overlapping the two strokes it joins, and phaseAt prefers the narrower
 * window. The squeeze is a real hold, so it is drawn as two seconds of its
 * own between the strokes (the Academy gives "one or two seconds" of pause on
 * the first two reps and "2 to 3 seconds" of squeeze from the third). The
 * load-up and the handoff happen once, at the start of a set; the final
 * descent once, at its end.
 *
 * Every rule cites the Academy topic it comes from (topic ids from
 * src/features/academy/content), and rep-phases.test.ts loads that topic's
 * JSON and proves each quoted phrase is in it.
 *
 * PURE MODULE: no React, no Firestore, no Academy JSON (the source files may
 * not import it; the test does).
 */

import { DEFAULT_CADENCE, type MachineDefinition } from "../../types/machines";
import type { CueMoment } from "../academy/types";
import { switchesOf } from "../machine-codex/format";
import type { RepModel, RepPhase, RepPhaseId, RepShape, VaultRoute } from "./types";

/* ------------------------------------------------------------------ *
 * The window
 * ------------------------------------------------------------------ */

/**
 * The Academy's window: 6 to 10 seconds each way, an approximate 12 to 20
 * second cycle. Academy 5.3 (Performing the Continuous Tension Method) and
 * Academy 4.5 (Speed of Movement).
 */
export const REP_WINDOW = { min: 6, max: 10, cycleMin: 12, cycleMax: 20 } as const;

/** The house default, 6 seconds each way (types/machines.ts DEFAULT_CADENCE). */
export const DEFAULT_PACE: number = DEFAULT_CADENCE.concentricSeconds;

/** The paces the scrubber offers, in whole seconds. */
export const PACES: readonly number[] = [6, 7, 8, 9, 10];

/** Seconds drawn for the load-up: "a time frame of 3 or more seconds". */
export const START_SECONDS = 3;
/** Seconds drawn for the squeeze: inside both the pause (1–2) and the squeeze (2–3). */
export const HOLD_SECONDS = 2;
/** Half the window drawn around a continuous turnaround's moment of reversal. */
export const TURN_HALF = 0.5;

/** A pace clamped to the window: whole seconds, 6 to 10, the house default when missing. */
export function clampPace(pace?: number): number {
  if (typeof pace !== "number" || !Number.isFinite(pace)) return DEFAULT_PACE;
  return Math.min(REP_WINDOW.max, Math.max(REP_WINDOW.min, Math.round(pace)));
}

/* ------------------------------------------------------------------ *
 * The shape of a machine's first rep
 * ------------------------------------------------------------------ */

/**
 * Which first repetition a machine has, read through the codex's one reader
 * of the switches, so the scrubber and the machine page can never disagree:
 * a handoff, else an end stop (an upper turn that passes through or stops
 * hard), else a squeeze. All twenty seeded machines agree with their
 * Academy scripts (rep-phases.test.ts).
 */
export function repShapeOf(def: Partial<MachineDefinition> | null | undefined): RepShape {
  const s = switchesOf(def);
  if (s.beginsWith === "handoff") return "handoff";
  if (s.upperTurn === "passThrough" || s.upperTurn === "hardStop") return "endStop";
  return "squeeze";
}

export const SHAPE_LABEL: Record<RepShape, string> = {
  endStop: "End stop",
  squeeze: "Squeeze",
  handoff: "Handoff",
};

/** One line on how each shape runs (Academy 2, Exercise Categories; Resistance Transfer Techniques). */
export const SHAPE_WORDS: Record<RepShape, string> = {
  endStop: "A gradual load-up, then touch and go at the end stop: no pause, no squeeze.",
  squeeze: "A gradual load-up, then a brief pause and a squeeze at the top.",
  handoff: "The trainer brings the movement arm into position and hands the load over, and the set begins with the lowering.",
};

/** Which machines run each way, as the Academy lists them. */
export const SHAPE_EXAMPLES: Record<RepShape, string> = {
  endStop: "Leg Press, Chest Press, Overhead Press, Seated Dip",
  squeeze: "Every other machine that begins with a load-up",
  handoff: "Compound Row, Pulldown, Pullover, Abdominals, Cervical Extension",
};

/* ------------------------------------------------------------------ *
 * Sources: the Academy topics the rules come from
 * ------------------------------------------------------------------ */

export type RepSourceId =
  | "loadUp"
  | "transfer"
  | "continuous"
  | "speed"
  | "window"
  | "turnaround"
  | "lower"
  | "categories";

export interface RepSource {
  /** What the reader sees ("Academy 4.5 · Speed of Movement"). */
  label: string;
  moduleId: string;
  topicId: string;
  /** Short exact phrases from the topic; the test proves each is in it. */
  quotes: string[];
}

export const REP_SOURCES: Record<RepSourceId, RepSource> = {
  loadUp: {
    label: "Academy 4.3 · Gradual Load-up",
    moduleId: "performance",
    topicId: "performance-gradual-load-up",
    quotes: ["over a time frame of 3 or more seconds", "may take 5 seconds or more"],
  },
  transfer: {
    label: "Academy · Resistance Transfer Techniques",
    moduleId: "further",
    topicId: "further-resistance-transfer-techniques",
    quotes: [
      "a clear, concise signal of “yours”",
      "moving into the stretch or negative phase",
      "begin applying gradual force",
      "held absolutely still during the transfer",
      "that is…mine",
    ],
  },
  continuous: {
    label: "Academy 5.3 · Performing the Continuous Tension Method",
    moduleId: "continuous-tension",
    topicId: "continuous-tension-performing-the-continuous-tension-method",
    quotes: [
      "lifting the resistance in 6 to 10 seconds",
      "lowering the resistance in 6 to 10 seconds",
      "maintain a constant pace in both directions",
    ],
  },
  speed: {
    label: "Academy 4.5 · Speed of Movement",
    moduleId: "performance",
    topicId: "performance-speed-of-movement",
    quotes: [
      "An approximate 12 to 20-second repetition cycle",
      "the speed of movement should be the same on both the concentric and eccentric phases",
      "a faster pace should never be forced",
      "A slower repetition cycle is beneficial when instructing novice trainees",
      "move closer to the 6-second pace",
    ],
  },
  window: {
    label: "Academy 5.2 · What Makes the Continuous Tension Method Effective",
    moduleId: "continuous-tension",
    topicId: "continuous-tension-what-makes-the-continuous-tension-method-",
    quotes: ["A 10-second pace is the maximum.", "There is no “magic” in the number itself."],
  },
  turnaround: {
    label: "Academy 4.6 · Turnaround Technique",
    moduleId: "performance",
    topicId: "performance-turnaround-technique",
    quotes: [
      "Keeping the movement continuous throughout is the goal.",
      "Pause definitely and briefly (one or two seconds)",
      "should generally last for 2 to 3 seconds before easing out",
      "Gradually ease out of the contracted position.",
      "Immediately but slowly begin the negative phase of the movement.",
      "barely touch or “pass through”",
    ],
  },
  lower: {
    label: "Mastery Series 6 · Lower Turnarounds",
    moduleId: "mastery",
    topicId: "mastery-lower-turnarounds",
    quotes: [
      "Always bottom out",
      "Do not unload at the bottom",
      "Do not fire out of the bottom",
      "the bottom is defined by the elbows straightening",
      "such as in a compound row or a pulldown",
      "For most other movements, the weight stack should touch",
    ],
  },
  categories: {
    label: "Academy · Exercise Categories",
    moduleId: "mastery",
    topicId: "mastery-exercise-categories-postureexecutiongaps",
    quotes: [
      "A count of 5 to 10 seconds",
      "hold the last rep in the contracted position",
      "A normal 2 to 3 second count",
      "usually best intensified",
      "Cervical Ext is also the only exercise that the instructor will take from the client in the neutral position when finished",
    ],
  },
};

/** The phrasebook's own label (Academy 9, Cues and Timing). */
export const CUE_SOURCE_LABEL = "Academy 9 · Cues and Timing";

/** Where "Read it" goes for a rule's source. */
export function routeForRepSource(id: RepSourceId): VaultRoute {
  const s = REP_SOURCES[id];
  return { kind: "topic", moduleId: s.moduleId, topicId: s.topicId };
}

/** The route for a phase's source, found by its label; null if it names none. */
export function sourceRouteOf(phase: Pick<RepPhase, "source">): VaultRoute | null {
  for (const id of Object.keys(REP_SOURCES) as RepSourceId[]) {
    if (REP_SOURCES[id].label === phase.source) return routeForRepSource(id);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The cue moments (cues.json), by what they are rather than where
 * ------------------------------------------------------------------ */

/** The phrasebook moments the rep and the machine page use. */
export type CueKey =
  | "loadUp"
  | "handoff"
  | "speed"
  | "lowerTouch"
  | "lowerNoTouch"
  | "upperEndStop"
  | "upperSqueeze"
  | "finalDescent"
  | "unload"
  | "failure";

/**
 * How each moment's heading reads in cues.json. Matched on the words, not the
 * position, so a rebuilt phrasebook that reorders its moments still finds
 * them (the corpus has no ids for moments; academy.md §8).
 */
const CUE_MATCH: Record<CueKey, (moment: string) => boolean> = {
  loadUp: (m) => /^to begin the exercise/i.test(m) && /load ?up|pushing/i.test(m),
  handoff: (m) => /^to begin the exercise/i.test(m) && /pulling/i.test(m),
  speed: (m) => /^speed of motion/i.test(m),
  lowerTouch: (m) => /^lower turnaround/i.test(m) && /\bstack touches\b/i.test(m),
  lowerNoTouch: (m) => /^lower turnaround/i.test(m) && /\bdoes not touch\b/i.test(m),
  upperEndStop: (m) => /^upper turnaround/i.test(m) && /\bwith an end stop\b/i.test(m),
  upperSqueeze: (m) => /^upper turnaround/i.test(m) && /\binclude a squeeze\b|\bwithout an end stop\b/i.test(m),
  finalDescent: (m) => /^final descent/i.test(m),
  unload: (m) => /^carefully unload/i.test(m),
  failure: (m) => /apparent task failure/i.test(m),
};

/**
 * Where each moment sits in the committed cues.json, for the routes and the
 * graph that address a moment by its index ({ kind: "cueing", moment }).
 * The test proves findCueMoment finds each one at exactly this index.
 */
export const CUE_MOMENT_INDEX: Record<CueKey, number> = {
  loadUp: 1,
  handoff: 2,
  speed: 3,
  lowerTouch: 6,
  lowerNoTouch: 7,
  upperEndStop: 8,
  upperSqueeze: 9,
  finalDescent: 10,
  unload: 11,
  failure: 13,
};

/**
 * A short title for each moment (cues.json's headings run to 299 characters).
 * The two lower turns say WHEN: the phrasebook's headings end "most
 * effectively used during the eccentric", and the Lumbar script says "(Say
 * this DURING the eccentric)", so the lines are said before the turn is
 * reached. cue-label.ts names the same two moments the same way. The
 * handoff's lines are the phrasebook's "pulling movement" ones, so its title
 * says so.
 */
export const CUE_TITLES: Record<CueKey, string> = {
  loadUp: "To begin: the gradual load-up",
  handoff: "To begin a pulling movement: the handoff",
  speed: "Speed of motion",
  lowerTouch: "Before a lower turn where the stack touches",
  lowerNoTouch: "Before a lower turn where the stack does not touch",
  upperEndStop: "Upper turnaround at the end stop",
  upperSqueeze: "Upper turnaround with a squeeze",
  finalDescent: "Final descent",
  unload: "Carefully unload",
  failure: "At apparent task failure",
};

/** The index of a moment in a phrasebook, by its heading's words; -1 when it has none. */
export function findCueMoment(cues: readonly CueMoment[] | null | undefined, key: CueKey): number {
  if (!cues) return -1;
  const match = CUE_MATCH[key];
  return cues.findIndex((c) => typeof c?.moment === "string" && match(c.moment));
}

/**
 * True for a line a trainer would say. Three strings in the phrasebook's
 * phrase lists are not cues (quiz-sources.md §2.2): a pointer in capitals
 * ("SEE INDIVIDUAL EXERCISE SCRIPTS…"), a lead-in ending in a colon ("After
 * the loading transfer…:") and a stage direction in brackets ("(Change vocal
 * tone…)").
 */
export function isCuePhrase(phrase: string): boolean {
  const p = typeof phrase === "string" ? phrase.trim() : "";
  if (!p) return false;
  if (p.endsWith(":")) return false;
  if (p.startsWith("(")) return false;
  return /[a-z]/.test(p);
}

/** The machines a moment's heading names as examples ("ex. leg press, chest press, overhead"). */
export function cueExamples(moment: string): string[] {
  const m = /\bex\.\s*([^)]*)\)/i.exec(moment ?? "");
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** True when `name` holds `example` as whole words ("COMPOUND ROW" holds "row", "ROTATION" does not). */
export function namesExample(name: string, example: string): boolean {
  if (!name || !example) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRe(example.toLowerCase())}($|[^a-z0-9])`, "i").test(name);
}

/** The two machines Mastery 6 names whose stack "may not touch": the compound row and the pulldown. */
export const NO_TOUCH_MACHINES = /\bcompound row\b|\bpull ?down\b/i;

/**
 * Which lower-turnaround moment fits a machine.
 *
 * The codex switch decides when it is recorded: the stack touches, or a
 * joint stops it first (the elbows straighten). A FLEXIBILITY-limited turn
 * gets no phrasebook moment: the Academy's is "an abbreviated, moderate
 * stretch" (Turnaround Technique), and the does-not-touch lines say the
 * elbows "will completely straighten FIRST", the opposite, so the rule
 * speaks alone.
 *
 * With no switch, the Academy's own line (Mastery 6, Lower Turnarounds):
 * the stack "may not touch, such as in a compound row or a pulldown", and
 * "For most other movements, the weight stack should touch". The Compound
 * Row's and the Pulldown's scripts say "until your arms completely
 * straighten or the weights touch. Whichever happens first", so they show
 * both moments, the no-touch one first. Every other machine is "where the
 * stack touches", the Simple Row included (its script: "as soon those
 * weights touch"), and the Pullover, Abdominals and Cervical (their scripts
 * and card: the weights touch). The phrasebook's example "row" means the
 * compound row, so a name is never matched on the bare word.
 *
 * `cues` stays in the signature so the callers stay as they are; the
 * answer no longer depends on the phrasebook's examples.
 */
export function lowerCueKeys(
  lowerTurn: "stackTouch" | "jointLimited" | "flexLimited" | undefined,
  cues: readonly CueMoment[] | null | undefined,
  machineName?: string,
): CueKey[] {
  void cues;
  if (lowerTurn === "stackTouch") return ["lowerTouch"];
  if (lowerTurn === "flexLimited") return [];
  if (lowerTurn === "jointLimited") return ["lowerNoTouch"];
  if (NO_TOUCH_MACHINES.test(machineName ?? "")) return ["lowerNoTouch", "lowerTouch"];
  return ["lowerTouch"];
}

/** The moment whose phrases belong to a phase of a shape. */
export function cueKeyFor(phase: RepPhaseId, shape: RepShape): CueKey {
  switch (phase) {
    case "loadup":
      return "loadUp";
    case "handoff":
      return "handoff";
    case "concentric":
    case "eccentric":
      return "speed";
    case "upper":
      return shape === "endStop" ? "upperEndStop" : "upperSqueeze";
    case "lower":
      // "For most other movements, the weight stack should touch" (Mastery 6).
      return "lowerTouch";
    case "final":
      return "finalDescent";
  }
}

export interface PhaseCues {
  /** The moment's index in the phrasebook given. */
  index: number;
  key: CueKey;
  title: string;
  /** Only the lines a trainer would say. */
  phrases: string[];
}

/**
 * The phrasebook's lines for the moment the thumb is on. For the lower turn
 * a machine's name picks the moment lowerCueKeys gives first: "does not
 * touch" for the Compound Row and the Pulldown, "the stack touches" for
 * every other machine; with no machine, "the stack touches", which the
 * Academy says of most movements. Falls back to the phase's recorded index
 * when the headings do not match (a fixture, an older phrasebook).
 */
export function cuesForPhase(
  cues: readonly CueMoment[] | null | undefined,
  phase: Pick<RepPhase, "id" | "cueMoment">,
  shape: RepShape,
  machineName?: string,
): PhaseCues | null {
  if (!cues || cues.length === 0) return null;
  let key = cueKeyFor(phase.id, shape);
  if (phase.id === "lower" && machineName) {
    const keys = lowerCueKeys(undefined, cues, machineName);
    if (keys.length > 0) key = keys[0];
  }
  let index = findCueMoment(cues, key);
  if (index < 0 && typeof phase.cueMoment === "number" && phase.cueMoment >= 0 && phase.cueMoment < cues.length) {
    index = phase.cueMoment;
  }
  if (index < 0) return null;
  const phrases = (cues[index].phrases ?? []).filter(isCuePhrase).map((p) => p.trim());
  return { index, key, title: CUE_TITLES[key], phrases };
}

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

export const PHASE_LABEL: Record<RepPhaseId, string> = {
  loadup: "Gradual load-up",
  handoff: "Handoff",
  concentric: "Concentric",
  upper: "Upper turnaround",
  eccentric: "Eccentric",
  lower: "Lower turnaround",
  final: "Final descent",
};

/** The phase in everyday words, under its Academy name. */
export const PHASE_WORDS: Record<RepPhaseId, string> = {
  loadup: "Building force from a dead stop",
  handoff: "The trainer hands over the load",
  concentric: "The lift",
  upper: "The top",
  eccentric: "The lowering",
  lower: "The bottom",
  final: "After the last lift: the last lowering",
};

/** Which rule a phase reads, per shape (the upper turn and the finish differ by shape). */
type RuleId =
  | "loadup"
  | "handoff"
  | "concentric"
  | "upperEndStop"
  | "upperSqueeze"
  | "eccentric"
  | "lower"
  | "finalEndStop"
  | "finalHold";

export interface PhaseRule {
  rule: string;
  source: RepSourceId;
}

/**
 * The rules, in the Academy's words or a close paraphrase of them. Each
 * names the topic it comes from; the quotes the test checks are on
 * REP_SOURCES. No rule states a rep count or a weight (the floor doc: "the
 * rep count is never the target"; no house starting weight).
 */
export const PHASE_RULES: Record<RuleId, PhaseRule> = {
  loadup: {
    rule: "Build force gradually from a dead stop, breathing freely, until it just begins to move: over 3 or more seconds, and a leg press may take 5 or more.",
    source: "loadUp",
  },
  handoff: {
    rule: "No gradual load-up from a dead stop. The trainer brings the movement arm into position and holds it still while the client builds force and the trainer eases off; the trainer says “yours” only when the transfer is complete. The set then begins with the lowering.",
    source: "transfer",
  },
  concentric: {
    rule: "Lift in 6 to 10 seconds at a constant pace, the same pace the lowering will take.",
    source: "continuous",
  },
  upperEndStop: {
    // The Overhead Press's and Seated Dip's scripts ask for "a brief but
    // definite stillness" at the top, against Exercise Categories ("no pause
    // or squeeze"), the phrasebook ("Do not pause") and both machines'
    // definitions. The scrubber keeps the majority; the disagreement is
    // head office's to settle.
    rule: "Touch and go: slow as the end stop arrives, barely touch or pass through it, then begin lowering immediately but slowly. Keep it continuous: no pause, no squeeze.",
    source: "turnaround",
  },
  upperSqueeze: {
    rule: "Slow into the contracted position and pause briefly, one or two seconds, on the first two reps. From the third rep, squeeze for 2 to 3 seconds; after the click, ease out gradually before lowering.",
    source: "turnaround",
  },
  eccentric: {
    rule: "Lower in 6 to 10 seconds, at the same speed as the lift. Do not speed up.",
    source: "speed",
  },
  lower: {
    rule: "Always continuous. Always bottom out, do not unload at the bottom, and do not fire out of it. Where the stack may not touch, as on the Compound Row or the Pulldown, the bottom is where the elbows straighten.",
    source: "lower",
  },
  finalEndStop: {
    rule: "Keep breathing and do not speed up on the final descent. If the set ends short of failure, pause near the middle of the last lowering for a count of 5 to 10 seconds.",
    source: "categories",
  },
  finalHold: {
    rule: "Keep breathing and do not speed up on the final descent. When a set ends short of failure, the trainer usually has the client hold the last rep in the contracted position while counting down. The Cervical and Lumbar are never taken to failure and get only a normal 2 to 3 second count; on the Cervical the trainer takes the load back at the neutral position (“that is…mine”).",
    source: "categories",
  },
};

function ruleIdFor(phase: RepPhaseId, shape: RepShape): RuleId {
  switch (phase) {
    case "upper":
      return shape === "endStop" ? "upperEndStop" : "upperSqueeze";
    case "final":
      return shape === "endStop" ? "finalEndStop" : "finalHold";
    default:
      return phase;
  }
}

/* ------------------------------------------------------------------ *
 * The model
 * ------------------------------------------------------------------ */

function makePhase(id: RepPhaseId, shape: RepShape, from: number, to: number): RepPhase {
  const r = PHASE_RULES[ruleIdFor(id, shape)];
  return {
    id,
    label: PHASE_LABEL[id],
    from,
    to,
    rule: r.rule,
    source: REP_SOURCES[r.source].label,
    cueMoment: CUE_MOMENT_INDEX[cueKeyFor(id, shape)],
  };
}

/**
 * The start of a set, one rep's cycle and the last rep, in seconds, for a
 * shape at a pace (clamped to 6–10, the house's 6 by default). Phases are
 * in the order they happen; a continuous turnaround overlaps the strokes it
 * joins (see the header).
 */
export function repModel(shape: RepShape, pace?: number): RepModel {
  const p = clampPace(pace);
  const s = START_SECONDS;
  const h = HOLD_SECONDS;
  const w = TURN_HALF;
  let phases: RepPhase[];
  if (shape === "handoff") {
    phases = [
      makePhase("handoff", shape, 0, s),
      makePhase("eccentric", shape, s, s + p),
      makePhase("lower", shape, s + p - w, s + p + w),
      makePhase("concentric", shape, s + p, s + 2 * p),
      makePhase("upper", shape, s + 2 * p, s + 2 * p + h),
      makePhase("final", shape, s + 2 * p + h, s + 3 * p + h),
    ];
  } else if (shape === "endStop") {
    phases = [
      makePhase("loadup", shape, 0, s),
      makePhase("concentric", shape, s, s + p),
      makePhase("upper", shape, s + p - w, s + p + w),
      makePhase("eccentric", shape, s + p, s + 2 * p),
      makePhase("lower", shape, s + 2 * p - w, s + 2 * p + w),
      makePhase("final", shape, s + 2 * p, s + 3 * p),
    ];
  } else {
    phases = [
      makePhase("loadup", shape, 0, s),
      makePhase("concentric", shape, s, s + p),
      makePhase("upper", shape, s + p, s + p + h),
      makePhase("eccentric", shape, s + p + h, s + 2 * p + h),
      makePhase("lower", shape, s + 2 * p + h - w, s + 2 * p + h + w),
      makePhase("final", shape, s + 2 * p + h, s + 3 * p + h),
    ];
  }
  const total = Math.max(...phases.map((x) => x.to));
  return { shape, pace: p, phases, total };
}

/**
 * The phase at a moment. Outside the timeline it is the first or the last
 * phase. Where two phases overlap (a continuous turnaround over the strokes
 * it joins) the narrower window wins, and on a tie the later phase.
 */
export function phaseAt(model: RepModel, t: number): RepPhase {
  const phases = model.phases;
  if (!Number.isFinite(t) || t <= 0) return phases[0];
  if (t >= model.total) return phases[phases.length - 1];
  let best: RepPhase | null = null;
  for (const ph of phases) {
    if (t < ph.from || t >= ph.to) continue;
    if (!best || ph.to - ph.from <= best.to - best.from) best = ph;
  }
  return best ?? phases[phases.length - 1];
}

/** True for a turnaround drawn as a window over the strokes it joins. */
export function isContinuousTurn(model: RepModel, ph: RepPhase): boolean {
  return model.phases.some((other) => other !== ph && other.from < ph.from && other.to > ph.from && other.to - other.from > ph.to - ph.from);
}

/**
 * Where a tap on a phase's name puts the thumb: the moment of reversal for
 * a continuous turnaround, else the first moment the phase is the one under
 * the thumb (a stroke's first half-second sits inside the turn before it).
 */
export function phaseJumpTime(model: RepModel, id: RepPhaseId): number {
  const ph = model.phases.find((x) => x.id === id);
  if (!ph) return 0;
  if (isContinuousTurn(model, ph)) return round1((ph.from + ph.to) / 2);
  let t = ph.from;
  for (let guard = 0; guard < model.phases.length + 1; guard += 1) {
    const at = phaseAt(model, t);
    if (at.id === id) return round1(t);
    t = at.to;
    if (t >= ph.to) break;
  }
  return round1(ph.from);
}

/** The phase starts in the order the thumb meets them (for Page Up / Page Down). */
export function jumpTimes(model: RepModel): number[] {
  return model.phases.map((ph) => phaseJumpTime(model, ph.id)).sort((a, b) => a - b);
}

/**
 * Keeps the thumb on the same moment when the pace or the shape changes: the
 * same phase, the same fraction of the way through it. A phase the new shape
 * lacks (a load-up becoming a handoff) keeps the fraction of the whole.
 */
export function remapTime(from: RepModel, to: RepModel, t: number): number {
  const ph = phaseAt(from, t);
  const twin =
    to.phases.find((x) => x.id === ph.id) ??
    (ph.id === "loadup" ? to.phases.find((x) => x.id === "handoff") : ph.id === "handoff" ? to.phases.find((x) => x.id === "loadup") : undefined);
  if (!twin) return round1(Math.min(to.total, Math.max(0, (t / from.total) * to.total)));
  const width = ph.to - ph.from;
  const f = width > 0 ? Math.min(1, Math.max(0, (t - ph.from) / width)) : 0;
  return round1(twin.from + f * (twin.to - twin.from));
}

/** One decimal place, so a dragged thumb reads 8.4, never 8.400000001. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "2.4" — seconds to one decimal. */
export function secondsText(n: number): string {
  return (Math.floor(Math.max(0, n) * 10) / 10).toFixed(1);
}

/**
 * The timing words under the phase's name: a stroke's progress against its
 * own seconds ("2.4 of 6 s"), never a total for the rep.
 */
export function phaseTiming(model: RepModel, ph: RepPhase, t: number): string {
  switch (ph.id) {
    case "loadup":
      return "3 or more seconds";
    case "handoff":
      return "No set time: until the trainer says “yours”";
    case "upper":
      return model.shape === "endStop" ? "No pause" : "Pause 1 to 2 s, then from the third rep a 2 to 3 s squeeze";
    case "lower":
      return "No pause";
    default: {
      const width = ph.to - ph.from;
      const into = Math.min(width, Math.max(0, t - ph.from));
      return `${secondsText(into)} of ${width} s`;
    }
  }
}

/**
 * The span the scrubber brackets as a rep's cycle, and how it reads: the
 * strokes in the order they happen, each with its own seconds ("up 6 s,
 * pause or squeeze, down 6 s"), never a sum. The hold at the top is a pause
 * on the first two reps and a squeeze from the third, so it says both.
 */
export function cycleOf(model: RepModel): { from: number; to: number; words: string } {
  const get = (id: RepPhaseId) => model.phases.find((x) => x.id === id)!;
  const p = model.pace;
  if (model.shape === "handoff") {
    return { from: get("eccentric").from, to: get("upper").to, words: `A rep's cycle: down ${p} s, up ${p} s, pause or squeeze` };
  }
  if (model.shape === "squeeze") {
    return { from: get("concentric").from, to: get("lower").from + TURN_HALF, words: `A rep's cycle: up ${p} s, pause or squeeze, down ${p} s` };
  }
  return { from: get("concentric").from, to: get("lower").from + TURN_HALF, words: `A rep's cycle: up ${p} s, down ${p} s` };
}

/** The Academy's window in one line, said once under the scrubber. */
export const WINDOW_LINE =
  "The Academy's window: 6 to 10 seconds up and 6 to 10 down, about 12 to 20 seconds a rep. Journey's default is 6, the pace the Academy moves clients toward as they advance; a slower pace helps beginners, and a faster pace is never forced.";
