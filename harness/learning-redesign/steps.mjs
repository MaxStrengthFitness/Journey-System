/**
 * THE INTERACTIONS shots.mjs photographs, per design — the design agents'
 * own file to extend (shots.mjs reads it; nothing else needs touching).
 *
 * A step is { name, query, actions }:
 *   name     the PNG's name: <out>/<design>/step-<name>.png (+ -tall.png)
 *   query    what follows "?design=<design>&theme=light" in the address
 *            (main.tsx lists the parameters: &view, &machine, &ref, &role,
 *            &viewAs, ...)
 *   actions  run in order after the page has settled:
 *              { tap: "words" }          the first button / link / [role=button]
 *                                        whose aria-label or words match (exact
 *                                        first, then "includes"; the page before
 *                                        the prototype bar)
 *              { tapSelector: "css" }    the first VISIBLE element matching a CSS
 *                                        selector (a list "a, b" is fine)
 *              { type: "words", into: "css" }   types into a field (React sees it)
 *              { press: "Escape" }       a key, sent to the focused element
 *              { wait: 600 }             milliseconds
 *            A tap that finds nothing is reported and the step still shoots.
 *
 * Every shot is 820x1180 (an iPad held upright), light, plus a tall one.
 *
 * `quiz` says how each design reaches its quiz (the quiz is a route a design
 * opens, not a Learning link): shots.mjs photographs it with the pages.
 *
 * Selectors that come from the shared parts (src/features/learning-vault/):
 *   a line          [data-vta-line]            (ArticleBlocks: role=button, aria-expanded)
 *   a linked term   [data-entity], .vtc__link  (LinkedText; adjust to the real markup)
 */

const MACHINE = "&view=machine-anatomy&machine=m-leg-press";
const TOPIC = `&view=academy&ref=${encodeURIComponent(JSON.stringify({ kind: "academy-topic", id: "performance-gradual-load-up" }))}`;

const LINE = "[data-vta-line]";
const TERM = "[data-entity], [data-entity-id], .vtc__link";

/** The three interactions every design starts with; each design owns its copy below. */
const common = () => [
  { name: "line-tapped", query: MACHINE, actions: [{ tapSelector: LINE }, { wait: 400 }] },
  { name: "concept-card", query: TOPIC, actions: [{ tapSelector: TERM }, { wait: 500 }] },
  { name: "peek-sheet", query: TOPIC, actions: [{ tapSelector: TERM }, { wait: 400 }, { tap: "Peek" }, { wait: 600 }] },
];

export const steps = {
  codex: [...common()],
  vault: [...common()],
  course: [...common()],
};

/** How each design opens its quiz, from a fresh page. */
export const quiz = {
  codex: { query: "&view=learning", actions: [{ tap: "Quiz" }, { wait: 600 }] },
  vault: { query: "&view=learning", actions: [{ tap: "Quiz" }, { wait: 600 }] },
  course: { query: "&view=learning", actions: [{ tap: "Quiz" }, { wait: 600 }] },
};

export default steps;
