/**
 * The trial's questions (phase 0 of Ask the Academy, Oct 16 2026).
 *
 * The plan page said 20 from the Academy's "Random Notes and FAQs" page; that
 * page is mostly prose with a handful of real questions, so these 20 are
 * written across the Academy the way a trainer would ask, each naming the
 * pages it should come from. A pick that names none of them is a flag to read,
 * not a failure: the Executive Summary repeats much of the method, and a pick
 * from it can be right. The last is a control the Academy doesn't cover.
 *
 * AJ adds ten of his own (`from: "aj"`, nothing expected), in his words.
 */

export interface TrialQuestion {
  id: string;
  question: string;
  /** Page ids that should answer it (any one is a hit), "not_covered" for the control, null when not scored. */
  expect: readonly string[] | "not_covered" | null;
  from: "claude" | "aj";
}

export const TRIAL_QUESTIONS: readonly TrialQuestion[] = [
  { id: "q01", from: "claude", question: "What's the lower turnaround, and why does it matter so much?", expect: ["topic:mastery-lower-turnarounds", "topic:performance-turnaround-technique", "topic:intro-random-notes-and-faqs"] },
  { id: "q02", from: "claude", question: "How fast should each rep be?", expect: ["topic:performance-speed-of-movement", "topic:performance-components-of-a-repetition", "topic:mastery-pace"] },
  { id: "q03", from: "claude", question: "How long should we rest between machines?", expect: ["topic:performance-rest-interval-between-exercises"] },
  { id: "q04", from: "claude", question: "My client keeps holding their breath during the set. What do I tell them?", expect: ["topic:mastery-breathing", "topic:intro-random-notes-and-faqs"] },
  { id: "q05", from: "claude", question: "What are the 4 P's?", expect: ["topic:intro-posture-path-pace-purpose", "topic:mastery-posture", "topic:mastery-path", "topic:mastery-pace", "topic:mastery-purpose"] },
  { id: "q06", from: "claude", question: "How do I run a timed static contraction?", expect: ["topic:variations-timed-static-contraction-tsc"] },
  { id: "q07", from: "claude", question: "When would I use a static hold instead of full reps?", expect: ["topic:variations-static-hold-sh", "topic:programming-considerations-for-training-with-pain"] },
  { id: "q08", from: "claude", question: "A client asks 'did you add weight?' How should I answer?", expect: ["topic:intro-random-notes-and-faqs"] },
  { id: "q09", from: "claude", question: "Client has arthritis in their knee. Where do I start?", expect: ["topic:programming-considerations-for-training-with-pain", "topic:mastery-training-with-pain-arthritis-fibro-myalgia-tendoniti"] },
  { id: "q10", from: "claude", question: "What does the clicker count, and what doesn't it?", expect: ["topic:further-registering-performance-use-of-the-clicker"] },
  { id: "q11", from: "claude", question: "How do we choose a new client's starting weights?", expect: ["topic:programming-msf-suggested-starting-weights"] },
  { id: "q12", from: "claude", question: "What's the difference between an A and a B routine?", expect: ["topic:programming-ab-routines-how-to-optimize-programming"] },
  { id: "q13", from: "claude", question: "How many times a week should a client train?", expect: ["topic:principles-frequency"] },
  { id: "q14", from: "claude", question: "Where should the seat be on the leg press?", expect: ["overview:leg-press", "card:lp", "script:lower-body-lp"] },
  { id: "q15", from: "claude", question: "What do I say to a client during a pullover set?", expect: ["script:upper-body-po", "overview:pullover", "card:po"] },
  { id: "q16", from: "claude", question: "Client had a hip replacement. Anything to change on the abduction machine?", expect: ["script:lower-body-abd", "overview:abduction", "card:abd"] },
  { id: "q17", from: "claude", question: "How hard should I push a 75-year-old client?", expect: ["topic:mastery-how-intensely-to-push-a-client", "topic:principles-individual-variability"] },
  { id: "q18", from: "claude", question: "My client says they don't feel it in their back on the pulldown. What's going on?", expect: ["topic:intro-random-notes-and-faqs", "overview:pulldown-torso-arm", "topic:mastery-squeeze-technique", "card:pd"] },
  { id: "q19", from: "claude", question: "Why is one set to failure enough?", expect: ["topic:performance-number-of-sets", "topic:principles-volume", "topic:principles-productive-exercise-the-stimulating-reps-model"] },
  { id: "q20", from: "claude", question: "What's the studio's late-cancel fee?", expect: "not_covered" },
];
