/**
 * QUESTIONS WRITTEN BY HAND — each one carrying the exact words it rests on.
 *
 * Round: the Learning vault redesign, Oct 19 2026.
 *
 * Two sets live here:
 *
 * - ACADEMY_QUESTIONS: the protocol, from the Academy's own topics
 *   (performance, continuous tension, variations, the Mastery Series,
 *   principles, the executive summary and the FAQ). Every one has
 *   `support: { topicId, quote }`, and authored.test.ts loads the module's
 *   JSON and fails if the quote is not in that topic's text, word for word.
 * - FLOOR_QUESTIONS: how the studio works (the playbooks deck), from
 *   docs/business and the FORD and progress-report READMEs. Every one has
 *   `support: { path, quote }`, and the test reads the file. No price is
 *   ever asked (each studio has its own), and nothing a trainer is never
 *   shown (business.md §5).
 *
 * THE TRAPS THESE AVOID (quiz-sources.md §5, all mandatory)
 * --------------------------------------------------------
 * - The order of the four P's is written four ways in the sources, so no
 *   question asks it. Only "Purpose is the last P" is asked, which all agree on.
 * - The too-heavy threshold (5 or 6 reps), the load-up seconds (2 to 6, 3 or
 *   more, 3 to 5) and the exercises per session disagree between sources, so
 *   a question names its source ("the Academy's Volume topic") and asks only
 *   what that source says, at its most conservative ("3 or more seconds").
 * - A rep count is never a rule ("the Academy advises…"; the floor's own
 *   "a client who fails at 3 and a client who fails at 15 are both training
 *   correctly" is asked as it is written).
 * - The order of a rep's phases comes from the Executive Summary, never from
 *   Components of a Repetition (which lists them out of order).
 * - Excluded outright: consultation pricing and its out-of-date package
 *   lines, suggested starting weights, MSF OVERVIEW, Research.txt.
 * - No he or she for a client: "the client", "they".
 *
 * Wrong answers are wrong on purpose and plainly so; none is a fact about
 * anyone or anything the sources do not cover.
 *
 * PURE MODULE — no React, no Firestore, no JSON import.
 */

import type { QuizDeckId } from "../types";
import type { QuizItem } from "./decks";

/* ------------------------------------------------------------------ *
 * The Academy
 * ------------------------------------------------------------------ */

export interface AcademySupport {
  topicId: string;
  /** A short, exact quote from the topic's text. */
  quote: string;
}

export interface AuthoredQuestion extends QuizItem {
  support: AcademySupport;
}

/**
 * The topics quoted, with the module that holds each, its title as the
 * Academy index has it, the file it was built from and what a reader sees.
 * The test checks the module, the title and the path against the corpus.
 */
