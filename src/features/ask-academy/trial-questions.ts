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
 * AJ's (Oct 18 2026) are his ten reasons a trainer opens the Academy, told one
 * at a time and turned into questions in his words (`reason` is which of the
 * ten). Some test that the Academy admits a gap: maintenance, sales policy,
 * marketing and the Journey app itself are not the method, and a made-up
 * answer to them is a fail.
 */

export interface TrialQuestion {
  id: string;
  question: string;
  /** Page ids that should answer it (any one is a hit), "not_covered" when the Academy shouldn't, null when not scored. */
  expect: readonly string[] | "not_covered" | null;
  from: "claude" | "aj";
  /** AJ's reason, 1 to 10: a machine · the protocol and clients' problems · routines · problem-solving · maintenance · sales · say it simply · the community · using Journey (9 and 10). */
  reason?: number;
  /** An injury or condition: the answer must lead with the Academy's clearance line. */
  health?: true;
  /** Pages that sound right but answer a different question; quoting one is a fail. */
  avoid?: readonly string[];
}

const CR = ["overview:compound-row", "script:upper-body-cr", "card:cr", "topic:instruction-msf-upper-body-setup-and-instruction"];
const PAIN = ["topic:programming-considerations-for-training-with-pain", "topic:programming-workout-programming-considerations", "topic:variations-timed-static-contraction-tsc", "topic:variations-static-hold-sh"];

