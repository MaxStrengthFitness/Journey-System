/**
 * PLAYBOOK — The progress report conversation (pillar: relationships and renewals).
 *
 * From src/features/progress-report/README.md ("Why a stepper": the report
 * is a conversation with a fixed shape, and the order is the pitch) and the
 * guide text each step already shows the trainer (src/features/progress-
 * report/steps.ts, purpose and howTo). The README's title says five steps;
 * steps.ts has a sixth, "The printed page", since Oct 13 2026 (business
 * digest, register #5). This page teaches the five steps of the
 * conversation and the page as what the client takes home, which is how
 * steps.ts itself describes it.
 *
 * Nothing about how the report is stored. Accolade minimums are said as the
 * rule a trainer sees ("not enough data yet"), never as their constants.
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, FOUR_PS_TITLE, para, REPORT_README, REPORT_STEPS } from "../write";

export const PROGRESS_REPORT: PlaybookPage = {
  id: "progress-report",
  title: "The progress report conversation",
  lede:
    "A progress report is a conversation with a fixed shape: celebrate, show the wins, show the numbers, say the hard thing, then leave them with a goal and a date.",
  pillar: "retention",
  status: "draft",
  sections: [
    {
      id: "order",
      title: "The order is the pitch",
      blocks: [
        para("Walk it one step at a time, in order.", at(REPORT_README, 14, 17)),
        para(
          "A client who has just been congratulated and shown their gains hears \"your Path breaks down under load\" very differently from one who got the criticism first.",
          at(REPORT_README, 17, 19),
        ),
      ],
    },
    {
      id: "steps",
      title: "The five steps",
      blocks: [
        bullet(
          "Volume & gratitude: open by congratulating them. It's all about showing up, so they feel the size of what they've done before anything else is said.",
          at(REPORT_STEPS, 67, 68),
        ),
        bullet(
          "Accolades: exactly three specific wins the data can prove. A slot the data can't back says \"not enough data yet\" and is never printed.",
          at(REPORT_STEPS, 80, 83),
        ),
        bullet(
          "Machine progression: start weight to current weight, machine by machine. This is where \"I feel stronger\" becomes a number.",
          at(REPORT_STEPS, 92, 93),
        ),
        bullet(
          "The 4 P's: the honest part. Rate each one Needs work, Developing, Solid, Strong or Mastered, and aim for one clear thing to improve, not four.",
          at(REPORT_STEPS, 104, 107),
        ),
        bullet(
          "Kaizen blueprint: how the last goal went, the goal now, and when you'll check it. A client with a dated goal has a reason to be here in 90 days.",
          at(REPORT_STEPS, 117, 118),
        ),
      ],
    },
    {
      id: "words",
      title: "Saying it well",
      blocks: [
        para("Write the thank-you in the second person, as you'd say it out loud. It prints as a quote.", at(REPORT_STEPS, 70)),
        para("Add a line where there's a story: a plateau you broke, a machine you rested.", at(REPORT_STEPS, 95)),
        para("Nothing goes on the page that you didn't write.", at(REPORT_README, 287)),
      ],
    },
    {
      id: "goals",
      title: "A goal with a date",
      blocks: [
        para("Make the next goal measurable, give it a date, and add two or three checkpoints.", at(REPORT_STEPS, 120)),
        para("Mark how the last one went: Achieved, On track, Stalled or Changed course.", at(REPORT_STEPS, 143, 148)),
        para("The next report opens on this goal, so the loop closes itself.", at(REPORT_README, 45, 47)),
        para("Why they started is carried forward on every report.", at(REPORT_README, 42)),
      ],
    },
    {
      id: "page",
      title: "The page they take home",
      blocks: [
        para(
          "One page, led by why the client trains: everyday strength and independence, pain-free movement, body composition, a goal to hit, or their own goal in their words.",
          at(REPORT_README, 250, 253),
        ),
        para("They see each P as a word, never a number.", at(REPORT_README, 190, 192)),
        para("Pulse shows as a snapshot. Update it on the client's record, not in the report.", at(REPORT_STEPS, 120)),
        para(
          "Email opens your own mail app: print to PDF and attach it. The app never contacts the client.",
          at(REPORT_README, 143, 146),
        ),
      ],
    },
  ],
  related: [
    {
      route: { kind: "topic", moduleId: "intro", topicId: "intro-posture-path-pace-purpose" },
      title: FOUR_PS_TITLE,
      why: "The Academy on the four things you rate.",
    },
    {
      route: { kind: "playbook", id: "pulse" },
      title: "Pulse: the living assessment",
      why: "The snapshot the blueprint opens on.",
    },
    {
      route: { kind: "playbook", id: "renewals" },
      title: "Renewals: the conversation before the last session",
      why: "Another conversation that leads with how they're doing.",
    },
  ],
};
