/**
 * THE MIX's interactions, for shots.mjs (the Tactical Codex with the
 * Course's lessons, drills and glossary vault and the Vault's map as a lens:
 * the design AJ picked, Oct 19 2026; its id is still "codex"). steps.mjs
 * gathers this file; the format is in its header.
 *
 * The Mix's own steps are the "mix-" ones at the foot of `steps`: a topic's
 * Lesson tier (and its Check yourself), the glossary vault, Drill these, the
 * Catalog's and the Academy's Map lenses, Linked here (the -tall shot shows
 * the foot of the page) and the Overview's drill of the day.
 *
 * What these show, in the order AJ would try them on the iPad:
 *   the machine's four depths (tier 2's script and rep scrubber, tier 3's
 *   clinical and substitutes), a line tapped on the Leg Press, a concept
 *   card and a nested one, the peek (from the bento's quick card and from a
 *   concept card), the quick card opened as its own page, a topic's "Say
 *   it" tier, a path, the glossary's word entry, two quiz
 *   questions, and head office's queue. Then the judges' last fixes
 *   (Oct 19 2026): CX out of service under its title, the Leg Press's
 *   flag in a substitute's peek, and the switch staying put on "MSF
 *   original" on a medium trail.
 */

const enc = (ref) => encodeURIComponent(JSON.stringify(ref));

const MACHINE = "&view=machine-anatomy&machine=m-leg-press";
const TOPIC = `&view=academy&ref=${enc({ kind: "academy-topic", id: "performance-gradual-load-up" })}`;
const TERM_REF = `&view=academy&ref=${enc({ kind: "academy-glossary", id: "Concentric" })}`;
const LINE = "[data-vta-line]";
const TERM = "[data-vault-term], .vtc__term";
const TIER = (n) => `.cdx__tier:nth-child(${n})`;
const SPEED = `&view=academy&ref=${enc({ kind: "academy-topic", id: "performance-speed-of-movement" })}`;
const CUEING = `&view=academy&ref=${enc({ kind: "academy-cueing" })}`;
const GLOSSARY = `&view=academy&ref=${enc({ kind: "academy-glossary" })}`;
/** Next, taken n times (a tap that finds nothing is reported and the step still shoots). */
const NEXT = (n) => Array.from({ length: n }, () => [{ tapSelector: ".vtl__deck-next" }, { wait: 90 }]).flat();