export const QUOTED_TOPICS: Record<string, { moduleId: string; title: string; path: string; label: string }> = {
  "performance-gradual-load-up": {
    moduleId: "performance",
    title: "Gradual Load-up",
    path: "docs/msf-academy/Academy/Academy 4 - Exercise Performance/Academy - Exercise Performance 3 - Gradual Load-up.txt",
    label: "Exercise Performance · Gradual load-up",
  },
  "performance-range-of-motion": {
    moduleId: "performance",
    title: "Range of Motion",
    path: "docs/msf-academy/Academy/Academy 4 - Exercise Performance/Academy - Exercise Performance 4 - Range of Motion.txt",
    label: "Exercise Performance · Range of motion",
  },
  "performance-speed-of-movement": {
    moduleId: "performance",
    title: "Speed of Movement",
    path: "docs/msf-academy/Academy/Academy 4 - Exercise Performance/Academy - Exercise Performance 5 - Speed of Movement.txt",
    label: "Exercise Performance · Speed of movement",
  },
  "performance-turnaround-technique": {
    moduleId: "performance",
    title: "Turnaround Technique",
    path: "docs/msf-academy/Academy/Academy 4 - Exercise Performance/Academy - Exercise Performance 6 - Turnaround Technique.txt",
    label: "Exercise Performance · Turnaround technique",
  },
  "performance-set-duration": {
    moduleId: "performance",
    title: "Set Duration",
    path: "docs/msf-academy/Academy/Academy 4 - Exercise Performance/Academy - Exercise Performance 7 - Set Duration.txt",
    label: "Exercise Performance · Set duration",
  },
  "performance-rest-interval-between-exercises": {
    moduleId: "performance",
    title: "Rest Interval Between Exercises",
    path: "docs/msf-academy/Academy/Academy 4 - Exercise Performance/Academy - Exercise Performance 8 - Rest Interval Between Exercises.txt",
    label: "Exercise Performance · Rest between exercises",
  },
  "continuous-tension-what-makes-the-continuous-tension-method-": {
    moduleId: "continuous-tension",
    title: "What Makes the Continuous Tension Method Effective",
    path: "docs/msf-academy/Academy/Academy 5 - Continuous Tension Method/Academy - Continuous Tension Method 2 - What Makes the Continuous Tension Method Effective_.txt",
    label: "Continuous Tension · What makes it effective",
  },
  "continuous-tension-performing-the-continuous-tension-method": {
    moduleId: "continuous-tension",
    title: "Performing the Continuous Tension Method",
    path: "docs/msf-academy/Academy/Academy 5 - Continuous Tension Method/Academy - Continuous Tension Method 3 - Performing the Continuous Tension Method.txt",
    label: "Continuous Tension · Performing it",
  },
  "continuous-tension-other-factors-to-consider": {
    moduleId: "continuous-tension",
    title: "Other Factors to Consider",
    path: "docs/msf-academy/Academy/Academy 5 - Continuous Tension Method/Academy - Continuous Tension Method 4 - Other Factors to Consider.txt",
    label: "Continuous Tension · Other factors",
  },
  "variations-timed-static-contraction-tsc": {
    moduleId: "variations",
    title: "Timed Static Contraction (TSC)",
    path: "docs/msf-academy/Academy/Academy 7 - Variations on the Continuous Tension Protocol/Academy - Variations of the Continuous Tension Protocol 1 - Timed Static Contraction (TSC).txt",
    label: "Variations · Timed Static Contraction",
  },
  "variations-static-hold-sh": {
    moduleId: "variations",
    title: "Static Hold (SH)",
    path: "docs/msf-academy/Academy/Academy 7 - Variations on the Continuous Tension Protocol/Academy - Variations of the Continuous Tension Protocol 2 - Static Hold (SH).txt",
    label: "Variations · Static Hold",
  },
  "variations-forced-reps": {
    moduleId: "variations",
    title: "Forced Reps",
    path: "docs/msf-academy/Academy/Academy 7 - Variations on the Continuous Tension Protocol/Academy - Variations of the Continuous Tension Protocol 3 - Forced Reps.txt",
    label: "Variations · Forced reps",
  },
  "mastery-posture": {
    moduleId: "mastery",
    title: "POSTURE",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 1 - POSTURE.txt",
    label: "Mastery Series 1 · Posture",
  },
  "mastery-pace": {
    moduleId: "mastery",
    title: "PACE",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 2 - PACE.txt",
    label: "Mastery Series 2 · Pace",
  },
  "mastery-path": {
    moduleId: "mastery",
    title: "PATH",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 3 - PATH.txt",
    label: "Mastery Series 3 · Path",
  },
  "mastery-purpose": {
    moduleId: "mastery",
    title: "PURPOSE",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 4 - PURPOSE.txt",
    label: "Mastery Series 4 · Purpose",
  },
  "mastery-gradual-load-up": {
    moduleId: "mastery",
    title: "Gradual Load Up",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 5 - Gradual Load Up.txt",
    label: "Mastery Series 5 · Gradual load up",
  },
  "mastery-lower-turnarounds": {
    moduleId: "mastery",
    title: "Lower Turnarounds",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 6 - Lower Turnarounds.txt",
    label: "Mastery Series 6 · Lower turnarounds",
  },
  "mastery-squeeze-technique": {
    moduleId: "mastery",
    title: "Squeeze Technique",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 7 - Squeeze Technique.txt",
    label: "Mastery Series 7 · Squeeze technique",
  },
  "mastery-effort": {
    moduleId: "mastery",
    title: "Effort",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 8 - Effort.txt",
    label: "Mastery Series 8 · Effort",
  },
  "mastery-breathing": {
    moduleId: "mastery",
    title: "Breathing",
    path: "docs/msf-academy/Academy 2/MSF Mastery Series - Issue 9 - Breathing.txt",
    label: "Mastery Series 9 · Breathing",
  },
  "mastery-faq": {
    moduleId: "mastery",
    title: "FAQ",
    path: "docs/msf-academy/Academy 2/FAQ.txt",
    label: "Mastery · FAQ",
  },
  "mastery-exercise-categories-postureexecutiongaps": {
    moduleId: "mastery",
    title: "Exercise Categories (postureexecutiongaps)",
    path: "docs/msf-academy/Academy 2/Exercise Categories (posture_execution_gaps).txt",
    label: "Exercise categories: posture, execution, gaps",
  },
  "principles-progressive-overload-and-intensity": {
    moduleId: "principles",
    title: "Progressive Overload and Intensity",
    path: "docs/msf-academy/Academy/Academy 3 - Basic Principles of Exercise/Academy - Basic Principles of Exercise 2 - Progressive Overload and Intensity.txt",
    label: "Basic Principles · Progressive overload",
  },
  "principles-volume": {
    moduleId: "principles",
    title: "Volume",
    path: "docs/msf-academy/Academy/Academy 3 - Basic Principles of Exercise/Academy - Basic Principles of Exercise 4 - Volume.txt",
    label: "Basic Principles · Volume",
  },
  "principles-frequency": {
    moduleId: "principles",
    title: "Frequency",
    path: "docs/msf-academy/Academy/Academy 3 - Basic Principles of Exercise/Academy - Basic Principles of Exercise 5 - Frequency.txt",
    label: "Basic Principles · Frequency",
  },
  "principles-specificity": {
    moduleId: "principles",
    title: "Specificity",
    path: "docs/msf-academy/Academy/Academy 3 - Basic Principles of Exercise/Academy - Basic Principles of Exercise 6 - Specificity.txt",
    label: "Basic Principles · Specificity",
  },
  "principles-productive-exercise-the-stimulating-reps-model": {
    moduleId: "principles",
    title: "Productive Exercise - The Stimulating Reps Model",
    path: "docs/msf-academy/Academy/Academy 3 - Basic Principles of Exercise/Academy - Basic Principles of Exercise 8 - Productive Exercise - The Stimulating Reps Model.txt",
    label: "Basic Principles · The Stimulating Reps model",
  },
  "summary-exercise-performance": {
    moduleId: "summary",
    title: "Exercise Performance",
    path: "docs/msf-academy/Academy/MSF Academy - Executive Summary/MSF Academy - Executive Summary 4 - Exercise Performance.txt",
    label: "Executive Summary · Exercise performance",
  },
  "intro-mission": {
    moduleId: "intro",
    title: "Mission",
    path: "docs/msf-academy/Academy/Academy 1 - Introduction/Academy - Intro 4 - Mission.txt",
    label: "Introduction · Mission",
  },
  "intro-philosophy": {
    moduleId: "intro",
    title: "Philosophy",
    path: "docs/msf-academy/Academy/Academy 1 - Introduction/Academy - Intro 3 - Philosophy.txt",
    label: "Introduction · Philosophy",
  },
};

interface AcademyDraft {
  id: string;
  deck: QuizDeckId;
  kind?: "choice" | "truefalse" | "order";
  prompt: string;
  /** choice: the right answer FIRST. order: the items in the right order. */
  options?: string[];
  /** truefalse only. */
  truth?: boolean;
  explain: string;
  topicId: string;
  quote: string;
  fact?: string;
}

const TRUE_FALSE = ["True", "False"];

function academy(d: AcademyDraft): AuthoredQuestion {
  const topic = QUOTED_TOPICS[d.topicId];
  const kind = d.kind ?? (d.truth === undefined ? "choice" : "truefalse");
  return {
    id: `a-${d.id}`,
    deck: d.deck,
    kind,
    prompt: d.prompt,
    options: kind === "truefalse" ? TRUE_FALSE.slice() : (d.options ?? []).slice(),
    answer: kind === "order" ? -1 : kind === "truefalse" ? (d.truth ? 0 : 1) : 0,
    explain: d.explain,
    source: {
      label: `Academy · ${topic?.label ?? d.topicId}`,
      route: topic ? { kind: "topic", moduleId: topic.moduleId, topicId: d.topicId } : null,
      path: topic?.path,
    },
    support: { topicId: d.topicId, quote: d.quote },
    fact: d.fact ?? `a:${d.id}`,
  };
}