export const AJ_QUESTIONS: readonly TrialQuestion[] = [
  // 1. Studying one machine.
  { id: "a01", from: "aj", reason: 1, question: "I've never done the compound row. How do I set a client up on it, and how do I get to the right settings?", expect: CR },
  { id: "a02", from: "aj", reason: 1, question: "How do I get posture, path, pace and purpose right on the compound row?", expect: [...CR, "topic:intro-posture-path-pace-purpose"] },
  { id: "a03", from: "aj", reason: 1, question: "Why would I do the compound row instead of the simple row?", expect: ["topic:programming-ab-routines-how-to-optimize-programming", "overview:compound-row", "overview:simple-row"] },
  { id: "a04", from: "aj", reason: 1, question: "What's a good replacement for the compound row, and why?", expect: ["topic:programming-exercise-substitutes", "topic:programming-ab-routines-how-to-optimize-programming"] },
  // 2. The protocol, and clients' problems.
  { id: "a05", from: "aj", reason: 2, question: "Explain the continuous tension protocol to me like I'm new.", expect: ["topic:continuous-tension-about-our-continuous-tension-method", "topic:continuous-tension-performing-the-continuous-tension-method", "topic:continuous-tension-what-makes-the-continuous-tension-method-"] },
  { id: "a06", from: "aj", reason: 2, question: "My client holds their breath during the set. How do I help them stop?", expect: ["topic:mastery-breathing", "topic:performance-eih", "cues"] },
  { id: "a07", from: "aj", reason: 2, question: "My client keeps resting the weights between reps. What do I do?", expect: ["topic:performance-turnaround-technique", "topic:mastery-lower-turnarounds", "topic:continuous-tension-performing-the-continuous-tension-method", "cues"] },
  { id: "a08", from: "aj", reason: 2, health: true, question: "Client has osteoporosis. What do I need to change?", expect: ["overview:torso-rotation", "card:tr", "topic:programming-faq", "topic:benefits-structural-integrity-bone-density"] },
  { id: "a09", from: "aj", reason: 2, health: true, question: "Client just had a knee replacement. How do I still give them a good workout?", expect: PAIN },
  { id: "a10", from: "aj", reason: 2, health: true, question: "Client had wrist surgery. What should I watch for?", expect: ["topic:variations-timed-static-contraction-tsc"] },
  { id: "a11", from: "aj", reason: 2, question: "How does the studio handle retention?", expect: null },
  // 3. Routines.
  { id: "a12", from: "aj", reason: 3, question: "How do I build a B routine for my client?", expect: ["topic:programming-ab-routines-how-to-optimize-programming", "topic:programming-exercise-selection-template", "topic:mastery-exercise-selection-template"] },
  { id: "a13", from: "aj", reason: 3, question: "Why do we have an A and a B routine?", expect: ["topic:programming-ab-routines-how-to-optimize-programming", "topic:further-exercise-variety"] },
  { id: "a14", from: "aj", reason: 3, question: "My client can't do the leg press anymore. What do I swap it for?", expect: ["topic:programming-exercise-substitutes"] },
  { id: "a15", from: "aj", reason: 3, question: "My client hasn't done the pullover in months. How hard should I push them on it?", expect: ["topic:mastery-how-intensely-to-push-a-client", "topic:principles-individual-variability"], avoid: ["topic:performance-eih"] },
  { id: "a16", from: "aj", reason: 3, question: "How do I know how hard to push a client?", expect: ["topic:mastery-how-intensely-to-push-a-client", "topic:mastery-effort"] },
  // 4. Problem-solving.
  { id: "a17", from: "aj", reason: 4, question: "Client can barely do the overhead press at 20 lb. How do I train them?", expect: ["topic:variations-static-hold-sh", "topic:variations-timed-static-contraction-tsc", "topic:programming-exercise-substitutes", "overview:overhead-press", "script:upper-body-oh"] },
  { id: "a18", from: "aj", reason: 4, health: true, question: "Client has knee pain on the leg press. What can I do?", expect: [...PAIN, "overview:leg-press", "card:lp", "script:lower-body-lp"] },
  { id: "a19", from: "aj", reason: 4, health: true, question: "Client has neck pain after their workouts. What could be causing it?", expect: ["topic:performance-eih", "topic:mastery-breathing", "overview:cervical-extension"] },
  { id: "a20", from: "aj", reason: 4, health: true, question: "Client has a shoulder injury and wants to rehab it.", expect: PAIN },
  { id: "a21", from: "aj", reason: 4, question: "Client has really weak hamstrings. How do we improve that?", expect: ["overview:leg-curl", "script:lower-body-lc", "card:lc"] },
  { id: "a22", from: "aj", reason: 4, question: "My client just isn't getting the pullover. How do I teach it differently?", expect: ["script:upper-body-po", "overview:pullover", "card:po", "cues"] },
  // 5. Maintenance.
  { id: "a23", from: "aj", reason: 5, question: "The leg press is squeaking. How do I fix it?", expect: "not_covered" },
  // 6. Sales and the business side.
  { id: "a24", from: "aj", reason: 6, question: "How do I word a conversation about upgrading my client's package?", expect: null },
  { id: "a25", from: "aj", reason: 6, question: "How do I talk to a client about renewing?", expect: null },
  { id: "a26", from: "aj", reason: 6, question: "How do I handle a client who's late all the time?", expect: null },
  // 7. Say it simply.
  { id: "a27", from: "aj", reason: 7, question: "My client doesn't get what 'load up slowly' means. How do I say it simpler?", expect: ["cues", "topic:performance-gradual-load-up", "topic:mastery-gradual-load-up"] },
  { id: "a28", from: "aj", reason: 7, question: "How do I explain breathing to a client in a few words?", expect: ["topic:mastery-breathing", "cues"] },
  { id: "a29", from: "aj", reason: 7, question: "How do I teach a client to engage their abs?", expect: null },
  { id: "a30", from: "aj", reason: 7, question: "My client can't feel the muscle working. What do I say?", expect: ["topic:mastery-purpose", "topic:mastery-squeeze-technique", "topic:consultation-initial-consultation-and-articles-internalizati"] },
  // 8. The community.
  { id: "a31", from: "aj", reason: 8, question: "What should I tell people about strength training at a community event?", expect: ["topic:benefits-why-resistance-training", "topic:summary-benefits-of-resistance-training", "topic:benefits-sarcopenia", "topic:benefits-structural-integrity-bone-density"] },
  { id: "a32", from: "aj", reason: 8, question: "How do I get our studio involved with the city?", expect: "not_covered" },
  { id: "a33", from: "aj", reason: 8, question: "How can I use our clients' results in our marketing?", expect: "not_covered" },
  // 9 and 10. Using Journey: none of it is the Academy's, and no app feature may be made up.
  { id: "a34", from: "aj", reason: 9, question: "What is Pulse?", expect: "not_covered" },
  { id: "a35", from: "aj", reason: 9, question: "How do I run a session in Journey?", expect: "not_covered" },
  { id: "a36", from: "aj", reason: 10, question: "What do I still have to do in Mindbody?", expect: "not_covered" },
  { id: "a37", from: "aj", reason: 10, question: "What is Demo Mode for?", expect: "not_covered" },
];

