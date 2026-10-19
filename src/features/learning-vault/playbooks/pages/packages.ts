/**
 * PLAYBOOK — Talking about packages (pillar: consultations and packages).
 *
 * From docs/business/packages-and-pricing.md and the packages screen's own
 * sentences (src/features/packages/package-copy.ts, README). The rules this
 * page keeps, each recorded there:
 *   - NO PRICE. "Pricing can vary by location" (packages-and-pricing.md:3);
 *     each studio keeps its own table. `playbooks.test.ts` fails on a "$"
 *     anywhere in a playbook. The structure, the guarantee and the fallback
 *     ORDER are the same everywhere; the numbers are the studio's.
 *   - Never "most popular" (the website says it; the app never does, :15).
 *   - "Upgrade", never "move" (README: a downgrade is an unanswered refund
 *     question).
 *   - The Academy's consultation script still carries two out-of-date lines
 *     (30/60/90 days, "no longer bill you or auto renew you"; :39). AJ left
 *     the Academy as it is, so this page says they're out of date rather
 *     than repeating them as current.
 *   - The money fallbacks are trainer notes, never on the client's view.
 */

import type { PlaybookPage } from "../../types";
import { at, bullet, GLOSSARY, PACKAGE_COPY, PACKAGES, PACKAGES_README, para } from "../write";

export const PACKAGES_PAGE: PlaybookPage = {
  id: "packages",
  title: "Talking about packages",
  lede:
    "Every package is the same training; what changes is how long the client commits. Prices are each studio's own, so this page carries none.",
  pillar: "consult",
  status: "draft",
  sections: [
    {
      id: "three",
      title: "The three packages",
      blocks: [
        bullet("The Trial: 6 months, 48 sessions.", at(PACKAGES, 11)),
        bullet("Committed: 12 months, 96 sessions.", at(PACKAGES, 12)),
        bullet("Life Transformed: 18 months, 144 sessions.", at(PACKAGES, 13)),
        para("The session counts assume twice a week, which is what the studio recommends for results.", at(PACKAGES, 7)),
        para(
          "Payments come every 4 weeks. Clients pay that way, or pay the whole package up front at a lower rate.",
          at(PACKAGES, 17),
        ),
        para(
          "Each payment is 8 sessions. Worked out from the standard table and not yet confirmed in Mindbody: a 12-month package bills for 48 weeks, about 11 calendar months at twice a week.",
          at(PACKAGES, 27, 35),
        ),
        para("Life Transformed is the 18-month package. Life Transformer is you.", at(GLOSSARY, 9, 21)),
      ],
    },
    {
      id: "prices",
      title: "Prices are your studio's",
      blocks: [
        para(
          "Each studio keeps its own price table. A studio that hasn't saved one shows Max Strength's standard prices.",
          at(PACKAGES, 84),
        ),
        para("Your studio's prices are on My Studio → Studio → Renewals.", at(PACKAGE_COPY, 290, 291)),
        para(
          "The line that answers \"can I afford this\": a longer commitment lowers every payment.",
          at(PACKAGES, 59),
        ),
        para(
          "The website marks Committed as \"most popular\". Journey never does, because nothing it holds can back the claim; the packages screen shows your recommendation instead.",
          at(PACKAGES, 15),
        ),
      ],
    },
    {
      id: "recommend",
      title: "Your recommendation",
      blocks: [
        para(
          "The recommendation is yours. It starts on 12 months, the Academy's middle option; move it if their goals and history call for another length.",
          at(PACKAGES, 81),
        ),
        para(
          "The Academy's words: \"This is based on coming twice a week which is what I would prescribe.\" Then ask which they think is best, and let them speak first.",
          at(PACKAGE_COPY, 225, 231),
        ),
        para(
          "The Academy's lines and the money fallbacks are in your trainer notes, never on the screen you turn toward the client. Your recommendation does show there, under your name.",
          at(PACKAGES_README, 25, 32),
        ),
      ],
    },
    {
      id: "guarantee",
      title: "The Double Transformation Guarantee",
      blocks: [
        bullet(
          "30 days, 100% money back, no questions asked, whether they pay every 4 weeks or in full.",
          at(PACKAGES, 20),
        ),
        bullet(
          "Show up twice a week and give 100%: if they're not happy with their progress, the studio buys them 6 months at any other gym. This half is for clients who pay in full.",
          at(PACKAGES, 21),
        ),
        bullet(
          "Within the first 30 days, or at renewal, they can upgrade to any other package, however they pay.",
          at(PACKAGES, 22),
        ),
        para("Say \"upgrade\", never \"move\": a step down raises a refund question nobody has answered.", at(PACKAGES_README, 33)),
        para("Every package is advertised with two free workouts.", at(PACKAGES, 18)),
      ],
    },
    {
      id: "money",
      title: "When money is the problem",
      blocks: [
        para("Only when money is truly the problem, and in this order:", at(PACKAGE_COPY, 239, 242)),
        bullet("The guarantee. It's the big one.", at(PACKAGES, 82)),
        bullet("The lowest rate on the shortest commitment.", at(PACKAGES, 82)),
        bullet("Once a week, only if your studio has a once-a-week package.", at(PACKAGES, 82)),
        bullet(
          "A few more sessions: extra free workouts before they decide, or bonus sessions added to the package.",
          at(PACKAGES, 82),
        ),
      ],
    },
    {
      id: "sessions",
      title: "Sessions, renewing, and what's out of date",
      blocks: [
        para(
          "A session is used only by coming in, or by cancelling with less than 24 hours' notice. Time away doesn't use one.",
          at(PACKAGES, 23),
        ),
        para("Sessions never expire.", at(PACKAGES, 39)),
        para(
          "Whether a package renews by itself is the package's answer, else your studio's; the packages screen says which. Paid in full never renews by itself.",
          at(PACKAGES, 83),
        ),
        para(
          "The Academy's consultation script still mentions 30, 60 or 90 days for leftover sessions, and no longer billing or renewing. Both are out of date; don't use them.",
          at(PACKAGES, 39),
        ),
        para("The contract itself is done in Mindbody.", at(PACKAGE_COPY, 310)),
      ],
    },
  ],
  related: [
    {
      route: { kind: "playbook", id: "renewals" },
      title: "Renewals: the conversation before the last session",
      why: "The same math, at the other end of the package.",
    },
    {
      route: { kind: "topic", moduleId: "intro", topicId: "intro-mission" },
      title: "Mission",
      why: "Twenty minutes, twice a week: the promise behind every package.",
    },
    {
      route: { kind: "playbook", id: "first-sessions" },
      title: "A new client's first sessions",
      why: "What happens in the visits before they choose.",
    },
  ],
};