export const ACADEMY_QUESTIONS: AuthoredQuestion[] = [
  /* ── The repetition ─────────────────────────────────────────────── */
  academy({
    id: "cycle",
    deck: "rep",
    prompt: "About how long is one repetition cycle in the protocol?",
    options: ["About 12 to 20 seconds", "About 4 seconds", "About 30 to 40 seconds", "Exactly 20 seconds, every rep"],
    explain:
      "6 to 10 seconds up and 6 to 10 seconds down, with the turnarounds between. The Academy calls it approximate, never one fixed number.",
    topicId: "performance-speed-of-movement",
    quote: "An approximate 12 to 20-second repetition cycle",
  }),
  academy({
    id: "each-way",
    deck: "rep",
    prompt: "True or false: a Continuous Tension rep lifts in 6 to 10 seconds and lowers in 6 to 10 seconds.",
    truth: true,
    explain: "The lift and the lowering each take 6 to 10 seconds, at a constant pace both ways.",
    topicId: "continuous-tension-performing-the-continuous-tension-method",
    quote: "lifting the resistance in 6 to 10 seconds",
  }),
  academy({
    id: "same-both-ways",
    deck: "rep",
    prompt: "How should the speed of the lift compare with the speed of the lowering?",
    options: ["The same both ways", "Faster on the way down", "Faster on the way up", "Whatever feels natural that day"],
    explain:
      "A shorter or longer count suits a shorter or longer range, but the lift and the lowering move at the same speed.",
    topicId: "performance-speed-of-movement",
    quote: "the speed of movement should be the same on both the concentric and eccentric phases of a repetition",
  }),
  academy({
    id: "ten-max",
    deck: "rep",
    prompt: "Why is 10 seconds each way the slowest pace the Academy advises?",
    options: [
      "Slower can break the movement up and let the fibers rest",
      "Slower is unsafe for the joints",
      "The clicker can't count any slower",
      "Slower needs more weight on the stack",
    ],
    explain:
      "Slower than 10 seconds can segment the movement and give working fibers a respite, and the extra discomfort tends to end the set early.",
    topicId: "continuous-tension-what-makes-the-continuous-tension-method-",
    quote: "Going slower than 10 seconds can cause the movement to become segmented",
  }),
  academy({
    id: "six-guideline",
    deck: "rep",
    prompt: "True or false: the Academy calls the 6-second pace a guideline set with client safety in mind.",
    truth: true,
    explain: "About 6 seconds each way is the least that controls momentum for most people; the number itself is not magic.",
    topicId: "continuous-tension-what-makes-the-continuous-tension-method-",
    quote: "this is really just a guideline that has been established with the primary goal of client safety in mind",
  }),
  academy({
    id: "squeeze-first-rep",
    deck: "rep",
    prompt: "True or false: on a machine with a squeeze, the squeeze starts on the very first rep.",
    truth: false,
    explain:
      "The first reps get a brief pause of one or two seconds in the contracted position. The squeeze starts with the third rep.",
    topicId: "performance-turnaround-technique",
    quote: "starting with the third repetition",
    fact: "rep:squeeze-start",
  }),
  academy({
    id: "pause-length",
    deck: "rep",
    prompt: "On reps one and two, how long is the pause in the contracted position?",
    options: ["One or two seconds", "No pause at all", "Five seconds", "Ten seconds"],
    explain: "A definite, brief pause of one or two seconds, then ease out and begin the lowering slowly.",
    topicId: "performance-turnaround-technique",
    quote: "Pause definitely and briefly (one or two seconds) in the finished position.",
  }),
  academy({
    id: "squeeze-length",
    deck: "rep",
    prompt: "From the third rep on, how long does the squeeze usually last?",
    options: ["2 to 3 seconds", "Under a second", "8 to 10 seconds", "As long as the client can hold it"],
    explain:
      "The client keeps the movement arm and body completely still and contracts hard, usually for 2 to 3 seconds, then eases out.",
    topicId: "performance-turnaround-technique",
    quote: "should generally last for 2 to 3 seconds before easing out",
  }),
  academy({
    id: "common-attribute",
    deck: "rep",
    prompt: "Every turnaround the Academy describes has one thing in common. What is it?",
    options: [
      "A smooth and continuous lower turnaround",
      "A pause at the bottom",
      "A squeeze at the top",
      "A faster lowering near the end",
    ],
    explain:
      "In every case the lower turnaround is smooth and continuous, which the Academy calls perhaps the most important concept of the method.",
    topicId: "performance-turnaround-technique",
    quote: "a smooth and continuous lower turnaround",
  }),
  academy({
    id: "lower-rules",
    deck: "rep",
    kind: "order",
    prompt: "Put the three rules of the lower turnaround in order.",
    options: ["Always bottom out", "Do not unload at the bottom", "Do not fire out of the bottom"],
    explain: "Barely touch, never set the weight down, and change direction without firing out.",
    topicId: "mastery-lower-turnarounds",
    quote: "There are three simple rules to properly performing a lower turnaround",
  }),
  academy({
    id: "bottom-row",
    deck: "rep",
    prompt: "On the compound row or the pulldown the stack may not touch. Where is the bottom?",
    options: ["Where the elbows straighten", "Where the stack touches", "Halfway down", "Wherever the client stops"],
    explain: "On those exercises the elbows straightening is the bottom; on most others the stack touches, softly.",
    topicId: "mastery-lower-turnarounds",
    quote: "the bottom is defined by the elbows straightening",
  }),
  academy({
    id: "loadup-time",
    deck: "rep",
    prompt: "Over how long does Exercise Performance picture a gradual load up?",
    options: ["3 seconds or more", "Under a second", "Exactly 10 seconds", "As quickly as possible"],
    explain:
      "Three or more seconds, and a leg press may take five or more. The time matters less than a gradual build of force.",
    topicId: "performance-gradual-load-up",
    quote: "This entire mental picture is applied over a time frame of 3 or more seconds.",
  }),
  academy({
    id: "gradual-not-slow",
    deck: "rep",
    prompt: "True or false: a gradual load up just means starting slowly.",
    truth: false,
    explain: "Slowly is about speed. Gradual means an effort that builds by increments, starting before anything moves.",
    topicId: "mastery-gradual-load-up",
    quote: "Gradual indicates a graded or incrementally increasing effort.",
  }),
  academy({
    id: "101",
    deck: "rep",
    prompt: "There are 100 pounds on the stack. In a gradual load up, what is the client looking for?",
    options: ["101 pounds of pressure", "150 pounds of pressure, fast", "50 pounds, then a jump", "Whatever gets it moving quickest"],
    explain: "The least force that lifts the weight: build evenly from no movement until the force is just greater than the load.",
    topicId: "mastery-gradual-load-up",
    quote: "we are trying to gradually find 101 pounds of pressure",
  }),
  academy({
    id: "five-phases",
    deck: "rep",
    kind: "order",
    prompt: "Put the five phases of a repetition in order.",
    options: [
      "Initiation: a gradual load up or a handoff",
      "The concentric (lifting) phase",
      "The upper turnaround",
      "The eccentric (lowering) phase",
      "The lower turnaround",
    ],
    explain: "One continuous cycle of five phases, described apart only for clarity.",
    topicId: "summary-exercise-performance",
    quote: "a continuous cycle consisting of five distinct phases",
  }),
  academy({
    id: "two-ways-to-begin",
    deck: "rep",
    prompt: "Every exercise begins in one of two ways. Which two?",
    options: [
      "A gradual load up or a handoff",
      "A warm-up set or a practice rep",
      "A fast start or a slow start",
      "A squeeze or a pause",
    ],
    explain: "They are the only acceptable ways to begin, and always under the instructor's direct guidance.",
    topicId: "summary-exercise-performance",
    quote: "Every exercise begins in one of two ways within the MSF methodology: a gradual load up or a handoff.",
  }),
  academy({
    id: "lower-continuous",
    deck: "rep",
    prompt: "True or false: the lower turnaround is always continuous.",
    truth: true,
    explain: "The upper turnaround may be a brief pause or continuous. The lower turnaround is always continuous.",
    topicId: "summary-exercise-performance",
    quote: "Lower turnaround: always continuous",
  }),
  academy({
    id: "learn-reps",
    deck: "rep",
    prompt: "While a client is learning a new exercise, what range of reps does the Academy say may suit them better?",
    options: ["8 to 15", "1 to 3", "20 to 30", "Exactly 10"],
    explain: "A lighter weight and more reps give room to learn the details. The Academy calls its ranges guidance, never rules.",
    topicId: "performance-set-duration",
    quote: "Anywhere from 8 to 15 repetitions may be more optimal in this case.",
  }),
  academy({
    id: "ranges-guidance",
    deck: "rep",
    prompt: "True or false: the Academy calls its rep ranges guidance for choosing a load, not rules set in stone.",
    truth: true,
    explain: "They help pick a load that is challenging but still well within the client's control.",
    topicId: "performance-set-duration",
    quote: "these parameters are not set in stone but rather guidance put in place to facilitate load selection",
  }),
  academy({
    id: "squeeze-what",
    deck: "rep",
    prompt: "When you ask a client to squeeze, what should they squeeze?",
    options: ["The target muscle, not the hands", "The handles, as hard as they can", "Their jaw", "Every muscle at once"],
    explain: "The squeeze continues the contraction of the targeted muscle, with no further movement.",
    topicId: "mastery-squeeze-technique",
    quote: "continue the contraction of the targeted muscle (not the hands)",
  }),
  academy({
    id: "after-click",
    deck: "rep",
    prompt: "The client is squeezing and you click. Can they start lowering straight away?",
    options: [
      "No: they ease the effort down first, then resume slowly",
      "Yes, as fast as they can",
      "Yes, and they let the weight drop",
      "No: they hold for ten more seconds",
    ],
    explain: "In the squeeze the effort is well above what the lowering needs, so the client eases out of it before moving.",
    topicId: "mastery-squeeze-technique",
    quote: "we cannot yet resume movement",
  }),

  /* ── The machines ───────────────────────────────────────────────── */
  academy({
    id: "no-squeeze-machine",
    deck: "machines",
    prompt: "Which of these machines has no pause or squeeze at the top?",
    options: ["Chest Press", "Leg Curl", "Biceps Curl", "Adduction"],
    explain:
      "Leg Press, Chest Press, Overhead Press and Seated Dip move continuously at the top, and the instructor times the click to the movement.",
    topicId: "mastery-exercise-categories-postureexecutiongaps",
    quote: "Continuous movement with no pause or squeeze",
  }),
  academy({
    id: "neutral-takeoff",
    deck: "machines",
    prompt: "On which exercise does the instructor take the load back from the client in the neutral position?",
    options: ["Cervical Extension", "Leg Press", "Chest Flye", "Torso Rotation"],
    explain: "Cervical Extension begins with a handoff, and it is the only one the instructor takes back in the neutral position.",
    topicId: "mastery-exercise-categories-postureexecutiongaps",
    quote: "the only exercise that the instructor will take from the client in the neutral position when finished",
  }),
  academy({
    id: "finish-hold",
    deck: "machines",
    prompt:
      "On the Leg Press, Chest Press, Overhead Press and Seated Dip, a client who doesn't reach failure can finish with a hold. Where, and for how long?",
    options: [
      "About the midpoint of the last lowering, for 5 to 10 seconds",
      "At the bottom, for a full minute",
      "At the top, for 2 seconds",
      "Anywhere, for as long as possible",
    ],
    explain: "The last rep pauses at about the midpoint of its lowering while the instructor counts down 5 to 10 seconds.",
    topicId: "mastery-exercise-categories-postureexecutiongaps",
    quote: "A count of 5 to 10 seconds is usually performed here while the subject works to hold their midpoint position.",
  }),
  academy({
    id: "ppt",
    deck: "machines",
    prompt: "Which of these is done with a posterior pelvic tilt (a contracted abdomen) rather than chest up?",
    options: ["Overhead Press", "Leg Press", "Compound Row", "Leg Extension"],
    explain:
      "Overhead Press, Lateral Raise, Abdominals, Pullover, Seated Dip and Torso Rotation take a posterior pelvic tilt; the rest are chest up.",
    topicId: "mastery-exercise-categories-postureexecutiongaps",
    quote: "Posterior Pelvic Tilt (contracted abdomen)",
  }),
  academy({
    id: "axis",
    deck: "machines",
    prompt: "On a single-joint machine, what should the machine's axis of rotation line up with?",
    options: ["The center of the joint being used", "The top of the seat", "The client's chin", "The weight stack"],
    explain: "For single-joint movements the machine's axis meets the joint's center. Compound exercises line up less literally.",
    topicId: "continuous-tension-other-factors-to-consider",
    quote: "the axis of rotation of the machine should be aligned with the center of the joint that is being used",
  }),
  academy({
    id: "leg-press-lockout",
    deck: "machines",
    prompt: "Why avoid locking the knees straight at the top of the leg press?",
    options: [
      "The thigh muscles unload as the knee nears straight",
      "It makes the click hard to time",
      "It is how the squeeze is done",
      "It shortens the rest between machines",
    ],
    explain:
      "Near full extension the load rests on the bones, outside the effective range. On the leg extension it is the opposite: straighten fully.",
    topicId: "performance-range-of-motion",
    quote: "excessive knee extension should be avoided on the leg press",
  }),

  /* ── The method ─────────────────────────────────────────────────── */
  academy({
    id: "valsalva-first",
    deck: "method",
    prompt: "Beyond the pace and the turnarounds, what is the most important factor in the protocol?",
    options: [
      "Preventing the Valsalva maneuver (holding the breath)",
      "Using the heaviest weight possible",
      "Moving as fast as possible",
      "Doing more sets",
    ],
    explain: "Holding the breath while exerting is instinctive, and held for long it raises blood pressure and alters cardiac output.",
    topicId: "continuous-tension-other-factors-to-consider",
    quote: "The most important of the other factors is the prevention of the Valsalva maneuver.",
    fact: "method:breath-hold",
  }),
  academy({
    id: "breath-increase",
    deck: "method",
    prompt: "True or false: a client's breathing should increase as their effort increases.",
    truth: true,
    explain: "As on a flight of stairs: the harder the muscles work, the more the breathing rises to support them.",
    topicId: "continuous-tension-other-factors-to-consider",
    quote: "those respirations should actually increase with exertion",
  }),
  academy({
    id: "getset",
    deck: "method",
    prompt: "What is it called when the client is positioned at the start of an exercise and locks that posture in?",
    options: ["The get-set", "The load up", "The handoff", "The squeeze"],
    explain: "The client locks the get-set posture in place, and holding it is part of the exercise's benefit.",
    topicId: "continuous-tension-other-factors-to-consider",
    quote: "When a trainee is positioned at the beginning of an exercise",
  }),
  academy({
    id: "valsalva-danger",
    deck: "method",
    prompt: "Why should a client never hold their breath to get through a hard part of the set?",
    options: [
      "It can be dangerous with certain heart, brain or eye conditions",
      "It makes the click hard to hear",
      "It counts as an extra rep",
      "It turns the set into a static hold",
    ],
    explain: "Holding the breath gives a brief boost of force, but the Valsalva maneuver should be avoided at all costs.",
    topicId: "mastery-breathing",
    quote: "particularly those involving the heart, brain, or eyes",
    fact: "method:breath-hold",
  }),
  academy({
    id: "mission",
    deck: "method",
    prompt: "Finish the mission: MaxStrength Fitness helps busy adults be healthy, fit, and strong in only…",
    options: [
      "twenty minutes twice a week without breaking a sweat",
      "an hour a day, five days a week",
      "thirty minutes three times a week",
      "ten minutes every morning",
    ],
    explain: "The mission sets the standard for every location and every client interaction.",
    topicId: "intro-mission",
    quote:
      "MaxStrength Fitness helps busy adults be healthy, fit, and strong in only twenty minutes twice a week without breaking a sweat.",
  }),
  academy({
    id: "lineage",
    deck: "method",
    prompt: "The MaxStrength Fitness protocol is an evolution of whose high-intensity training principles?",
    options: [
      "Arthur Jones, the inventor of Nautilus equipment",
      "Chris Beardsley",
      "Peter Attia",
      "Henneman, of the size principle",
    ],
    explain: "The Academy traces the protocol to the Nautilus high-intensity training principles of Arthur Jones.",
    topicId: "intro-philosophy",
    quote: "an evolution of the Nautilus high-intensity training principles of Arthur Jones",
  }),
  academy({
    id: "beardsley",
    deck: "method",
    prompt: "Who developed the Stimulating Reps model the Academy teaches?",
    options: ["Chris Beardsley", "Arthur Jones", "Peter Attia", "Henneman, of the size principle"],
    explain:
      "The model explains which reps in a set stimulate growth: the last ones, with very high effort and involuntary slowing.",
    topicId: "principles-productive-exercise-the-stimulating-reps-model",
    quote: "The Stimulating Reps model, developed by Chris Beardsley",
  }),
  academy({
    id: "involuntary",
    deck: "method",
    prompt: "At MSF, what is the single most important sign of a stimulating effort?",
    options: [
      "Involuntary slowing of the movement arm during the lift",
      "Sweating",
      "A fast last rep",
      "Reaching a set number of reps",
    ],
    explain: "The movement slows because the client is near the limit of what they can recruit, not because they chose to slow down.",
    topicId: "principles-productive-exercise-the-stimulating-reps-model",
    quote: "Involuntary slowing of the movement arm during the concentric phase",
  }),
  academy({
    id: "po-not-forced",
    deck: "method",
    prompt: "True or false: adding weight or reps every workout is what ensures progressive overload.",
    truth: false,
    explain:
      "Progressive overload is the evidence of a strength gain: doing something this workout that wasn't possible before. Adding weight, reps or sets doesn't ensure it.",
    topicId: "principles-progressive-overload-and-intensity",
    quote: "None of these actions will ensure a strength gain.",
  }),
  academy({
    id: "one-set",
    deck: "method",
    prompt: "How many sets of each exercise does the Continuous Tension method use?",
    options: ["One", "Two", "Three", "As many as the client can tolerate"],
    explain: "Research finds little difference between one and several sets for most people, and fewer sets suit high intensity.",
    topicId: "principles-volume",
    quote: "only one set per exercise is performed utilizing our Continuous Tension method",
  }),
  academy({
    id: "exercise-count",
    deck: "method",
    prompt: "The Academy's Volume topic: for most clients, how many exercises make a workout?",
    options: ["Between 5 and 8", "Between 12 and 15", "Just one", "As many as time allows"],
    explain: "Few enough to keep the intensity high and avoid junk volume, while still covering the major muscle groups.",
    topicId: "principles-volume",
    quote: "this will be between 5 to 8 exercises total",
  }),
  academy({
    id: "intensity-drives",
    deck: "method",
    prompt: "What drives the benefits a client gets: the volume of exercise, or the intensity of their effort?",
    options: ["The intensity of their effort", "The volume", "The number of exercises", "The time spent in the studio"],
    explain: "Clients often believe more exercise is better, so the Exercise Practitioner keeps teaching that effort is what counts.",
    topicId: "principles-volume",
    quote: "but rather the intensity of their effort",
  }),
  academy({
    id: "frequency",
    deck: "method",
    prompt: "How often does the research the Academy cites support training the whole body?",
    options: ["Two, and at most three, times a week", "Every day", "Once a month", "Five times a week"],
    explain: "Two or three sessions give similar results when weekly volume is equal, and recovery needs the days between.",
    topicId: "principles-frequency",
    quote: "supports training the entire body two, and at most three, times per week",
  }),
  academy({
    id: "myops",
    deck: "method",
    prompt: "After a high-intensity workout, about how long does muscle protein synthesis stay raised?",
    options: ["48 to 72 hours", "About an hour", "About a week", "About 12 hours"],
    explain: "The Academy puts the raised period at somewhere between 48 and 72 hours, which fits training two or three times a week.",
    topicId: "principles-frequency",
    quote: "tends to last somewhere between 48 to 72 hours",
  }),
  academy({
    id: "said",
    deck: "method",
    prompt: "What does the SAID principle stand for?",
    options: [
      "Specific Adaptation to Imposed Demand",
      "Strength And Intensity Development",
      "Slow And Increasing Duration",
      "Set, Adapt, Increase, Demand",
    ],
    explain: "Adaptations to exercise are specific to the kind of stimulus the body meets.",
    topicId: "principles-specificity",
    quote: "SAID (Specific Adaptation to Imposed Demand)",
  }),
  academy({
    id: "path",
    deck: "method",
    prompt: "In the Four P's, what does Path mean?",
    options: [
      "The plane of motion: the movement pattern a limb follows",
      "The order of the machines",
      "The walk between machines",
      "The pace of the lowering",
    ],
    explain: "The path decides which muscle fibers are loaded, so it stays the same for the whole set.",
    topicId: "mastery-path",
    quote: "Path refers to the plane of motion, or movement pattern",
  }),
  academy({
    id: "elbows-tuck",
    deck: "method",
    prompt: "A client starts the compound row with elbows wide and tucks them in as they tire. What happened?",
    options: [
      "They switched to a different exercise mid-set",
      "They made the set more effective",
      "Nothing: the elbows don't matter",
      "They reached true failure",
    ],
    explain: "Changing the path shifts the load onto other fibers, so there's a good chance none are fully stimulated.",
    topicId: "mastery-path",
    quote: "we are essentially performing a different exercise",
  }),
  academy({
    id: "pace-governs",
    deck: "method",
    prompt: "In the Mastery Series, what does pace govern?",
    options: ["Effort", "Rest time", "The weight on the stack", "The number of machines"],
    explain: "To hold the pace as fatigue builds, the client has to push harder, and that rising effort is what makes training work.",
    topicId: "mastery-pace",
    quote: "Pace governs effort",
  }),
  academy({
    id: "pace-consistent",
    deck: "method",
    prompt: "True or false: the point of Pace is simply to move slowly.",
    truth: false,
    explain: "The focus is one consistent, smooth pace, 6 to 10 seconds each way, with the lift and the lowering the same.",
    topicId: "mastery-pace",
    quote: "what our focus should really be on is maintaining a CONSISTENT pace",
  }),
  academy({
    id: "posture-shift",
    deck: "method",
    prompt: "A client's posture shifts in the middle of a set. What does the Mastery Series say has happened?",
    options: [
      "It has become a different exercise, using different muscles",
      "Nothing important",
      "The set got more effective",
      "They reached failure",
    ],
    explain: "Head, torso, ribcage and spine stay rigidly still. A shift changes the exercise, loses leverage and can bring a safety issue.",
    topicId: "mastery-posture",
    quote: "targeting different motor units",
  }),
  academy({
    id: "purpose-lifetime",
    deck: "method",
    prompt: "Which of the Four P's could take a lifetime of work?",
    options: ["Purpose", "Posture", "Pace", "Path"],
    explain: "The first three can be learned in a handful of workouts. Purpose, the mental approach during the set, is the work of a lifetime.",
    topicId: "mastery-purpose",
    quote: "could take a lifetime of work",
  }),
  academy({
    id: "tolerant",
    deck: "method",
    prompt: "How does a client become more tolerant of hard training?",
    options: ["By training", "By resting more between sets", "By staying on light weights", "By skipping the hard machines"],
    explain: "Tolerance of intense effort is built by doing it, which the Mastery Series calls the real secret behind lifelong results.",
    topicId: "mastery-purpose",
    quote: "We become more tolerant of training by training.",
  }),
  academy({
    id: "purpose-def",
    deck: "method",
    prompt: "In the Four P's, what is Purpose?",
    options: [
      "The real objective: as many fibers under as much tension as we can create",
      "Finishing the set as fast as possible",
      "Lifting more weight every week",
      "Getting through every machine",
    ],
    explain: "Posture is how we are braced, Pace our speed, Path our plane of motion, and Purpose the real objective of the training.",
    topicId: "mastery-gradual-load-up",
    quote: "Purpose - the real objective of resistance training.",
  }),
  academy({
    id: "effort-pace",
    deck: "method",
    prompt: "When it comes to training harder, which external factor matters most?",
    options: ["Keeping the pace", "Lifting faster", "Adding machines", "Talking through the set"],
    explain: "Focus on posture, pace and path instead of the discomfort, and on the pace above all.",
    topicId: "mastery-effort",
    quote: "the most important external factor when it comes to training harder is without a doubt, maintaining your PACE",
  }),
  academy({
    id: "tsc",
    deck: "method",
    prompt: "How is a standard Timed Static Contraction laid out?",
    options: [
      "90 seconds: three 30-second intervals at 50%, 75% and 100% effort",
      "30 seconds at full effort",
      "Ten 10-second pushes with rests between",
      "As long as the client can hold a heavy weight",
    ],
    explain:
      "One continuous effort in three 30-second steps: moderate, almost as hard as you can, as hard as you can. It can be shortened for an injured client.",
    topicId: "variations-timed-static-contraction-tsc",
    quote: "The standard approach is an isometric effort applied for a continuous duration of 90 seconds.",
  }),
  academy({
    id: "tsc-safest",
    deck: "method",
    prompt: "Why may a Timed Static Contraction be the safest way to strength train?",
    options: [
      "No load is actually held or supported",
      "It uses the heaviest weight",
      "It is done at full speed",
      "It skips the turnarounds by moving faster",
    ],
    explain: "The movement arm is fixed in place, so the client pushes against something that cannot move.",
    topicId: "variations-timed-static-contraction-tsc",
    quote: "there is no actual load being held or supported",
  }),
  academy({
    id: "surgery",
    deck: "method",
    prompt:
      "True or false: a client back from surgery who hasn't finished physical therapy can have the affected area trained with a gentle TSC.",
    truth: false,
    explain: "Without medical clearance the affected area is not trained or involved at all; the client trains around it.",
    topicId: "variations-timed-static-contraction-tsc",
    quote: "we WILL NOT TRAIN OR INVOLVE THE AFFECTED AREA",
  }),
  academy({
    id: "static-hold-load",
    deck: "method",
    prompt: "For a healthy client, how does a static hold's load compare with their dynamic set?",
    options: ["Slightly more, about 10 to 20%", "Half the weight", "Double the weight", "Exactly the same"],
    explain: "Slightly more for an uninjured client, less for an injured or compromised joint, and always on the conservative side.",
    topicId: "variations-static-hold-sh",
    quote: "slightly more resistance (+10 to 20%)",
  }),
  academy({
    id: "forced-reps",
    deck: "method",
    prompt: "How often should forced reps be used?",
    options: [
      "Rarely, and only by a seasoned instructor",
      "On every set's last rep",
      "Whenever a client asks",
      "Every other workout",
    ],
    explain: "They carry risk for the client and the trainer and can build dependence, so they are a last resort.",
    topicId: "variations-forced-reps",
    quote: "This technique should be used RARELY and only by a seasoned instructor.",
  }),
  academy({
    id: "osteo",
    deck: "method",
    prompt: "True or false: strength training is safe for someone with osteoporosis when it is done correctly and supervised.",
    truth: true,
    explain: "Exercises are controlled, customized and progressed gradually, so muscles and bones adapt without unnecessary strain.",
    topicId: "mastery-faq",
    quote: "Yes, when it is done correctly and under proper supervision.",
  }),
  academy({
    id: "walking",
    deck: "method",
    prompt: "A client asks why walking isn't enough for their bones. What does the Academy's FAQ answer?",
    options: [
      "Walking doesn't give bones enough stimulus to strengthen",
      "Walking is bad for bones",
      "Walking is just as good",
      "Bones don't respond to exercise",
    ],
    explain: "Walking is excellent for overall health, but bones need external resistance to adapt and stay strong.",
    topicId: "mastery-faq",
    quote: "it does not provide enough stimulus to meaningfully strengthen bones",
  }),
  academy({
    id: "bulky",
    deck: "method",
    prompt: "“I don't want to get bulky.” What does the Academy's FAQ answer?",
    options: [
      "The muscular response is genetically mediated and can't be changed",
      "Stay on light weights forever",
      "Only train the legs",
      "Do more reps to tone",
    ],
    explain: "The FAQ's answer: how muscle responds to resistance training is set by genetics.",
    topicId: "mastery-faq",
    quote: "The muscular response to resistance training is genetically mediated and it cannot be changed.",
  }),
  academy({
    id: "falls",
    deck: "method",
    prompt: "In people with low bone density, what is the most common cause of fractures?",
    options: ["Falls", "Lifting weights", "Walking", "Stretching"],
    explain: "Stronger muscles support the bones, steady the joints and lower the risk of falls.",
    topicId: "mastery-faq",
    quote: "lower the risk of falls, which is the most common cause of fractures",
  }),
  academy({
    id: "task-failure",
    deck: "method",
    prompt: "Which term does the Continuous Tension Method prefer for what used to be called muscular failure?",
    options: ["Task failure", "Total failure", "Muscle collapse", "Rep failure"],
    explain:
      "A client stops because the brain decides to stop the task on signals from the working muscles, not because the muscles themselves fail.",
    topicId: "continuous-tension-what-makes-the-continuous-tension-method-",
    quote: "task failure is the preferred physiological term",
  }),
  academy({
    id: "fatigue-not-stimulus",
    deck: "method",
    prompt: "True or false: fatigue is the stimulus for growth, so a client should rush between machines.",
    truth: false,
    explain: "Fatigue hinders the workout. Let breathing begin to settle, usually 60 to 120 seconds or so, judged by watching, not timing.",
    topicId: "performance-rest-interval-between-exercises",
    quote: "fatigue is not a stimulus for hypertrophy",
  }),
];

