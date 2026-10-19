/**
 * TRACKS — ordered reading lists, one per role or pillar.
 *
 * A track is a suggested order through Learning, nothing more: no progress is
 * stored, shown or compared (CLAUDE.md, "Recognition, never ranking": no
 * points, badges, streaks or leaderboards; decision 11 of the vault round).
 * It never says "3 of 9 done" because nothing remembers what was read.
 *
 * Every step is a real place: an Academy topic (its id checked against
 * index.json, inside the module named), one of the 20 MSF machines, a
 * playbook, the glossary, the phrasebook, a module, or a quiz deck. Each
 * step's title is the page's own title (a topic's as the Academy writes it),
 * so a step never promises a page that reads differently. `playbooks.test.ts`
 * holds both. Each step's "why" is one line in plain words, and says nothing
 * a source doesn't.
 */

import type { PlaybookPage, QuizDeckId, Track, VaultRoute } from "../types";
import { FIRST_SESSIONS } from "./pages/first-sessions";
import { FORD } from "./pages/ford";
import { PACKAGES_PAGE } from "./pages/packages";
import { PROGRESS_REPORT } from "./pages/progress-report";
import { PULSE } from "./pages/pulse";
import { RENEWALS_PAGE } from "./pages/renewals";
import { THE_KIT } from "./pages/the-kit";
import { THE_TWENTY_MINUTES } from "./pages/the-twenty-minutes";
import { WHY_EVERY_RULE } from "./pages/why-every-rule";

type Step = Track["steps"][number];

const step = (route: VaultRoute, title: string, why: string): Step => ({ route, title, why });

const play = (page: PlaybookPage, why: string): Step => step({ kind: "playbook", id: page.id }, page.title, why);

const topic = (moduleId: string, topicId: string, title: string, why: string): Step =>
  step({ kind: "topic", moduleId, topicId }, title, why);

const machine = (id: string, title: string, why: string): Step => step({ kind: "machine", id }, title, why);

/** The quiz decks a track points at, by the titles A5's DECKS gives them. */
const QUIZ_TITLE: Partial<Record<QuizDeckId, string>> = {
  mixed: "Quick ten",
  cues: "What would you say?",
  rep: "The repetition",
  method: "The method",
  hutchins: "Why we train this way",
  playbooks: "The floor and the conversation",
};

const quiz = (deck: QuizDeckId, why: string): Step =>
  step({ kind: "quiz", deck }, QUIZ_TITLE[deck] ?? "Quiz", why);

const NOTHING_KEPT = "Nothing is kept.";

