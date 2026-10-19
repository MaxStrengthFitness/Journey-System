/**
 * PLAIN SENSE — when a method word is just a word.
 *
 * Round: the Learning vault redesign, Oct 19 2026 (the content review).
 *
 * Six of the Academy glossary's terms are also everyday English: Positive,
 * Negative, Purpose, Intent, Continuous and Path. Linked and counted
 * wherever they appear, "Positive feedback optional" on the Leg Press card
 * opened the lifting phase, "The purpose of an end stop" made Purpose the End
 * Stop card's first connection, "continuous renewal of bone tissue" tied Bone
 * Density to the Continuous Tension Method, and "career paths" put the
 * Mission page first among the topics about Path.
 *
 * So each of the six has ONE narrow rule for its everyday sense, read from
 * the words right beside it, never a list of whole sentences (a rebuilt
 * corpus keeps working). The rules were read off every use in the corpus
 * (Oct 19 2026) and lean toward keeping a link: a doubtful use stays the
 * method's.
 *
 *   positive, negative   everyday when the next word is a plain noun the
 *                        lifting and lowering phases never take: "positive
 *                        feedback / reinforcement / effects / way",
 *                        "negative impact / consequences / result", "a
 *                        negative because". "6-second positive", "the
 *                        negative phase", "positive movement" stay.
 *   purpose              the 4th P is written with a capital ("Posture,
 *                        Path, and Purpose", "is Purpose."), so a lower-case
 *                        "purpose" ("For our purposes", "the purpose of an
 *                        end stop") is everyday, and so is a capital one
 *                        followed by "of" (a heading: "Purpose of This
 *                        Module"). Inside a list of the P's it is always
 *                        the method's ("posture, pace, path, purpose").
 *   intent               everyday as "the intent behind", "intent on",
 *                        "our intent was", "with intent", "anatomical
 *                        intent". "The trainee's intent to move faster" and
 *                        "that is not the intent" (the set's aim) stay.
 *   continuous           everyday before renewal, improvement, education,
 *                        learning, encouragement, evaluation, adjustment,
 *                        cycle or a metabolic effect. "Be continuous at the
 *                        bottom" and "one continuous pace" stay.
 *   path                 everyday as "career path" and "a path to / toward"
 *                        something. "Arm path", "the path of the machine"
 *                        and "the path of least resistance" stay.
 *
 * Both readers ask this: entities.ts (a word that opens a card) and graph.ts
 * (a word the graph and graph-index.json count), so a card, a map link and a
 * "Comes up in" list never disagree.
 *
 * PURE MODULE: no imports.
 */

/** What sits right beside one match. */
interface Around {
  /** The matched word as written ("Purpose", "purposes"). */
  raw: string;
  /** The word before, lower-case, when only spaces separate it; "" otherwise. */
  before: string;
  /** The word after, lower-case, when only spaces separate it; "" otherwise. */
  after: string;
  /** A little of the text on each side, for the P's list. */
  near: string;
}

const PHASE_EVERYDAY_NEXT = new Set([
  "feedback",
  "reinforcement",
  "effect",
  "effects",
  "benefit",
  "benefits",
  "way",
  "ways",
  "attribute",
  "health",
  "hormonal",
  "impact",
  "result",
  "results",
  "consequence",
  "consequences",
  "because",
]);

const CONTINUOUS_EVERYDAY_NEXT = new Set([
  "renewal",
  "improvement",
  "education",
  "learning",
  "encouragement",
  "evaluation",
  "adjustment",
  "metabolic",
  "cycle",
]);

/** Another of the four P's within a few words: a list of them. */
const OTHER_P = /\b(posture|pace|path)\b/i;

const EVERYDAY: Readonly<Record<string, (a: Around) => boolean>> = {
  positive: (a) => PHASE_EVERYDAY_NEXT.has(a.after),
  negative: (a) => PHASE_EVERYDAY_NEXT.has(a.after),
  purpose: (a) => !OTHER_P.test(a.near) && (!/^[A-Z]/.test(a.raw) || a.after === "of"),
  intent: (a) => a.after === "behind" || a.after === "on" || a.after === "was" || a.before === "with" || a.before === "anatomical",
  continuous: (a) => CONTINUOUS_EVERYDAY_NEXT.has(a.after),
  path: (a) => a.before === "career" || a.after === "to" || a.after === "toward" || a.after === "towards",
};

/** The words a rule governs, for a test or a reader. */
export const PLAIN_SENSE_WORDS: readonly string[] = Object.keys(EVERYDAY);

/** The rule for a matched word, plural or not ("purposes" is "purpose"). */
function ruleFor(raw: string): ((a: Around) => boolean) | null {
  const key = raw.toLowerCase();
  return EVERYDAY[key] ?? EVERYDAY[key.replace(/s$/, "")] ?? EVERYDAY[key.replace(/es$/, "")] ?? null;
}

/**
 * True when the word matched at `start` in `text` is meant in its everyday
 * sense, so it is neither linked nor counted. False for every word the rules
 * don't govern, and for every use they keep.
 */
export function isPlainSense(raw: string, text: string, start: number): boolean {
  const rule = ruleFor(raw);
  if (!rule) return false;
  const end = start + raw.length;
  const before = /([A-Za-z]+)[ \t]+$/.exec(text.slice(Math.max(0, start - 40), start))?.[1] ?? "";
  const after = /^[ \t]+([A-Za-z]+)/.exec(text.slice(end, end + 40))?.[1] ?? "";
  const near = `${text.slice(Math.max(0, start - 30), start)} ${text.slice(end, end + 30)}`;
  return rule({ raw, before: before.toLowerCase(), after: after.toLowerCase(), near });
}
