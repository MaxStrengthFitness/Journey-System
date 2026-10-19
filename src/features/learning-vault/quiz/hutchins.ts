/**
 * "WHY WE TRAIN THIS WAY" — Ken Hutchins' definition of exercise, clause by
 * clause, and what Journey built from each clause.
 *
 * Round: the Learning vault redesign, Oct 19 2026. AJ asked for a game mode
 * that teaches "even the renaissance of exercise".
 *
 * WHAT THIS DECK MAY SAY, AND WHAT IT MAY NOT
 * ------------------------------------------
 * The Renaissance of Exercise is not in the repository. AJ's standing rule
 * (Sep 27 2026; docs/rounds/2026-09-28-codex-source-check.md:15) is to
 * paraphrase it with a book reference and never quote it. The one thing the
 * repo holds is Hutchins' definition of exercise, which AJ recorded in
 * docs/business/the-floor.md (Sep 21 2026) with a table mapping each of its
 * eight clauses to a rule Journey built. So this deck is exactly that: each
 * clause PARAPHRASED (never the sentence itself), and the floor's own table
 * of what came of it. Nothing else about the book is claimed, because the
 * repo has nothing else to stand on.
 *
 * hutchins.test.ts reads the-floor.md and fails if any string in this deck
 * shares a run of six or more consecutive words with the quoted definition.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { QuizSource } from "../types";
import type { QuizItem } from "./decks";

export const HUTCHINS_LABEL =
  "Paraphrased from Ken Hutchins' definition of exercise (The Renaissance of Exercise)";

/** Where the definition and its clause table live in the repo. */
export const HUTCHINS_PATH = "docs/business/the-floor.md";

/** The lines of that file the deck rests on: the definition and its table. */
export const HUTCHINS_LINES = { from: 7, to: 31 } as const;

export const HUTCHINS_SOURCE: QuizSource = {
  label: HUTCHINS_LABEL,
  route: null,
  path: HUTCHINS_PATH,
  paraphrased: true,
};

/**
 * The eight clauses, in the definition's order, each in Journey's own
 * words, with what the floor built from it (the-floor.md:22-31, restated).
 */
export const CLAUSES: { id: string; clause: string; built: string; why: string }[] = [
  {
    id: "demanding",
    clause: "Hard, demanding work",
    built: "One set to failure, and only a performed set counts toward an average",
    why: "Exercise has to be hard work, so the set goes to failure and a set that wasn't performed never moves a number.",
  },
  {
    id: "function",
    clause: "Moving the way muscles and joints are built to move",
    built: "Every machine carries its musculature, movement pattern and kinematics, owned by head office",
    why: "How a body is meant to move is the method's job, so it is written once, by head office, for every floor.",
  },
  {
    id: "clinical",
    clause: "A calm, clinically controlled setting",
    built: "Sentences, not scores: no hype, no celebration, never a confident wrong number",
    why: "A controlled setting is calm and exact, so the app speaks in plain sentences and never claims more than it knows.",
  },
  {
    id: "safety",
    clause: "Kept within safe limits",
    built: "A studio adds a warning freely, and takes a safety line off only with a reason on record",
    why: "Safety is add-first: a warning is always welcome, and removing one is a decision someone stands behind.",
  },
  {
    id: "loading",
    clause: "Loading the muscles meaningfully",
    built: "The weight and the settings are stated on the Now Bar, never assumed",
    why: "The machine is almost never already right when a trainer walks up, so the load is said out loud, every time.",
  },
  {
    id: "inroad",
    clause: "Inroading the muscles' strength",
    built: "Rep quality is the measure, not rep count, and the red kaizen mark is kept for it",
    why: "What counts is how deeply the muscle was worked with good reps, so quality is what gets marked.",
  },
  {
    id: "growth",
    clause: "Stimulating the body to grow",
    built: "A practice set is recorded in full but never averaged",
    why: "A practice set is movement, not exercise, so it can never move a number that claims to measure exercise.",
  },
  {
    id: "time",
    clause: "In the least time it takes",
    built: "Twenty minutes, five to eight machines, and nothing added during a set without taking something away",
    why: "Time is part of the definition itself, so the session has a hard shape and nothing creeps into it.",
  },
];

function pickThreeOthers(index: number): number[] {
  // The three clauses after this one, wrapping: every clause is a wrong
  // answer three times across the deck, and never twice in one question.
  return [1, 3, 5].map((step) => (index + step) % CLAUSES.length);
}

export const HUTCHINS_QUESTIONS: QuizItem[] = [
  ...CLAUSES.map((c, i) => ({
    id: `h-${c.id}`,
    deck: "hutchins" as const,
    kind: "choice" as const,
    prompt: `Journey built this: “${c.built}”. Which part of Ken Hutchins' definition of exercise does it come from?`,
    options: [c.clause, ...pickThreeOthers(i).map((j) => CLAUSES[j].clause)],
    answer: 0,
    explain: c.why,
    source: HUTCHINS_SOURCE,
    fact: `hutchins:${c.id}`,
  })),
  {
    id: "h-who",
    deck: "hutchins",
    kind: "choice",
    prompt: "Every rule on the floor traces back to one definition of exercise. Whose?",
    options: ["Ken Hutchins", "Arthur Jones", "Chris Beardsley", "Peter Attia"],
    answer: 0,
    explain: "AJ recorded it as the source: if something is not within this definition, it is not true exercise.",
    source: HUTCHINS_SOURCE,
    fact: "hutchins:who",
  },
  {
    id: "h-reject",
    deck: "hutchins",
    kind: "choice",
    prompt: "Someone wants to add something to the session. What is the fastest way to say why it doesn't belong?",
    options: [
      "Name the part of the definition it breaks",
      "Describe how it looks on the iPad",
      "Count how many trainers dislike it",
      "Say it takes too many taps",
    ],
    answer: 0,
    explain: "Almost every rule is one clause made concrete, so naming the clause a change breaks says why in a sentence.",
    source: HUTCHINS_SOURCE,
    fact: "hutchins:reject",
  },
  {
    id: "h-minimum-time",
    deck: "hutchins",
    kind: "truefalse",
    prompt: "True or false: in Hutchins' definition, the time a session takes is part of what makes it exercise.",
    options: ["True", "False"],
    answer: 0,
    explain: "The definition ends on the least time it takes, which is why twenty minutes is a constraint, not a target to beat.",
    source: HUTCHINS_SOURCE,
    fact: "hutchins:time",
  },
];