/* ------------------------------------------------------------------ *
 * The floor and the conversation (docs/business and two READMEs)
 * ------------------------------------------------------------------ */

export interface FileSupport {
  /** Repo-relative path of the file the fact comes from. */
  path: string;
  /** A short, exact quote (markdown emphasis aside) from that file. */
  quote: string;
}

export interface FloorQuestion extends QuizItem {
  support: FileSupport;
}

export const FLOOR_PATH = "docs/business/the-floor.md";
export const RENEWALS_PATH = "docs/business/renewals.md";
export const PACKAGES_PATH = "docs/business/packages-and-pricing.md";
export const FORD_PATH = "src/features/ford/README.md";
export const REPORT_PATH = "src/features/progress-report/README.md";

const FILE_LABEL: Record<string, string> = {
  [FLOOR_PATH]: "Journey's notes · The floor",
  [RENEWALS_PATH]: "Journey's notes · Renewals and retention",
  [PACKAGES_PATH]: "Journey's notes · Packages",
  [FORD_PATH]: "Journey's notes · FORD",
  [REPORT_PATH]: "Journey's notes · The progress report",
};

interface FloorDraft {
  id: string;
  kind?: "choice" | "truefalse" | "order";
  prompt: string;
  options?: string[];
  truth?: boolean;
  explain: string;
  path: string;
  quote: string;
}