const CLAUDE_QUESTIONS: readonly TrialQuestion[] = [
  { id: "q01", from: "claude", question: "What's the lower turnaround, and why does it matter so much?", expect: ["topic:mastery-lower-turnarounds", "topic:performance-turnaround-technique", "topic:intro-random-notes-and-faqs"] },
  { id: "q02", from: "claude", question: "How fast should each rep be?", expect: ["topic:performance-speed-of-movement", "topic:performance-components-of-a-repetition", "topic:mastery-pace"] },
  { id: "q03", from: "claude", question: "How long should we rest between machines?", expect: ["topic:performance-rest-interval-between-exercises"] },
  { id: "q04", from: "claude", question: "My client keeps holding their breath during the set. What do I tell them?", expect: ["topic:mastery-breathing", "topic:intro-random-notes-and-faqs"] },
  { id: "q05", from: "claude", question: "What are the 4 P's?", expect: ["topic:intro-posture-path-pace-purpose", "topic:mastery-posture", "topic:mastery-path", "topic:mastery-pace", "topic:mastery-purpose"] },
  { id: "q06", from: "claude", question: "How do I run a timed static contraction?", expect: ["topic:variations-timed-static-contraction-tsc"] },
  { id: "q07", from: "claude", question: "When would I use a static hold instead of full reps?", expect: ["topic:variations-static-hold-sh", "topic:programming-considerations-for-training-with-pain"] },
  { id: "q08", from: "claude", question: "A client asks 'did you add weight?' How should I answer?", expect: ["topic:intro-random-notes-and-faqs"] },
  { id: "q09", from: "claude", health: true, question: "Client has arthritis in their knee. Where do I start?", expect: ["topic:programming-considerations-for-training-with-pain", "topic:mastery-training-with-pain-arthritis-fibro-myalgia-tendoniti"] },
  { id: "q10", from: "claude", question: "What does the clicker count, and what doesn't it?", expect: ["topic:further-registering-performance-use-of-the-clicker"] },
  { id: "q11", from: "claude", question: "How do we choose a new client's starting weights?", expect: ["topic:programming-msf-suggested-starting-weights"] },
  { id: "q12", from: "claude", question: "What's the difference between an A and a B routine?", expect: ["topic:programming-ab-routines-how-to-optimize-programming"] },
  { id: "q13", from: "claude", question: "How many times a week should a client train?", expect: ["topic:principles-frequency"] },
  { id: "q14", from: "claude", question: "Where should the seat be on the leg press?", expect: ["overview:leg-press", "card:lp", "script:lower-body-lp"] },
  { id: "q15", from: "claude", question: "What do I say to a client during a pullover set?", expect: ["script:upper-body-po", "overview:pullover", "card:po"] },
  { id: "q16", from: "claude", health: true, question: "Client had a hip replacement. Anything to change on the abduction machine?", expect: ["script:lower-body-abd", "overview:abduction", "card:abd"] },
  { id: "q17", from: "claude", question: "How hard should I push a 75-year-old client?", expect: ["topic:mastery-how-intensely-to-push-a-client", "topic:principles-individual-variability"] },
  { id: "q18", from: "claude", question: "My client says they don't feel it in their back on the pulldown. What's going on?", expect: ["topic:intro-random-notes-and-faqs", "overview:pulldown-torso-arm", "topic:mastery-squeeze-technique", "card:pd"] },
  { id: "q19", from: "claude", question: "Why is one set to failure enough?", expect: ["topic:performance-number-of-sets", "topic:principles-volume", "topic:principles-productive-exercise-the-stimulating-reps-model"] },
  { id: "q20", from: "claude", question: "What's the studio's late-cancel fee?", expect: "not_covered" },
];

/** Claude's twenty, then AJ's. */
export const TRIAL_QUESTIONS: readonly TrialQuestion[] = [...CLAUDE_QUESTIONS, ...AJ_QUESTIONS];
