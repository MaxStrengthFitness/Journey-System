/**
 * PLAYBOOK — Renewals: the conversation before the last session
 * (pillar: relationships and renewals).
 *
 * From docs/business/renewals.md (AJ, Sep 10 2026: how renewals happen,
 * what goes wrong, why clients hesitate, who does what) and the renewal
 * conversation's own words (src/features/renewals/conversation.ts: the
 * leanings and concerns a trainer picks; only the leaning is asked for).
 *
 * Left out on purpose (business digest §5, "never show trainers"): the
 * studio's pipeline, per-trainer renewal rates and the Renewal Brief, which
 * are leaders' screens. The page says a leader steps in, never what the
 * leader sees. "About 10 sessions" is the studio default, and each studio
 * sets its own, so the page says both.
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, CONVERSATION, para, RENEWALS, RENEWALS_README } from "../write";

export const RENEWALS_PAGE: PlaybookPage = {
  id: "renewals",
  title: "Renewals: the conversation before the last session",
  lede:
    "Start well before the sessions run out, lead with health, and write down what the client said so the next person knows where things stand.",
  pillar: "retention",
  status: "draft",
  sections: [
    {
      id: "why",
      title: "Why it matters",
      blocks: [
        para("The studio wants every client to see that each session is worth what they pay.", at(RENEWALS, 7)),
        para("The aim is to get ahead of renewals instead of reacting to cancellations.", at(RENEWALS, 7)),
      ],
    },
    {
      id: "when",
      title: "When to start",
      blocks: [
        para("Start the conversation about 10 sessions before the end.", at(RENEWALS, 11)),
        para("Each studio can set its own timing.", at(RENEWALS, 32)),
        para(
          "When it's time, the Wrap-up asks something like \"Renewal: 9 left. Talk about it today?\"",
          at(RENEWALS, 40),
        ),
        para(
          "Sessions never expire, so where packages renew by themselves, the next one can be charged while the client still has sessions banked. Starting early is how you get ahead of that.",
          at(RENEWALS, 17),
        ),
      ],
    },
    {
      id: "worries",
      title: "What clients worry about",
      blocks: [
        bullet("Price, most of all.", at(RENEWALS, 22)),
        bullet(
          "Most are on 12 months. Eighteen can feel like a lot: they worry they won't keep going, or won't see the progress they want.",
          at(RENEWALS, 23),
        ),
        bullet(
          "Many \"just want to be healthy, not a body builder\", so a big commitment feels intimidating.",
          at(RENEWALS, 24),
        ),
      ],
    },
    {
      id: "lead",
      title: "How to lead it",
      blocks: [
        para("Lead with health: InBody, sleep, energy, pain, consistency.", at(RENEWALS, 26)),
        para("Then the math: a longer package lowers every payment.", at(RENEWALS, 26)),
        para(
          "You ask. When the worry is price or progress, a head trainer or studio leader steps in.",
          at(RENEWALS, 12),
        ),
      ],
    },
    {
      id: "log",
      title: "Write down what they said",
      blocks: [
        para(
          "A short form logs how they're leaning: Renewing, Leaning yes, Unsure, Leaning no or Not renewing.",
          at(CONVERSATION, 28, 34),
        ),
        para(
          "Add what they're on the fence about: price, commitment length, results, schedule, health, travel or trainer fit.",
          at(CONVERSATION, 36, 45),
        ),
        para("Only the leaning is required. Everything else is there when it helps.", at(CONVERSATION, 96, 97)),
        para("Ask for a leader when you need one. The ask stays until a leader marks it handled.", at(RENEWALS_README, 88)),
        para(
          "Then a head trainer or leader can open the client and know who talked to them, how they feel, and how to react.",
          at(RENEWALS, 31),
        ),
      ],
    },
    {
      id: "who",
      title: "Who does what",
      blocks: [
        bullet("You notice how the client is doing, ask about renewal, and log what they said.", at(RENEWALS, 59)),
        bullet(
          "A head trainer or studio leader watches what's coming up, steps in over price or progress, and handles the contract in Mindbody.",
          at(RENEWALS, 60),
        ),
        para("The app never contacts a client. It prepares the people who do.", at(RENEWALS, 34)),
      ],
    },
  ],
  related: [
    {
      route: { kind: "playbook", id: "packages" },
      title: "Talking about packages",
      why: "The packages, the guarantee and the math in one place.",
    },
    {
      route: { kind: "playbook", id: "pulse" },
      title: "Pulse: the living assessment",
      why: "Sleep, energy and pain, in the client's own answers.",
    },
    {
      route: { kind: "playbook", id: "progress-report" },
      title: "The progress report conversation",
      why: "The proof that every session was worth it.",
    },
    {
      route: { kind: "playbook", id: "ford" },
      title: "FORD: knowing the person",
      why: "The relationship that makes the conversation easy.",
    },
  ],
};
