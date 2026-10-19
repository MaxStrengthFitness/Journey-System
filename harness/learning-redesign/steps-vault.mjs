/**
 * Design 2, the Living Vault & Rumor Map: the interactions shots.mjs
 * photographs (see steps.mjs for the format).
 */

// Not imported from steps.mjs: it imports this file while it is still being
// evaluated (top-level await), and the cycle would never settle.
const MACHINE = "&view=machine-anatomy&machine=m-leg-press";
const TOPIC = `&view=academy&ref=${encodeURIComponent(JSON.stringify({ kind: "academy-topic", id: "performance-gradual-load-up" }))}`;
const LINE = "[data-vta-line]";
const TERM = "[data-vault-term], .vtc__term";

const HOME = "&view=learning";

export const steps = [
  // The signature: tap a star on the Rumor Map, its neighbours light.
  {
    name: "map-focus",
    query: HOME,
    actions: [{ tapSelector: ".vm__start .vm__pill" }, { wait: 900 }],
  },
  // Wander: a link in the card moves the focus there.
  {
    name: "map-wander",
    query: HOME,
    actions: [{ tapSelector: ".vm__start .vm__pill" }, { wait: 700 }, { tapSelector: ".vm__focus .vm__pill" }, { wait: 900 }],
  },
  // The same map as a list (never the only way in).
  {
    name: "map-list",
    query: HOME,
    actions: [{ tap: "List" }, { wait: 500 }],
  },
  // The foot of the Leg Press page: read alongside, and what links here.
  { name: "machine-linked", query: MACHINE, actions: [{ tapSelector: ".vm__backlinks .vm__h3" }, { wait: 300 }] },
  // A line on the Leg Press page, its actions in place.
  { name: "line-tapped", query: MACHINE, actions: [{ tapSelector: LINE }, { wait: 400 }] },
  // A concept card, and a nested one inside it.
  {
    name: "concept-card",
    query: TOPIC,
    actions: [{ tapSelector: TERM }, { wait: 500 }],
  },
  {
    name: "concept-nested",
    query: TOPIC,
    actions: [{ tap: "mechanical tension" }, { wait: 500 }, { tapSelector: ".vtc__pop .vtc__term, .vtc__pop .vtc__chip" }, { wait: 500 }],
  },
  // The peek sheet: a page under the thumb, this one kept.
  {
    name: "peek-sheet",
    query: TOPIC,
    actions: [{ tapSelector: TERM }, { wait: 400 }, { tap: "Peek" }, { wait: 700 }],
  },
  // The MSF original, one tap away.
  { name: "original", query: MACHINE, actions: [{ tap: "MSF original" }, { wait: 400 }] },
  // Two quiz questions.
  {
    name: "quiz-two",
    query: HOME,
    actions: [
      { tap: "Quick ten" },
      { wait: 700 },
      { tapSelector: ".qz__option, .qz__opt, [data-option]" },
      { wait: 500 },
      { tap: "Next question" },
      { wait: 600 },
      { tapSelector: ".qz__option, .qz__opt, [data-option]" },
      { wait: 500 },
    ],
  },
  // A reading path, as a line of stops.
  { name: "track", query: HOME, actions: [{ tap: "Life Transformer 101" }, { wait: 500 }] },
  // An Academy module, and a playbook (a draft, said once).
  { name: "module", query: "&view=academy", actions: [{ tap: "Exercise Performance" }, { wait: 500 }] },
  { name: "playbook", query: "&view=academy", actions: [{ tapSelector: ".vm__pillar .vm__row" }, { wait: 600 }] },
  // The quiz's "Read it" peeks the source, the round kept underneath.
  {
    name: "quiz-read-it",
    query: HOME,
    actions: [
      { tap: "Quick ten" },
      { wait: 700 },
      { tapSelector: ".qz__option, .qz__opt, [data-option]" },
      { wait: 500 },
      { tap: "Read it" },
      { wait: 700 },
    ],
  },
  // Head office's list.
  { name: "queue", query: `${HOME}&viewAs=head-office`, actions: [{ tap: "Open the list" }, { wait: 600 }] },
  // The Catalog's map lens: the floor's machines, their clinical flags and cue moments.
  { name: "catalog-map", query: "&view=machine-anatomy", actions: [{ tap: "Map" }, { wait: 700 }] },
  // The Academy's map lens.
  { name: "academy-map", query: "&view=academy", actions: [{ tap: "Map" }, { wait: 700 }] },
  // A page's own constellation leads to the whole map, focused there.
  { name: "orbit-to-map", query: MACHINE, actions: [{ tapSelector: ".vm__mini-centre" }, { wait: 900 }] },
];

export const quiz = { query: HOME, actions: [{ tap: "Every deck" }, { wait: 700 }] };