function floor(d: FloorDraft): FloorQuestion {
  const kind = d.kind ?? (d.truth === undefined ? "choice" : "truefalse");
  return {
    id: `f-${d.id}`,
    deck: "playbooks",
    kind,
    prompt: d.prompt,
    options: kind === "truefalse" ? TRUE_FALSE.slice() : (d.options ?? []).slice(),
    answer: kind === "order" ? -1 : kind === "truefalse" ? (d.truth ? 0 : 1) : 0,
    explain: d.explain,
    source: { label: FILE_LABEL[d.path] ?? d.path, route: null, path: d.path },
    support: { path: d.path, quote: d.quote },
    fact: `f:${d.id}`,
  };
}

export const FLOOR_QUESTIONS: FloorQuestion[] = [
  floor({
    id: "twenty-minutes",
    prompt: "How long is a client's session, and what happens in it?",
    options: [
      "About 20 minutes: one set to failure on five to eight machines",
      "An hour: three sets on every machine",
      "Forty-five minutes of circuits",
      "Twenty minutes: two sets on ten machines",
    ],
    explain: "Twice a week, one-on-one, slow and controlled, and the trainer runs the app so the client keeps their focus.",
    path: FLOOR_PATH,
    quote: "one set to failure on five to eight machines",
  }),
  floor({
    id: "clicker",
    prompt: "Who counts the reps in a set?",
    options: ["The trainer, on a mechanical clicker", "The iPad, automatically", "The client, out loud", "Nobody: reps aren't counted"],
    explain: "The clicker counts the reps and is the client's audio cue, done by hand, never by the app.",
    path: FLOOR_PATH,
    quote: "done by hand, never by the app",
  }),
  floor({
    id: "two-looks",
    prompt: "How often does a trainer look at the iPad at each machine?",
    options: [
      "Twice: walking up, and walking away",
      "Before every rep",
      "Once, at the end of the session",
      "Never while the client is on a machine",
    ],
    explain: "Walking up: which machine, which settings, what weight; walking away: reps, quality, anything to note. Everything else is the client.",
    path: FLOOR_PATH,
    quote: "The trainer looks at the iPad twice per machine",
  }),
  floor({
    id: "guide-and-log",
    prompt: "In a session, what is the iPad?",
    options: [
      "A guide for set-up and a log for outcomes",
      "A coach that tells the client what to do",
      "A script to read out",
      "A timer for every rep",
    ],
    explain: "It says which machine, which settings and weight, and what happened last time, then takes what happened. Not a script, not a coach.",
    path: FLOOR_PATH,
    quote: "A guide for set-up and a log for outcomes. Not a script, not a coach.",
  }),
  floor({
    id: "no-suggestion",
    prompt: "True or false: Journey tells the trainer when to move a client's weight up.",
    truth: false,
    explain: "The app never decides a progression. It shows what a change did, never a suggestion to move the weight.",
    path: FLOOR_PATH,
    quote: "Never a suggestion to move the weight.",
  }),
  floor({
    id: "three-and-fifteen",
    prompt: "True or false: a client who fails at 3 reps and a client who fails at 15 can both be training correctly.",
    truth: true,
    explain: "Every set aims at failure, advised inside 6 to 10 reps, but the rep count is never the target.",
    path: FLOOR_PATH,
    quote: "a client who fails at 3 and a client who fails at 15 are both training correctly",
  }),
  floor({
    id: "weight-first",
    prompt: "Which recorded value matters most?",
    options: ["The weight, because it is what progresses", "The number of reps", "How long the session ran", "How the client felt walking in"],
    explain: "Reps change with sleep, stress and meals; the weight is what progresses, and the 4 P's keep the quality.",
    path: FLOOR_PATH,
    quote: "the most important recorded value",
  }),
  floor({
    id: "between-machines",
    prompt: "About how long does the move between machines take?",
    options: ["One to two minutes", "Ten seconds", "Five minutes", "As long as the client likes"],
    explain: "Get the client out, walk, pull the selector pin, set the seat, gap, back pad and handle, belt them in, brief them, start.",
    path: FLOOR_PATH,
    quote: "Between machines is one to two minutes",
  }),
  floor({
    id: "nobody-remembered",
    prompt: "A client's anniversary is coming up. Why doesn't Journey send them an automatic message?",
    options: [
      "An automated message would prove nobody remembered",
      "Messages cost too much",
      "Clients don't like anniversaries",
      "Only leaders may send messages",
    ],
    explain: "The app never contacts anyone. It shows the moment to a person, and a person acts on it.",
    path: FLOOR_PATH,
    quote: "because it proves nobody remembered",
  }),
  floor({
    id: "red-ring",
    prompt: "What is the red kaizen ring a judgement about?",
    options: ["That set, not the client that day", "The client's whole session", "The trainer's coaching", "The machine's condition"],
    explain: "One tap when any of the 4 P's broke. It warns the next trainer, and it never moves the weight.",
    path: FLOOR_PATH,
    quote: "A judgement about that set, not about the client that day.",
  }),
  floor({
    id: "ten-before",
    prompt: "When do trainers try to start the renewal conversation?",
    options: ["About 10 sessions before the end", "On the very last session", "The day after the package ends", "Only when the client asks"],
    explain: "Each studio can set its own timing; about ten sessions before the end is how trainers do it today.",
    path: RENEWALS_PATH,
    quote: "about 10 sessions before the end",
  }),
  floor({
    id: "lead-with-health",
    prompt: "What should a renewal conversation lead with?",
    options: [
      "Health: InBody, sleep, energy, pain, consistency",
      "The price list",
      "A deadline to sign",
      "The package most people pick",
    ],
    explain: "Price is the biggest worry, so lead with health, and with the math that a longer package lowers every payment.",
    path: RENEWALS_PATH,
    quote: "the renewal conversation should lead with health (InBody, sleep, energy, pain, consistency)",
  }),
  floor({
    id: "who-steps-in",
    prompt: "At renewal, a client has doubts about price or progress. Who steps in?",
    options: ["A head trainer or studio leader", "Nobody: the app sends a reminder", "Another client", "Mindbody"],
    explain: "Trainers ask and log what the client said; head trainers and studio leaders get involved over price or progress.",
    path: RENEWALS_PATH,
    quote: "Head trainers and studio leaders get involved when the client has concerns about price or progress",
  }),
  floor({
    id: "never-expire",
    prompt: "Do a client's unused sessions expire?",
    options: ["No, sessions never expire", "Yes, after 30 days", "Yes, after 90 days", "Yes, when the payments finish"],
    explain: "Confirmed for every studio. The Academy's consultation script still says 30, 60 or 90 days, and that line is out of date.",
    path: PACKAGES_PATH,
    quote: "unused sessions are never lost",
  }),
  floor({
    id: "uses-a-session",
    prompt: "What uses up one of a client's sessions?",
    options: [
      "Coming in, or cancelling with less than 24 hours' notice",
      "Any cancellation at all",
      "Time away on vacation",
      "Booking the session",
    ],
    explain: "Time away does not use a session.",
    path: PACKAGES_PATH,
    quote: "coming in, or cancelling with less than 24 hours' notice",
  }),
  floor({
    id: "lowers-every-payment",
    prompt: "A client asks, “Can I afford this?” Which line answers it?",
    options: [
      "A longer commitment lowers every payment",
      "This package is the most popular",
      "The offer ends today",
      "Everyone picks the biggest one",
    ],
    explain: "Price is the number-one reason clients give for leaving, and this is the line that answers it. Each studio's prices are its own.",
    path: PACKAGES_PATH,
    quote: "a longer commitment lowers every payment",
  }),
  floor({
    id: "ford",
    prompt: "What does FORD stand for?",
    options: [
      "Family, Occupation, Recreation, Dreams",
      "Fitness, Objectives, Results, Diet",
      "Focus, Order, Reps, Discipline",
      "Friends, Outings, Routines, Days",
    ],
    explain: "The frame for what to catch about a client as a person, so it can turn into something someone actually does.",
    path: FORD_PATH,
    quote: "Family, Occupation, Recreation, Dreams",
  }),
  floor({
    id: "community",
    prompt: "Why does a studio like ours build community on purpose?",
    options: [
      "Twenty minutes, one-on-one: there's almost no natural chance for it",
      "Clients asked for a lounge",
      "Mindbody requires it",
      "To sell more packages",
    ],
    explain: "No class, no lounge, nobody hanging around afterwards, so the relationship is built in the minutes either side of the set.",
    path: FORD_PATH,
    quote: "a studio like this has almost no natural opportunity to build community",
  }),
  floor({
    id: "remember-this",
    prompt: "Mid-set, a client mentions a grandson's graduation. Must you choose a FORD category before saving it?",
    options: [
      "No: one box, one button, no category required",
      "Yes, always",
      "Only for Family",
      "It can't be saved until the session ends",
    ],
    explain: "The category can wait for teardown. Requiring it would put a decision between hearing the thing and recording it.",
    path: FORD_PATH,
    quote: "One box, one button, no category required",
  }),
  floor({
    id: "report-order",
    kind: "order",
    prompt: "Put the progress report conversation in order.",
    options: ["Celebrate", "Show the wins", "Show the numbers", "Say the hard thing", "Leave them with a goal and a date"],
    explain: "The order is the pitch: a client who has just been congratulated hears the hard thing very differently.",
    path: REPORT_PATH,
    quote: "celebrate, show the wins, show the numbers, say the hard thing, leave them with a goal and a date",
  }),
  floor({
    id: "three-accolades",
    prompt: "How many accolades does a progress report hold?",
    options: ["Exactly three, each backed by data", "As many as the trainer likes", "One for every machine", "Ten"],
    explain: "A slot the data can't back says not enough data yet, and never prints.",
    path: REPORT_PATH,
    quote: "Exactly three data-backed wins",
  }),
  floor({
    id: "ninety-days",
    prompt: "When does the trainer follow up on the goal set in a progress report?",
    options: ["In 90 days", "At the next session", "In a year", "Never: the report is final"],
    explain: "The follow-up date is the one the trainer chases in 90 days, and the next report starts from how that goal went.",
    path: REPORT_PATH,
    quote: "the date the trainer chases in 90 days",
  }),
];
