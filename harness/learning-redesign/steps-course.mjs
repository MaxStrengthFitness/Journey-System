/**
 * Design 3, the Interactive Course & Field Manual: the interactions that show
 * it at its best (steps.mjs has the format). Each is a fresh page load.
 */
// Written out here, not imported: steps.mjs imports this file while it loads.
const MACHINE = "&view=machine-anatomy&machine=m-leg-press";
const TOPIC = `&view=academy&ref=${encodeURIComponent(JSON.stringify({ kind: "academy-topic", id: "performance-gradual-load-up" }))}`;
const LINE = "[data-vta-line]";
const TERM = "[data-vault-term], .vtc__term";
const COURSE = "&view=learning";
const PLAYBOOK = `&view=academy&ref=${encodeURIComponent(JSON.stringify({ kind: "academy-topic", id: "performance-turnaround-technique" }))}`;
const CUEING = `&view=academy&ref=${encodeURIComponent(JSON.stringify({ kind: "academy-cueing" }))}`;

export const steps = [
  // The signature: a lesson as step cards, turned to its second card, and
  // its fourth (Next stays where the thumb left it: the stage is as tall as
  // the deck's tallest card).
  { name: "lesson-card-2", query: TOPIC, actions: [{ wait: 600 }, { tapSelector: ".crs__deck-next" }, { wait: 500 }] },
  {
    name: "lesson-card-4",
    query: TOPIC,
    actions: [{ wait: 600 }, { tapSelector: ".crs__deck-next" }, { tapSelector: ".crs__deck-next" }, { tapSelector: ".crs__deck-next" }, { wait: 500 }],
  },
  // The last card: Check yourself, one question answered.
  {
    name: "lesson-check",
    query: TOPIC,
    actions: [
      { wait: 600 },
      ...Array.from({ length: 12 }, () => ({ tapSelector: ".crs__deck-next" })),
      { wait: 500 },
      { tapSelector: ".crs__q-opt" },
      { wait: 500 },
    ],
  },
  // A course: Start the course from the Overview, then the course's own list.
  { name: "course-start", query: COURSE, actions: [{ tap: "Start the course" }, { wait: 700 }] },
  { name: "course-list", query: COURSE, actions: [{ tap: "All 9 lessons" }, { wait: 600 }] },
  // The field manual: a pin turns the set-up deck; a line tapped in the full manual.
  { name: "machine-pin", query: MACHINE, actions: [{ wait: 600 }, { tapSelector: "button.crs__pin" }, { wait: 700 }] },
  { name: "machine-tier", query: MACHINE, actions: [{ wait: 600 }, { tap: "Script & cues" }, { wait: 500 }] },
  { name: "line-tapped", query: MACHINE, actions: [{ wait: 600 }, { tapSelector: LINE }, { wait: 500 }] },
  // What would you cue? on the Overview, revealed.
  { name: "drill-revealed", query: COURSE, actions: [{ tap: "Show the Academy's lines" }, { wait: 800 }] },
  // The phrasebook's one-word moment revealed: short cues flow side by side.
  {
    name: "cueing-one-word",
    query: CUEING,
    actions: [{ wait: 600 }, { tapSelector: "#crs-moment-4 .crs__drill-foot button" }, { wait: 800 }],
  },
  // The field manual's first moment revealed, then peeked whole: the peek holds that moment alone.
  {
    name: "peek-moment",
    query: MACHINE,
    actions: [
      { wait: 600 },
      { tapSelector: ".crs__drills .crs__drill .crs__drill-foot button" },
      { wait: 400 },
      { tapSelector: ".crs__drills .crs__drill .crs__drill-foot .crs__btn--quiet" },
      { wait: 700 },
    ],
  },
  // A concept card, and one nested inside it.
  { name: "concept-card", query: TOPIC, actions: [{ wait: 600 }, { tapSelector: TERM }, { wait: 500 }] },
  {
    name: "concept-nested",
    query: TOPIC,
    actions: [{ wait: 600 }, { tap: "load-up" }, { wait: 500 }, { tapSelector: ".vtc__pop .vtc__term, .vtc__pop .vtc__chip" }, { wait: 500 }],
  },
  // The peek sheet, from a concept card.
  { name: "peek-sheet", query: TOPIC, actions: [{ wait: 600 }, { tapSelector: TERM }, { wait: 400 }, { tap: "Peek" }, { wait: 700 }] },
  // The glossary vault: filtered to equipment, one card open.
  {
    name: "vault-equipment",
    query: "&view=academy&ref=" + encodeURIComponent(JSON.stringify({ kind: "academy-glossary" })),
    actions: [{ wait: 600 }, { tap: "Equipment" }, { wait: 300 }, { tapSelector: ".crs__vcard-more" }, { wait: 500 }],
  },
  // A studio's crossed-out lines hidden: the Stop panel folds them into one quiet line.
  { name: "hide-crossed", query: MACHINE, actions: [{ wait: 600 }, { tap: "Hide crossed-out lines" }, { wait: 500 }] },
  // The MSF original, one tap away.
  { name: "original-lens", query: TOPIC, actions: [{ wait: 600 }, { tap: "MSF original" }, { wait: 500 }] },
  // Read it all: where a line takes actions.
  { name: "read-it-all", query: PLAYBOOK, actions: [{ wait: 600 }, { tap: "Read it all" }, { wait: 500 }, { tapSelector: LINE }, { wait: 400 }] },
  // The Academy: the packages conversation drill, two steps shown.
  { name: "packages-drill", query: "&view=academy", actions: [{ wait: 600 }, { tap: "Show the first" }, { wait: 300 }, { tap: "Show the next" }, { wait: 500 }] },
  // Play: two questions.
  {
    name: "quiz-two",
    query: COURSE,
    actions: [{ tap: "Quick ten" }, { wait: 800 }, { tapSelector: ".qz__opt, .qz__option, [data-qz-option]" }, { wait: 500 }],
  },
  // Head office's queue.
  { name: "queue", query: "&view=learning&viewAs=head-office", actions: [{ tap: "Waiting for head office" }, { wait: 700 }] },
];

export const quiz = { query: COURSE, actions: [{ tap: "Quick ten" }, { wait: 800 }] };
