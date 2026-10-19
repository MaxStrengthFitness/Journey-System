/**
 * SAMPLE MARKUP — so a fresh prototype shows what a studio's version looks
 * like before anyone has crossed anything out.
 *
 * Round: the Learning vault redesign, Oct 19 2026. AJ judges three designs on
 * an iPad in the morning; a design whose markup layer is empty until he
 * types into it hides the very thing he asked to see ("a studio's version
 * with lines crossed out with a reason, and notes on lines"). So the sandbox
 * store starts with a little of everything, on the three pages a designer
 * meets first: the Leg Press, the Academy's Gradual Load-up and the cueing
 * phrasebook.
 *
 * WHAT IS REAL AND WHAT IS NOT
 * ----------------------------
 * - Every LINE marked here is real text, copied as a string (no JSON import:
 *   source files never import the Academy corpus statically): a Leg Press
 *   method line from MACHINE_DEFINITIONS["m-leg-press"] as methodLines reads
 *   it (machine-codex/format.ts), a phrase from cues.json, or a block of the
 *   performance-gradual-load-up topic. sample.test.ts reads those sources and
 *   fails if any string here is not in them, so a rebuilt corpus that changes
 *   a line shows up as a failed test, not as a sample mark nobody can find.
 * - The REASONS, NOTES and SUBMISSIONS are invented for the sample, written
 *   by sample people ("Sam Lee", a leader, and "Jordan Park", a Life
 *   Transformer). The other studios are "Practice Studio North / East /
 *   West", never real studios.
 * - The dispute is a real finding: the codex source check
 *   (docs/rounds/2026-09-28-codex-source-check.md) found the Leg Press's
 *   "Contraindicated for: Knee Replacement" is the opposite of Academy 6.1,
 *   and its proposed wording is that document's suggestion. The taken one is
 *   real too: the phrasebook's first "phrase" is an instruction to the
 *   reader, not something said to a client.
 * - One line (the Leg Press's Abduction suggestion) is crossed out at all
 *   three practice studios and the open one, so head office's count reads
 *   "Crossed out at 4 studios" with four reasons one tap away.
 *
 * Every date is a few days before `now`, so the marks read as recent.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { learningRefKey, type LearningRef } from "../learning/ref";
import { blockKeyFor } from "./blocks";
import type { LearningSubmission, StudioBlockNote, StudioMarkup, StudioStrike, VaultPerson } from "./types";

/** The sample people. Their uids say what they are. */
export const SAMPLE_LEADER: VaultPerson = { uid: "sample-sam-lee", name: "Sam Lee" };
export const SAMPLE_TRAINER: VaultPerson = { uid: "sample-jordan-park", name: "Jordan Park" };

/** The other studios in the sample: practice names, never real studios. */
export const PRACTICE_STUDIOS: readonly { id: string; name: string }[] = [
  { id: "practice-north", name: "Practice Studio North" },
  { id: "practice-east", name: "Practice Studio East" },
  { id: "practice-west", name: "Practice Studio West" },
];

/** The three pages the sample marks. */
export const SAMPLE_PAGES: Record<"legPress" | "loadUp" | "cueing", { ref: LearningRef; title: string }> = {
  legPress: { ref: { kind: "machine", id: "m-leg-press" }, title: "Leg Press" },
  loadUp: {
    ref: { kind: "academy-topic", id: "performance-gradual-load-up", moduleId: "performance" },
    title: "Gradual Load-up",
  },
  cueing: { ref: { kind: "academy-cueing" }, title: "Cueing phrasebook" },
};

type SamplePage = keyof typeof SAMPLE_PAGES;

/**
 * Every line the sample marks, with where it comes from. sample.test.ts
 * proves each one: "leg-press" lines are in methodLines(MACHINE_DEFINITIONS
 * ["m-leg-press"]), "cues" lines are phrases in cues.json, "topic" lines are
 * block texts of performance-gradual-load-up.
 */
export const SAMPLE_LINES = {
  abd: {
    from: "leg-press",
    text: "Consider doing ABD prior to LP to pre-fatigue glutes and improve sensation of glute engagement.",
  },
  barelyTouch: { from: "leg-press", text: "Barely touch, barely start" },
  kneeReplacement: { from: "leg-press", text: "Knee Replacement" },
  crawl: { from: "cues", text: "Crawl" },
  mmmHmm: { from: "cues", text: "Mmm-Hmm" },
  stoic: { from: "cues", text: "Stoic" },
  lunge: { from: "cues", text: "DO NOT lunge or heave" },
  seeScripts: { from: "cues", text: "SEE INDIVIDUAL EXERCISE SCRIPTS FOR MORE SPECIFIC EXAMPLES" },
  loadUpOpening: {
    from: "topic",
    text: "For all compound pushing movements and most single-joint movements, the subject begins the exercise by lifting the weight from a dead stop in the stretched position. It is critical that the initial application of force, or load-up, be performed with the most attentive focus on being gradual or incremental with the pressure applied.",
  },
  legExtension: {
    from: "topic",
    text: "To illustrate this gradual load-up, let us consider the leg extension. Note that the first 15-30 degrees in the leg extension movement occurs almost at once if not closely controlled. Meaningful tension is then obviated by the momentum employed to begin the exercise. If not properly instructed and enforced by the trainer, this habit will only worsen over time, leading to ineffective and potentially dangerous exercise. Instead, consider the following mental imagery to help learn how to properly apply a gradual effort:",
  },
} as const satisfies Record<string, { from: "leg-press" | "cues" | "topic"; text: string }>;

type SampleLine = keyof typeof SAMPLE_LINES;

const HOUR = 60 * 60 * 1000;