export const steps = [
  // The showpiece: each depth of the Leg Press.
  // The Mix for everyone (Oct 20 2026): a machine's door to today's page, the
  // strip over it, and Back to Learning.
  { name: "today-door", query: MACHINE, actions: [{ tap: "Floor notes, set-up and history" }, { wait: 800 }] },
  { name: "today-back", query: MACHINE, actions: [{ tap: "Floor notes, set-up and history" }, { wait: 800 }, { tap: "Back to Learning" }, { wait: 800 }] },
  { name: "machine-tier2", query: MACHINE, actions: [{ tapSelector: TIER(2) }, { wait: 500 }] },
  { name: "machine-tier3", query: MACHINE, actions: [{ tapSelector: TIER(3) }, { wait: 500 }] },
  { name: "machine-tier4", query: MACHINE, actions: [{ tapSelector: TIER(4) }, { wait: 500 }] },
  // A concept card, and a card inside it.
  { name: "concept-card", query: TOPIC, actions: [{ tapSelector: `.cdx__tierpanel ${TERM}` }, { wait: 500 }] },
  {
    name: "concept-nested",
    query: MACHINE,
    actions: [{ tapSelector: `.cdx__lede ${TERM}` }, { wait: 500 }, { tapSelector: ".vtc__pop .vtc__term" }, { wait: 500 }],
  },
  // The peek: the bento's quick card, under the machine.
  { name: "peek-sheet", query: MACHINE, actions: [{ tap: "Quick card" }, { wait: 700 }] },
  // The quick card as its own page: titled by the piece, the machine above it.
  {
    name: "piece-page",
    query: MACHINE,
    actions: [{ tap: "Quick card" }, { wait: 700 }, { tap: "Open full page" }, { wait: 600 }],
  },
  // A topic's middle layer: the phrasebook's lines that use its words.
  { name: "topic-say-it", query: TOPIC, actions: [{ tap: "Say it" }, { wait: 500 }] },
  // A path, from the Overview.
  { name: "path", query: "&view=learning", actions: [{ tap: "Start Life Transformer 101" }, { wait: 500 }] },
  // A glossary word as its own entry.
  { name: "glossary-word", query: TERM_REF, actions: [{ wait: 300 }] },
  // Two quiz questions.
  {
    name: "quiz-two",
    query: "&view=learning",
    actions: [
      { tap: "Quick ten" },
      { wait: 900 },
      { tapSelector: ".qz__option" },
      { wait: 500 },
      { tap: "Next" },
      { wait: 500 },
      { tapSelector: ".qz__option" },
      { wait: 500 },
    ],
  },
  // A phrasebook moment as its own entry, from the phrasebook's contents.
  { name: "cue-moment", query: `&view=academy&ref=${enc({ kind: "academy-cueing" })}`, actions: [{ tap: "where the stack does not touch" }, { wait: 500 }] },
  // Tier 3's clinical flag, peeked, from the machine's bento.
  { name: "clinical-peek", query: MACHINE, actions: [{ tap: "Osteoporosis / Severe Osteopenia, clinical flag" }, { wait: 700 }] },
  // The Academy's contents.
  { name: "academy-index", query: "&view=academy", actions: [{ wait: 300 }] },
  // The judges' last fixes: CX (4 WAY NECK) out of service, said under its title.
  { name: "machine-out-of-service", query: "&view=machine-anatomy&machine=m-neck", actions: [{ wait: 400 }] },
  // A machine that stands in for the Leg Press, peeked from its Connected panel (after the tiers).
  { name: "substitute-peek", query: MACHINE, actions: [{ tap: "LEG EXTENSION" }, { wait: 700 }] },
  // The Mix (Oct 19 2026): a topic's Lesson tier, its first card and then its Check yourself.
  { name: "mix-topic-lesson", query: TOPIC, actions: [{ tap: "Lesson" }, { wait: 600 }] },
  { name: "mix-topic-lesson-card", query: TOPIC, actions: [{ tap: "Lesson" }, { wait: 500 }, ...NEXT(2), { wait: 500 }] },
  { name: "mix-topic-check", query: SPEED, actions: [{ tap: "Lesson" }, { wait: 500 }, ...NEXT(45), { wait: 600 }] },
  // The glossary vault, with one word opened (its definition, where it is taught).
  { name: "mix-glossary-vault", query: GLOSSARY, actions: [{ wait: 500 }] },
  { name: "mix-glossary-word", query: GLOSSARY, actions: [{ tapSelector: ".vtw__card-more" }, { wait: 500 }] },
  // The phrasebook's Drill these, one card revealed.
  { name: "mix-drill-these", query: CUEING, actions: [{ tap: "Drill these" }, { wait: 500 }] },
  { name: "mix-drill-revealed", query: CUEING, actions: [{ tap: "Drill these" }, { wait: 400 }, { tapSelector: ".vtd__btn" }, { wait: 700 }] },
  // The Catalog's Map lens and the Academy's.
  { name: "mix-catalog-map", query: "&view=machine-anatomy", actions: [{ tap: "Map" }, { wait: 900 }] },
  { name: "mix-academy-map", query: "&view=academy", actions: [{ tap: "Map" }, { wait: 900 }] },
  // Linked here, at the foot of the Leg Press (the -tall shot shows it) and of a topic.
  { name: "mix-linked-here", query: MACHINE, actions: [{ wait: 500 }] },
  { name: "mix-linked-here-topic", query: TOPIC, actions: [{ tap: "Full text" }, { wait: 500 }] },
  // The Overview's drill of the day, asked and then answered.
  { name: "mix-drill-of-the-day", query: "&view=learning", actions: [{ wait: 400 }] },
  { name: "mix-drill-of-the-day-revealed", query: "&view=learning", actions: [{ tap: "Show the Academy's lines" }, { wait: 700 }] },
];

/** The Codex's own way into the quiz: Quick ten, from the Overview's Play card. */
export const quiz = { query: "&view=learning", actions: [{ tap: "Quick ten" }, { wait: 900 }] };
