/**
 * PLAYBOOK — FORD: knowing the person (pillar: relationships and renewals).
 *
 * From src/features/ford/README.md (why FORD exists, the loop, the gesture),
 * the four letters' own words and prompts in src/features/ford/types.ts
 * (FORD_META and FORD_PROMPT_WHEN: the retired / still-working rule), and
 * docs/business/the-floor.md:33-48 (the format's one disadvantage, and why
 * the app never contacts anyone).
 *
 * Quoted prompts are FORD_META's verbatim, so a trainer reading this page
 * hears the same question the briefing rotates. The README's own example
 * gesture ends "she cried"; this page keeps the part a trainer can copy and
 * drops the pronoun (CLAUDE.md, "A client's pronoun").
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, FLOOR, FORD_README, FORD_TYPES, para, ROLES } from "../write";

export const FORD: PlaybookPage = {
  id: "ford",
  title: "FORD: knowing the person",
  lede:
    "Twenty minutes one-on-one leaves almost no natural chance to build community, so you build it on purpose, in the minutes either side of the set. FORD is what to listen for.",
  pillar: "retention",
  status: "draft",
  sections: [
    {
      id: "why",
      title: "Why it matters",
      blocks: [
        para(
          "No class, no lounge, nobody hanging around afterwards. The relationship gets built deliberately, in the few minutes on either side of the set.",
          at(FORD_README, 13, 17),
        ),
        para(
          "The point isn't the filing cabinet. It's the anniversary dinner somebody actually paid for.",
          at(FORD_README, 9, 10),
        ),
        para(
          "FORD isn't small talk filed away. Everything you catch should end in someone doing something human.",
          at(FORD_README, 23, 26),
        ),
      ],
    },
    {
      id: "letters",
      title: "The four letters",
      blocks: [
        bullet("F, Family: partners, kids, grandkids, pets, and the dates that matter to them.", at(FORD_TYPES, 79)),
        bullet(
          "O, Occupation: work, retirement, what fills their weekdays and what it does to their body.",
          at(FORD_TYPES, 93),
        ),
        bullet(
          "R, Recreation: what they do for joy, from hikes and golf to the garden and the grandkids' games.",
          at(FORD_TYPES, 107),
        ),
        bullet("D, Dreams: what they want from the next chapter. A life goal, not a training goal.", at(FORD_TYPES, 121)),
      ],
    },
    {
      id: "ask",
      title: "Things to ask",
      blocks: [
        bullet("\"How is the family?\" \"Anyone graduating, marrying or visiting soon?\"", at(FORD_TYPES, 81, 82)),
        bullet(
          "\"How is work treating you?\" for someone still working, and \"How is retirement going?\" for someone retired, never the other way round.",
          at(FORD_TYPES, 143, 147),
        ),
        bullet("\"Been out on the trail lately?\" \"How was the trip?\"", at(FORD_TYPES, 109, 110)),
        bullet("\"What would you love to be able to do again?\"", at(FORD_TYPES, 125)),
      ],
    },
    {
      id: "catch",
      title: "Catch it when they say it",
      blocks: [
        para(
          "They might mention something coming in, mid-workout, or just as they leave, so there's a place to catch it before, during and after the session.",
          at(FORD_README, 39, 43),
        ),
        para(
          "Mid-set, type the sentence and save. Choose the letter later: deciding first is how details get lost.",
          at(FORD_README, 72, 76),
        ),
        bullet(
          "A standing fact (\"Wife is Karen\") stays. A dated moment (\"Ethan graduates in May\") passes.",
          at(FORD_README, 85, 86),
        ),
        bullet(
          "In one line: the sentence a new trainer should read first, written by the team, up to 120 characters.",
          at(FORD_README, 110, 116),
        ),
        bullet(
          "Follow up next time: a question you leave for the next trainer, like \"How did the new boots do on the long walk?\"",
          at(FORD_README, 197, 200),
        ),
      ],
    },
    {
      id: "beyond",
      title: "Going above and beyond",
      blocks: [
        para(
          "A gesture moves from idea to planned to done, or declined, with an owner and what happened.",
          at(FORD_README, 93, 96),
        ),
        para(
          "Write the outcome. \"Took the dinner bill at Giovanni's\" is the memory a new trainer inherits a year later.",
          at(FORD_README, 94, 96),
        ),
        para("An owner is a name, not an assignment.", at(FORD_README, 99, 100)),
        para("Anniversaries roll forward: \"in 12 days\", never \"seven years ago\".", at(FORD_README, 358, 359)),
        para("Leaders see every gesture the studio owes, in date order, on the Delight queue.", at(FORD_README, 36)),
      ],
    },
    {
      id: "never",
      title: "What the app never does",
      blocks: [
        para(
          "The app never contacts anyone. An automated \"happy anniversary\" would only prove nobody remembered.",
          at(FLOOR, 45, 48),
        ),
        para(
          "A client's FORD stays with their home studio's team. A studio they cross-train at never sees it.",
          at(ROLES, 95),
        ),
      ],
    },
  ],
  related: [
    {
      route: { kind: "playbook", id: "pulse" },
      title: "Pulse: the living assessment",
      why: "How life is going, in the client's own answers.",
    },
    {
      route: { kind: "playbook", id: "renewals" },
      title: "Renewals: the conversation before the last session",
      why: "Knowing the person is what keeps them.",
    },
    {
      route: { kind: "playbook", id: "progress-report" },
      title: "The progress report conversation",
      why: "Their why, carried forward on every report.",
    },
  ],
};
