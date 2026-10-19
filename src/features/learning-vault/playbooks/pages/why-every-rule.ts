/**
 * PLAYBOOK — Why every rule exists (pillar: the floor and the protocol).
 *
 * Ken Hutchins' definition of exercise, clause by clause, and what Journey
 * built from each (docs/business/the-floor.md:7-31; AJ, Sep 21 2026: "This is
 * the source. If it is not within this definition, it is not true exercise").
 *
 * THE BOOK IS NEVER QUOTED. AJ's rule (Sep 27 2026; docs/rounds/
 * 2026-09-28-codex-source-check.md:15): paraphrase The Renaissance of
 * Exercise with a book reference, never quote it. The book is not in the
 * repository; the only words of Hutchins' the repo holds are the definition
 * at the-floor.md:14-18. So every clause here is restated in plain words,
 * the page labels itself with HUTCHINS_LABEL, and `playbooks.test.ts` reads
 * the-floor.md and fails if any string on this page shares a run of four
 * words with the quoted definition (stricter than the quiz's six). Clause
 * names are paraphrased too: "Kept safe", not the clause's own wording.
 *
 * The second half of each bullet is AJ's mapping of the floor's rules onto
 * the clauses (the-floor.md's table), not the book's text.
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, FLOOR, para, SOURCE_CHECK } from "../write";

/** How the page names its source. Never a quotation of the book. */
export const HUTCHINS_LABEL =
  "Paraphrased from Ken Hutchins' definition of exercise (The Renaissance of Exercise)";

export const WHY_EVERY_RULE: PlaybookPage = {
  id: "why-every-rule",
  title: "Why every rule exists",
  lede:
    "Every rule on the floor is one part of a single definition of exercise, made concrete.",
  pillar: "floor",
  status: "draft",
  sections: [
    {
      id: "definition",
      title: "The definition, in our words",
      blocks: [
        para(HUTCHINS_LABEL, at(FLOOR, 14, 20)),
        para(
          "Exercise is hard, demanding effort done the way muscles and joints are built to move, in a controlled, clinical setting, kept safe, with a load heavy enough to tire the muscles deeply so they are prompted to grow, in as little time as that takes.",
          at(FLOOR, 14, 18),
        ),
        para("If something isn't inside that definition, it isn't exercise as we mean it.", at(FLOOR, 9, 10)),
      ],
    },
    {
      id: "parts",
      title: "The eight parts, and what each one built",
      blocks: [
        bullet(
          "Hard, demanding effort: one set, taken to failure. Only a set the client truly performed counts toward any average.",
          at(FLOOR, 24),
        ),
        bullet(
          "Moving the way muscles and joints are made to move: every machine carries its muscles, its movement and how it travels, and head office owns those words.",
          at(FLOOR, 25),
        ),
        bullet(
          "A controlled, clinical setting: sentences, not scores. No hype, no celebration, and never a confident wrong number.",
          at(FLOOR, 26),
        ),
        bullet(
          "Kept safe: a studio can add a warning any time. A standard safety line comes off a studio's own machine only with a reason, recorded with who and when, and head office sees it.",
          at(FLOOR, 27),
        ),
        bullet(
          "A real load: the weight and the settings are always stated, never assumed. A machine is almost never already right when you walk up.",
          at(FLOOR, 28),
        ),
        bullet(
          "Tiring the muscle deeply: quality is the measure, not the count. What matters is how many good reps it took, and the red kaizen ring is kept for exactly that.",
          at(FLOOR, 29),
        ),
        bullet(
          "Prompting growth: a practice set is recorded in full but never averaged. It's movement, not exercise, so it mustn't move a number that measures exercise.",
          at(FLOOR, 30),
        ),
        bullet(
          "As little time as it takes: twenty minutes, five to eight machines. That limit is the rule itself.",
          at(FLOOR, 31),
        ),
      ],
    },
    {
      id: "using",
      title: "Using it on the floor",
      blocks: [
        para(
          "The red kaizen ring is for anything outside the definition: shrugging into it, a held breath, momentum, a set cut short.",
          at(FLOOR, 131, 135),
        ),
        para("A machine that's never taken to failure says why. A rule nobody explains gets ignored.", at(FLOOR, 27)),
        para(
          "The one exception to \"no celebration\" is the short burst of confetti as the Wrap-up opens. It never repeats and never blocks a tap.",
          at(FLOOR, 236, 240),
        ),
      ],
    },
    {
      id: "source",
      title: "Where this comes from",
      blocks: [
        para(
          "On Sep 21 2026 AJ named this definition as the source: almost every rule in the app is one part of it made concrete.",
          at(FLOOR, 9, 12),
        ),
        para(
          "Journey holds its own changes to this definition: a change is often best turned down by naming the part it breaks, rather than describing the symptom.",
          at(FLOOR, 10, 12),
        ),
        para("The rule is to paraphrase the book with a reference and never quote it.", at(SOURCE_CHECK, 15)),
      ],
    },
  ],
  related: [
    {
      route: { kind: "playbook", id: "the-twenty-minutes" },
      title: "The twenty minutes",
      why: "The session these rules shape.",
    },
    {
      route: { kind: "glossary", term: "Inroad" },
      title: "Inroad",
      why: "The Academy's word for tiring the muscle deeply.",
    },
    {
      route: { kind: "topic", moduleId: "intro", topicId: "intro-philosophy" },
      title: "Philosophy",
      why: "Where the Academy says the method comes from.",
    },
    {
      route: { kind: "quiz", deck: "hutchins" },
      title: "Why we train this way",
      why: "A short round on the eight parts.",
    },
  ],
};