export const TRACKS: Track[] = [
  {
    id: "life-transformer-101",
    title: "Life Transformer 101",
    who: "A new Life Transformer",
    steps: [
      play(THE_TWENTY_MINUTES, "What a session is, from the first machine to the last."),
      play(WHY_EVERY_RULE, "The one definition every rule on the floor comes from."),
      topic("intro", "intro-posture-path-pace-purpose", "Posture, Path, Pace, Purpose", "The 4 P's: what a good rep keeps."),
      topic(
        "performance",
        "performance-speed-of-movement",
        "Speed of Movement",
        "Six to ten seconds up, six to ten seconds down.",
      ),
      topic(
        "performance",
        "performance-turnaround-technique",
        "Turnaround Technique",
        "Why the turnarounds are the part to master.",
      ),
      play(THE_KIT, "The clicker, the stopwatch and the iPad, and how each is used."),
      machine("m-leg-press", "Leg Press", "The first machine nearly every new client meets."),
      step({ kind: "glossary" }, "Glossary", "The exact words the Academy asks you to use."),
      quiz("mixed", `Ten questions to see what stuck. ${NOTHING_KEPT}`),
    ],
  },
  {
    id: "equipment-and-cueing",
    title: "Equipment and cueing",
    who: "Anyone sharpening how they set up and cue",
    steps: [
      play(THE_KIT, "What you carry, and the click at the top."),
      topic(
        "equipment",
        "equipment-basic-equipment-and-exercise-information",
        "Basic Equipment and Exercise Information",
        "What to know about every machine before you train anyone on it.",
      ),
      step({ kind: "glossary", term: "Gap" }, "Gap", "The machine's own words: gap, end stop, selector pin."),
      topic("performance", "performance-gradual-load-up", "Gradual Load-up", "How a pushing movement begins."),
      machine(
        "m-compound-row",
        "Compound Row",
        "A pulling machine that begins with a handoff instead of a load-up.",
      ),
      topic("mastery", "mastery-lower-turnarounds", "Lower Turnarounds", "The bottom of every rep."),
      topic("mastery", "mastery-squeeze-technique", "Squeeze Technique", "The pause and the squeeze at the top."),
      step({ kind: "cueing" }, "Cueing phrasebook", "What to say at each moment of the set."),
      quiz("cues", `Match a cue to its moment. ${NOTHING_KEPT}`),
    ],
  },
  {
    id: "programming-and-adapting",
    title: "Programming and adapting",
    who: "Anyone building or changing a routine",
    steps: [
      play(FIRST_SESSIONS, "How a new client's routine gets built."),
      topic(
        "programming",
        "programming-ab-routines-how-to-optimize-programming",
        "AB Routines - How to Optimize Programming",
        "Why there's a B, and how it comes in.",
      ),
      topic(
        "programming",
        "programming-exercise-selection-template",
        "Exercise Selection Template",
        "The Academy's template for choosing machines. Journey's starting routines don't use its female and male rows.",
      ),
      machine("m-lumbar", "Lumbar", "One of the two machines never taken to failure."),
      topic(
        "programming",
        "programming-considerations-for-training-with-pain",
        "Considerations for Training with Pain",
        "What to try before a machine comes out.",
      ),
      topic(
        "variations",
        "variations-timed-static-contraction-tsc",
        "Timed Static Contraction (TSC)",
        "The most conservative way to train around pain or an injury.",
      ),
      play(PULSE, "The baseline the floor's drift is read against."),
      topic(
        "programming",
        "programming-workout-progressions",
        "Workout Progressions",
        "What to look at when a client stalls, before the weight.",
      ),
      quiz("method", `A round on the method. ${NOTHING_KEPT}`),
    ],
  },
  {
    id: "consultations-and-packages",
    title: "Consultations and packages",
    who: "Anyone running a consult or a packages talk",
    steps: [
      topic(
        "intro",
        "intro-mission",
        "Mission",
        "The promise: healthy, fit and strong in twenty minutes, twice a week.",
      ),
      topic(
        "benefits",
        "benefits-why-resistance-training",
        "Why Resistance Training",
        "Why strength training done properly covers fitness on its own.",
      ),
      topic(
        "consultation",
        "consultation-initial-consultation-script-tour-preliminary-co",
        "Initial Consultation Script - Tour, Preliminary Considerations, Demo Workout, Conclusion",
        "The Academy's consult script. Its prices may not be your studio's, and its leftover-session and billing lines are out of date: use Talking about packages for those.",
      ),
      play(FIRST_SESSIONS, "What the first visits look like."),
      play(PACKAGES_PAGE, "The packages, the guarantee, and what to do when money is the worry."),
      topic(
        "consultation",
        "consultation-initial-consultation-and-articles-internalizati",
        "Initial Consultation and Articles - Internalization Its All Inside",
        "An article written to be read to a client.",
      ),
      quiz("playbooks", `A round on the floor and the conversation. ${NOTHING_KEPT}`),
    ],
  },
  {
    id: "relationships-and-renewals",
    title: "Relationships and renewals",
    who: "Anyone who wants clients to stay",
    steps: [
      play(FORD, "Knowing the person, and going above and beyond."),
      play(PULSE, "How life is going, a little at a time."),
      play(PROGRESS_REPORT, "Showing them their progress, in the right order."),
      play(RENEWALS_PAGE, "The conversation before the last session."),
      play(PACKAGES_PAGE, "The math that answers \"can I afford this\"."),
      quiz("playbooks", `See what stuck. ${NOTHING_KEPT}`),
    ],
  },
  {
    id: "head-trainer",
    title: "For a head trainer",
    who: "A head trainer",
    steps: [
      play(WHY_EVERY_RULE, "The definition every floor rule comes from, part by part."),
      topic(
        "mastery",
        "mastery-how-intensely-to-push-a-client",
        "How Intensely to Push a Client",
        "How hard to push, and when not to.",
      ),
      topic(
        "principles",
        "principles-individual-variability",
        "Individual Variability",
        "Why clients respond differently to the same training.",
      ),
      topic(
        "programming",
        "programming-workout-progressions",
        "Workout Progressions",
        "What to look at when a client stalls, before the weight.",
      ),
      topic(
        "mastery",
        "mastery-putting-it-all-together-the-physiology-of-strength-p",
        "Putting it All Together (The Physiology of Strength) - part 1",
        "The physiology behind the method, in one place.",
      ),
      play(PROGRESS_REPORT, "Showing a client their progress, honestly."),
      play(RENEWALS_PAGE, "You step in when price or progress is the worry."),
      quiz("method", `A round on the method. ${NOTHING_KEPT}`),
    ],
  },
  {
    id: "studio-leader",
    title: "For a studio leader",
    who: "A studio leader",
    steps: [
      play(WHY_EVERY_RULE, "The definition to hold every floor decision to."),
      step(
        { kind: "module", moduleId: "summary" },
        "Executive Summary",
        "Modules 1 to 4, condensed: the fastest way in, or a refresher.",
      ),
      play(RENEWALS_PAGE, "Leaders get ahead of renewals. This is the trainer's half of it."),
      play(PACKAGES_PAGE, "What your trainers say about packages, and in what order."),
      play(FORD, "Every gesture the studio owes is on the Delight queue."),
      play(FIRST_SESSIONS, "How a new client starts. Your studio chooses its starting routines."),
      play(THE_TWENTY_MINUTES, "The session your team runs, as Journey understands it."),
      quiz("mixed", `Ten questions across Learning. ${NOTHING_KEPT}`),
    ],
  },
];