/**
 * The sample, for the studio that is open. Markup for that studio (two
 * crossed-out lines, two notes) and for the three practice studios (three
 * crossed-out lines each), and three submissions from the open studio: a
 * dispute and an addition waiting, and one head office has already taken.
 */
export function sampleSeed(
  studio: { id: string; name: string },
  now: Date,
): { markup: StudioMarkup[]; submissions: LearningSubmission[] } {
  const t0 = now.getTime();
  const ago = (hours: number): string => new Date(t0 - hours * HOUR).toISOString();

  const strike = (line: SampleLine, reason: string, hoursAgo: number, replacement?: string): StudioStrike => {
    const text = SAMPLE_LINES[line].text;
    const s: StudioStrike = { blockKey: blockKeyFor(text), originalText: text, reason, by: SAMPLE_LEADER, at: ago(hoursAgo) };
    if (replacement) s.replacement = replacement;
    return s;
  };
  const note = (id: string, line: SampleLine, body: string, author: VaultPerson, hoursAgo: number): StudioBlockNote => {
    const text = SAMPLE_LINES[line].text;
    return { id, blockKey: blockKeyFor(text), quote: text, body, author, at: ago(hoursAgo) };
  };
  const doc = (
    where: { id: string; name: string },
    page: SamplePage,
    strikes: StudioStrike[],
    notes: StudioBlockNote[] = [],
  ): StudioMarkup => ({
    studioId: where.id,
    studioName: where.name,
    targetKey: learningRefKey(SAMPLE_PAGES[page].ref),
    title: SAMPLE_PAGES[page].title,
    strikes,
    notes,
  });

  const [north, east, west] = PRACTICE_STUDIOS;

  const markup: StudioMarkup[] = [
    // ---- the open studio: two crossed out, two notes ----
    doc(
      studio,
      "legPress",
      [strike("abd", "Our Abduction comes after the Leg Press in the walking order, so we don't pre-fatigue here.", 50)],
      [note("sample-note-1", "barelyTouch", "Our stack is loud at the bottom. Say this before the plates touch on the first rep.", SAMPLE_TRAINER, 26)],
    ),
    doc(studio, "cueing", [strike("stoic", "Clients hear it as cold. We coach a calm face in our own words.", 74, "Soft face, slow breath.")]),
    doc(
      studio,
      "loadUp",
      [],
      [note("sample-note-2", "loadUpOpening", "New clients get the 100 lb picture from further down this page on their first set.", SAMPLE_LEADER, 30)],
    ),

    // ---- Practice Studio North ----
    doc(north, "legPress", [strike("abd", "There is no Abduction machine on our floor.", 150)]),
    doc(north, "cueing", [
      strike("crawl", "One word on its own confused new clients. We say the whole sentence.", 146),
      strike("mmmHmm", "We say a word, not a sound, so the client knows it was heard.", 140, "Yes, just like that."),
    ]),

    // ---- Practice Studio East ----
    doc(east, "legPress", [strike("abd", "We keep the Abduction for routine B.", 190)]),
    doc(east, "cueing", [strike("crawl", "Our clients hear it as an order to slow right down.", 186, "Keep the same pace.")]),
    doc(east, "loadUp", [
      strike("legExtension", "There is no Leg Extension on our floor. We teach the load-up on the Leg Press.", 180),
    ]),

    // ---- Practice Studio West ----
    doc(west, "legPress", [strike("abd", "Our order puts the Abduction late in the session. We don't move it for this.", 220)]),
    doc(west, "cueing", [
      strike("stoic", "Reads as cold to our clients.", 214),
      strike("lunge", "We say it calmly. Capitals read as shouting on the floor.", 210, "Keep it smooth, no heave."),
    ]),
  ].filter((m) => m.strikes.length > 0 || m.notes.length > 0);

  const sub = (
    id: string,
    page: SamplePage,
    fields: Omit<LearningSubmission, "id" | "ref" | "targetKey" | "targetTitle" | "studioId" | "studioName">,
  ): LearningSubmission => ({
    id,
    ref: SAMPLE_PAGES[page].ref,
    targetKey: learningRefKey(SAMPLE_PAGES[page].ref),
    targetTitle: SAMPLE_PAGES[page].title,
    studioId: studio.id,
    studioName: studio.name,
    ...fields,
  });
  const quoted = (line: SampleLine) => ({ blockKey: blockKeyFor(SAMPLE_LINES[line].text), quote: SAMPLE_LINES[line].text });

  const submissions: LearningSubmission[] = [
    sub("sample-sub-1", "legPress", {
      intent: "dispute",
      ...quoted("kneeReplacement"),
      body: "Academy 6.1 puts the Leg Press in a knee-replacement client's workouts once physical therapy is done. This line says the opposite.",
      proposed:
        "Nothing on the knee until physical therapy is finished and the client is cleared. After that the Leg Press is included, with a Leg Curl first as a warm-up.",
      by: SAMPLE_TRAINER,
      at: ago(20),
      status: "pending",
    }),
    sub("sample-sub-2", "loadUp", {
      intent: "addition",
      body: "Most of our new clients meet the load-up on the Leg Press first. The footplate version of the 100 lb picture would help them.",
      proposed: "On the Leg Press, picture 100 lbs on the stack and find 101 lbs through the footplate before anything moves.",
      by: SAMPLE_LEADER,
      at: ago(44),
      status: "pending",
    }),
    sub("sample-sub-3", "cueing", {
      intent: "dispute",
      ...quoted("seeScripts"),
      body: "This is a note to the reader, not something we say to a client. It sits with the phrases.",
      by: SAMPLE_TRAINER,
      at: ago(96),
      status: "taken",
      decision: { note: "Agreed: it is a note for the reader, not a cue.", byName: "Head office", at: ago(52) },
    }),
  ];

  return { markup, submissions };
}
