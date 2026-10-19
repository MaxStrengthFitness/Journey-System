/**
 * PLAYBOOK — A new client's first sessions (pillar: programming and adapting).
 *
 * From the two first-session rounds (docs/rounds/2026-10-07-first-session-
 * and-routines.md, AJ's interview answers in his own words; docs/rounds/
 * 2026-10-08-first-session-screens.md, his picks) and the rules the routine
 * plan holds (src/features/routine-plan/README.md, "Rules that hold here").
 * Only what a trainer does with a new client; nothing about how the plan is
 * stored.
 *
 * Kept out on purpose: any starting weight (AJ, Sep 28 2026: no house
 * starting weight; the Academy's range is "a crutch until we have reliable
 * data", a reference only), and the Academy consultation script's package
 * lines (stale; the packages playbook carries the current rules).
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, FIRST_SESSION_ROUND, FIRST_SESSION_SCREENS, HISTORY, para, PLAN_README } from "../write";

export const FIRST_SESSIONS: PlaybookPage = {
  id: "first-sessions",
  title: "A new client's first sessions",
  lede:
    "A client new to the studio starts from a first draft, never a script. Routine A gets built over the first few visits, and any trainer who trains them can change the plan.",
  pillar: "programming",
  status: "draft",
  sections: [
    {
      id: "which",
      title: "New to the studio, or new to Journey",
      blocks: [
        para(
          "There are two kinds of client with no routine yet: people new to the studio, and people new to Journey.",
          at(FIRST_SESSION_ROUND, 58, 59),
        ),
        bullet(
          "New to Journey means a long-standing client. There's no suggestion: build their routine on their profile, as you know how.",
          at(FIRST_SESSION_ROUND, 75),
        ),
        bullet(
          "New to the studio is a real start. Journey suggests a starting routine that fits the intake, or a default your studio or head office set; with none, you pick one. Either way, you can change anything.",
          at(PLAN_README, 18),
        ),
        para(
          "Never call someone new because Journey shows few sessions for them. Their history may be older than Journey.",
          at(HISTORY, 73, 75),
        ),
      ],
    },
    {
      id: "first-visits",
      title: "The first visits",
      blocks: [
        para(
          "The consult is usually two or three machines: Leg Press plus one more, preferably Compound Row, or Lumbar for a low back.",
          at(FIRST_SESSION_ROUND, 346, 348),
        ),
        para("A first session might be two machines or six. Routines are built to change.", at(FIRST_SESSION_ROUND, 78)),
        para(
          "The first couple of sessions repeat and build on the last one. That's when Routine A is being built.",
          at(FIRST_SESSION_ROUND, 97, 99),
        ),
        para(
          "The consult's machines aren't always Routine A. At the Wrap-up you tick which of today's machines start it.",
          at(FIRST_SESSION_SCREENS, 119, 124),
        ),
        para("The Academy puts the learning curve at about five to seven sessions.", at(FIRST_SESSION_ROUND, 351, 352)),
      ],
    },
    {
      id: "different",
      title: "Everyone starts differently",
      blocks: [
        para(
          "Clients start at different strengths, with different bodies and different contraindications, so the first machines can differ too.",
          at(FIRST_SESSION_SCREENS, 36, 38),
        ),
        para("A starting routine is a first draft, never a script.", at(FIRST_SESSION_SCREENS, 48)),
        bullet(
          "Some clients can't do certain machines. Mark it, with a reason and, if there is one, the day it ends.",
          at(FIRST_SESSION_SCREENS, 50),
        ),
        bullet(
          "The routine reshapes around it rather than hiding it, and whatever stands in says why.",
          at(PLAN_README, 174, 175),
        ),
        bullet("Gender plays no part in choosing a start.", at(FIRST_SESSION_SCREENS, 102, 103)),
      ],
    },
    {
      id: "plan",
      title: "A routine has a plan",
      blocks: [
        para(
          "A plan is the machines you intend, the order they come in, and a purpose in words. \"More variety because the client wants it\" is a real purpose.",
          at(FIRST_SESSION_ROUND, 152, 154),
        ),
        para(
          "It lets three different trainers train a new client and still follow one plan.",
          at(FIRST_SESSION_ROUND, 144, 146),
        ),
        para(
          "Any trainer who trains the client can change the plan, mid-session included. You're asked why, and never made to answer.",
          at(FIRST_SESSION_ROUND, 166, 168),
        ),
      ],
    },
    {
      id: "limits",
      title: "Weights, injuries and Routine B",
      blocks: [
        para(
          "Journey suggests machines, never a weight. The Academy's starting range is only a reference, shown with its source.",
          at(PLAN_README, 143, 145),
        ),
        para(
          "An injury never changes the routine by itself. You decide: still do the machine, regress it, or swap it.",
          at(FIRST_SESSION_ROUND, 129, 131),
        ),
        para(
          "Routine B is for variety and for recovery: an area is still worked twice a week while its heaviest work is split across the two days.",
          at(FIRST_SESSION_ROUND, 179, 180),
        ),
        para(
          "B usually starts as A with one machine different, and more of B is swapped in over the sessions that follow. You can also start B whole, with every swap made at once.",
          at(PLAN_README, 68, 78),
        ),
        para(
          "The Academy has A run five to seven times before B begins. That's guidance with its source, never enforced.",
          at(PLAN_README, 92, 93),
        ),
      ],
    },
  ],
  related: [
    {
      route: { kind: "machine", id: "m-leg-press" },
      title: "Leg Press",
      why: "The first machine nearly every consult uses.",
    },
    {
      route: { kind: "topic", moduleId: "programming", topicId: "programming-ab-routines-how-to-optimize-programming" },
      title: "AB Routines - How to Optimize Programming",
      why: "The Academy on why there's a B, and how it's built in.",
    },
    {
      route: { kind: "topic", moduleId: "programming", topicId: "programming-considerations-for-training-with-pain" },
      title: "Considerations for Training with Pain",
      why: "What the Academy does before it swaps a machine out.",
    },
    {
      route: { kind: "playbook", id: "packages" },
      title: "Talking about packages",
      why: "The conversation that often follows the free workouts.",
    },
  ],
};
