/**
 * PLAYBOOK — The twenty minutes (pillar: the floor and the protocol).
 *
 * Written from docs/business/the-floor.md, AJ's own account of a session
 * (Sep 18 2026, "For Clarity 2"), which CLAUDE.md asks every session to read
 * before touching the floor. The page keeps to what a Life Transformer does,
 * never how the app is built. Two things are deliberately said with care:
 *   - the rep range. "Failure inside 6–10 reps" is advice, and "a client who
 *     fails at 3 and a client who fails at 15 are both training correctly"
 *     (the-floor.md:110-113), so it is never written as a rule;
 *   - the client. The floor notes say "she" in their examples; a playbook
 *     says "the client" or "they" (CLAUDE.md, "A client's pronoun").
 * A draft until head office reads it (Corporate owns the method).
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, FLOOR, FOUR_PS_TITLE, HISTORY, para } from "../write";

export const THE_TWENTY_MINUTES: PlaybookPage = {
  id: "the-twenty-minutes",
  title: "The twenty minutes",
  lede:
    "About twenty minutes, twice a week, one-on-one: one set to failure on five to eight machines. You run the iPad so the client can give the work all their attention.",
  pillar: "floor",
  status: "draft",
  sections: [
    {
      id: "shape",
      title: "The shape of a session",
      blocks: [
        para(
          "A client comes twice a week for about twenty minutes, fifteen to thirty in practice, and does one set to failure on five to eight machines.",
          at(FLOOR, 52, 53),
        ),
        bullet("Slow, controlled, continuous tension.", at(FLOOR, 53, 54)),
        bullet("Breathing stays open, and there's no resting inside the set.", at(FLOOR, 54)),
        bullet("The weight builds gradually. It's never jumped into.", at(FLOOR, 54, 55)),
        para(
          "You run everything on the iPad, so the client keeps their whole focus on the work.",
          at(FLOOR, 55, 56),
        ),
      ],
    },
    {
      id: "between",
      title: "Between machines",
      blocks: [
        para(
          "You have one to two minutes: get the client out, walk, pull the selector pin, set the seat, gap, back pad and handle, belt them in, brief them, start.",
          at(FLOOR, 66, 68),
        ),
        bullet(
          "Look at the iPad walking up: which machine, which settings, what weight, how it went last time.",
          at(FLOOR, 68, 69),
        ),
        bullet("Look again walking away: the reps, the quality, anything worth a note.", at(FLOOR, 70)),
        para("Twelve touches in a six-machine session is the target. Everything else is the client.", at(FLOOR, 70, 71)),
        para("Your eye goes in this order: which machine, its settings, the weight, then last time.", at(FLOOR, 263, 265)),
      ],
    },
    {
      id: "ipad",
      title: "What the iPad is for",
      blocks: [
        para("A guide for set-up and a log for outcomes. Not a script, and not a coach.", at(FLOOR, 78)),
        para(
          "It tells you which machine is next, the settings, the weight, what the client did last time and anything a previous trainer flagged on that machine. Then it takes down what happened.",
          at(FLOOR, 78, 81),
        ),
        bullet(
          "The weight starts at last time's, unless a trainer decided otherwise. That's what they lift unless you change it.",
          at(FLOOR, 270, 271),
        ),
        bullet(
          "A weight a trainer set at the last Wrap-up loads instead, and the Now Bar says who set it.",
          at(FLOOR, 199, 201),
        ),
        bullet(
          "Reps are never filled in for you. Last time's show faintly, and moving on without typing logs nothing.",
          at(FLOOR, 271, 274),
        ),
        bullet("The catalog and the numbers are for off hours, not the floor.", at(FLOOR, 81, 82)),
      ],
    },
    {
      id: "record",
      title: "What you record",
      blocks: [
        para("Weight matters most, because it's what progresses.", at(FLOOR, 109)),
        para(
          "Reps change day to day with sleep, stress, meals and the time of day. The protocol advises reaching failure inside six to ten reps, but a client who fails at three and one who fails at fifteen are both training correctly. The rep count is never the target.",
          at(FLOOR, 110, 113),
        ),
        para("Quality is whether every rep kept the 4 P's: Posture, Pace, Path and Purpose.", at(FLOOR, 114)),
        para(
          "For a timed static contraction or a static hold, the reps are seconds. Stop the stopwatch and it fills them in.",
          at(FLOOR, 115, 116),
        ),
        para(
          "The app never decides a progression and never suggests a weight. That judgement is yours, and it's the point.",
          at(FLOOR, 94, 101),
        ),
      ],
    },
    {
      id: "kaizen",
      title: "The red kaizen ring",
      blocks: [
        para("It's a judgement about that set, not about the client that day.", at(FLOOR, 131)),
        para(
          "Tap it when one of the 4 P's broke, or something happened outside the definition of exercise: shoulders shrugging, breath held, momentum, a set cut short, not full range, not full effort, tension off the target muscle.",
          at(FLOOR, 131, 135),
        ),
        bullet("One tap. There's no picker for which P: watch all four, and put the detail in a note.", at(FLOOR, 138, 140)),
        bullet("It's a warning to the next trainer: be on high alert here.", at(FLOOR, 141)),
        bullet("It never moves the weight. Three reds in a row is for you to notice and act on.", at(FLOOR, 142, 143)),
        bullet("Not tapping is fine. A set that didn't reach failure still counts as completed.", at(FLOOR, 135, 136)),
      ],
    },
    {
      id: "new-to-you",
      title: "A client new to you",
      blocks: [
        para("You'll often be on your second session with a client who has fifty behind them.", at(FLOOR, 251)),
        para(
          "Before you start, look for the answers: will they keep the 4 P's, do they hold their breath, use momentum, let the weight crash, carry anything medical?",
          at(FLOOR, 252, 255),
        ),
        para(
          "Red flags sit as a small marker at the top, a tap away, never in your way. Nothing is allowed to slow starting the session.",
          at(FLOOR, 258, 259),
        ),
        para(
          "Their history didn't begin when Journey first saw them. An empty history in Journey means no detail here, never that it didn't happen.",
          at(HISTORY, 65, 68),
        ),
      ],
    },
  ],
  related: [
    {
      route: { kind: "playbook", id: "why-every-rule" },
      title: "Why every rule exists",
      why: "The one definition each of these rules comes from.",
    },
    {
      route: { kind: "topic", moduleId: "intro", topicId: "intro-posture-path-pace-purpose" },
      title: FOUR_PS_TITLE,
      why: "The 4 P's in the Academy's own words.",
    },
    {
      route: { kind: "topic", moduleId: "performance", topicId: "performance-set-duration" },
      title: "Set Duration",
      why: "The Academy on how long a set runs.",
    },
    {
      route: { kind: "playbook", id: "the-kit" },
      title: "Your kit: clicker, stopwatch, iPad",
      why: "The three things you carry round the floor.",
    },
  ],
};
