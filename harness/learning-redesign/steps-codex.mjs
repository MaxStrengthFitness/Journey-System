/**
 * THE TACTICAL CODEX's interactions, for shots.mjs (Design 1 of the
 * Learning vault redesign, Oct 19 2026). steps.mjs gathers this file; the
 * format is in its header.
 *
 * What these show, in the order AJ would try them on the iPad:
 *   the machine's four depths (tier 2's script and rep scrubber, tier 3's
 *   clinical and substitutes), a line tapped on the Leg Press, a concept
 *   card and a nested one, the peek (from the bento's quick card and from a
 *   concept card), a topic's "Say it" tier, the MSF original, a path, the
 *   glossary's word entry, two quiz questions, and head office's queue.
 */

const enc = (ref) => encodeURIComponent(JSON.stringify(ref));

const MACHINE = "&view=machine-anatomy&machine=m-leg-press";
const TOPIC = `&view=academy&ref=${enc({ kind: "academy-topic", id: "performance-gradual-load-up" })}`;
const TERM_REF = `&view=academy&ref=${enc({ kind: "academy-glossary", id: "Concentric" })}`;
const LINE = "[data-vta-line]";
const TERM = "[data-vault-term], .vtc__term";
const TIER = (n) => `.cdx__tier:nth-child(${n})`;

export const steps = [
  // The showpiece: each depth of the Leg Press.
  { name: "machine-tier2", query: MACHINE, actions: [{ tapSelector: TIER(2) }, { wait: 500 }] },
  { name: "machine-tier3", query: MACHINE, actions: [{ tapSelector: TIER(3) }, { wait: 500 }] },
  { name: "machine-tier4", query: MACHINE, actions: [{ tapSelector: TIER(4) }, { wait: 500 }] },
  // A line on the Leg Press, tapped: its actions open in place.
  { name: "line-tapped", query: MACHINE, actions: [{ tapSelector: TIER(2) }, { wait: 400 }, { tapSelector: `.cdx__tierpanel ${LINE}` }, { wait: 400 }] },
  // A concept card, and a card inside it.
  { name: "concept-card", query: TOPIC, actions: [{ tapSelector: `.cdx__tierpanel ${TERM}` }, { wait: 500 }] },
  {
    name: "concept-nested",
    query: MACHINE,
    actions: [{ tapSelector: `.cdx__lede ${TERM}` }, { wait: 500 }, { tapSelector: ".vtc__pop .vtc__term" }, { wait: 500 }],
  },
  // The peek: the bento's quick card, under the machine.
  { name: "peek-sheet", query: MACHINE, actions: [{ tap: "Quick card" }, { wait: 700 }] },
  // A topic's middle layer: the phrasebook's lines that use its words.
  { name: "topic-say-it", query: TOPIC, actions: [{ tap: "Say it" }, { wait: 500 }] },
  // The MSF original, one tap away.
  { name: "msf-original", query: MACHINE, actions: [{ tap: "MSF original" }, { wait: 400 }, { tapSelector: TIER(4) }, { wait: 400 }] },
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
  // Head office's door and its queue.
  { name: "head-office-home", query: "&view=learning&viewAs=head-office", actions: [{ wait: 300 }] },
  { name: "head-office-queue", query: "&view=learning&viewAs=head-office", actions: [{ tap: "Waiting for review" }, { wait: 600 }] },
  // A phrasebook moment as its own entry, from the phrasebook's contents.
  { name: "cue-moment", query: `&view=academy&ref=${enc({ kind: "academy-cueing" })}`, actions: [{ tap: "where the stack does not touch" }, { wait: 500 }] },
  // Tier 3's clinical flag, peeked, from the machine's bento.
  { name: "clinical-peek", query: MACHINE, actions: [{ tap: "Osteoporosis / Severe Osteopenia, clinical flag" }, { wait: 700 }] },
  // The Academy's contents.
  { name: "academy-index", query: "&view=academy", actions: [{ wait: 300 }] },
];

/** The Codex's own way into the quiz: Quick ten, from the Overview's Play card. */
export const quiz = { query: "&view=learning", actions: [{ tap: "Quick ten" }, { wait: 900 }] };
