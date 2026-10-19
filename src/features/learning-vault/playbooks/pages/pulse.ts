/**
 * PLAYBOOK — Pulse, the living assessment (pillar: programming and adapting).
 *
 * From src/features/subjective-report/README.md: the reference document's
 * purpose and protein rule (§1, verbatim there), the three pillars (§5.1),
 * the living rule (§5.3), and the Pulse round's Dial, client mode and floor
 * entry (§6). It sits under programming because Pulse is the baseline the
 * floor's drift is read against (§6.1's one sentence), and it feeds the
 * renewal conversation, which leads with health.
 *
 * Said in the trainer's words, never the code's: "Pulse" everywhere
 * (the code still says check-in / subjective), the five Dial words, no 0–10
 * number for a statement (the README's own rule, §6.2).
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, para, PULSE_README } from "../write";

export const PULSE: PlaybookPage = {
  id: "pulse",
  title: "Pulse: the living assessment",
  lede:
    "Pulse is how life is going outside the studio. You fill it in with the client a little at a time, and it's never finished.",
  pillar: "programming",
  status: "draft",
  sections: [
    {
      id: "for",
      title: "What it's for",
      blocks: [
        para(
          "It tracks the changes in daily life behind strength, health, independence and longevity, as a coaching conversation every 90 days.",
          at(PULSE_README, 19, 21),
        ),
        para(
          "You learn it slowly. Kept up, it shows how the client has changed in ways the studio can't see.",
          at(PULSE_README, 325, 328),
        ),
        para(
          "Pulse sets the baseline, the floor records drift from it, and the Kaizen Deep Dive reads that drift against the sets.",
          at(PULSE_README, 342, 344),
        ),
      ],
    },
    {
      id: "areas",
      title: "The areas, in three groups",
      blocks: [
        bullet(
          "Recovery & Fuel: sleep and recovery, nutrition and protein, the days they hit their protein goal, and water.",
          at(PULSE_README, 244),
        ),
        bullet(
          "Physical & Functional: energy and daily function, strength and physical confidence, pain and mobility, and the pain map.",
          at(PULSE_README, 245),
        ),
        bullet(
          "Psychological & Behavioral: mental and emotional impact, consistency and habits, lifestyle, and what's weighing on them.",
          at(PULSE_README, 246),
        ),
        para(
          "Each of the eight scored areas has three short statements, like \"I wake up feeling rested\" or \"I am consistent with my workouts.\" Protein, water, the pain map and stress are asked their own way.",
          at(PULSE_README, 28, 57),
        ),
      ],
    },
    {
      id: "asking",
      title: "Asking it",
      blocks: [
        para(
          "The client answers each statement with one of five words: Not at all, Rarely, Sometimes, Often or Nearly always.",
          at(PULSE_README, 348, 350),
        ),
        para("A statement nobody answered is \"not asked\", never zero.", at(PULSE_README, 366, 367)),
        para("An area you didn't ask this time isn't cleared. Its last answer carries forward.", at(PULSE_README, 288, 290)),
        para(
          "Hand to client gives them the iPad: one area at a time, big words, and nothing of yours on it. They hand it back when they're done.",
          at(PULSE_README, 389, 395),
        ),
        para(
          "On the floor, update one area and get back to the session. Open the full Pulse for the rest.",
          at(PULSE_README, 415, 417),
        ),
      ],
    },
    {
      id: "details",
      title: "Protein, water, pain and stress",
      blocks: [
        para(
          "Protein: the target is 0.75 to 1.0 g per pound of ideal body weight a day. Ask, \"On average, how many days per week do you hit your protein goal?\"",
          at(PULSE_README, 60, 62),
        ),
        bullet("Five to seven days is green, two to four yellow, none or one red.", at(PULSE_README, 62)),
        bullet(
          "Water: the studio default is half an ounce per pound of body weight. If a clinician set a limit, mark it medical; the reason isn't stored.",
          at(PULSE_README, 129, 132),
        ),
        bullet("A spot on the pain map starts Not rated until you rate it.", at(PULSE_README, 147, 151)),
        bullet(
          "Stress: what's weighing on them, like caring for someone, a family member's health or a retirement, and what you agreed to do about it. It stays off their printed copy unless you add it.",
          at(PULSE_README, 160, 166),
        ),
      ],
    },
    {
      id: "flags",
      title: "Flags, and what the client sees",
      blocks: [
        para(
          "Red in protein compliance (the days they hit their protein goal), Sleep & Recovery or Consistency & Habits flags the client for the team.",
          at(PULSE_README, 73, 74),
        ),
        para("The client's copy is sentences only: no overall score and no coloured scores.", at(PULSE_README, 220)),
        para("Keep notes to coaching context. InBody numbers never go in Pulse.", at(PULSE_README, 308, 310)),
      ],
    },
  ],
  related: [
    {
      route: { kind: "playbook", id: "progress-report" },
      title: "The progress report conversation",
      why: "Where Pulse shows as a snapshot.",
    },
    {
      route: { kind: "playbook", id: "renewals" },
      title: "Renewals: the conversation before the last session",
      why: "The renewal talk leads with health, and Pulse is where that lives.",
    },
    {
      route: { kind: "playbook", id: "ford" },
      title: "FORD: knowing the person",
      why: "The other half of knowing how life is going.",
    },
  ],
};
