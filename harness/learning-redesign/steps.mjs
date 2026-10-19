/**
 * THE INTERACTIONS shots.mjs photographs, per design.
 *
 * Each design keeps its own steps in steps-<design>.mjs (codex, vault,
 * course), so three design agents never edit one file. This file only
 * gathers them, with three shared starting steps for a design that has not
 * written its own file yet.
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
 * A design file exports `steps` (an array) and `quiz` ({ query, actions }:
 * how that design opens its quiz from a fresh page).
 *
 * Selectors from the shared parts (src/features/learning-vault/):
 *   a line          [data-vta-line]                  (ArticleBlocks)
 *   a linked term   [data-vault-term], .vtc__term    (LinkedText)
 */

export const MACHINE = "&view=machine-anatomy&machine=m-leg-press";
export const TOPIC = `&view=academy&ref=${encodeURIComponent(JSON.stringify({ kind: "academy-topic", id: "performance-gradual-load-up" }))}`;
export const LINE = "[data-vta-line]";
export const TERM = "[data-vault-term], .vtc__term";

/** The three interactions every design starts with. */
export const common = () => [
  { name: "line-tapped", query: MACHINE, actions: [{ tapSelector: LINE }, { wait: 400 }] },
  { name: "concept-card", query: TOPIC, actions: [{ tapSelector: TERM }, { wait: 500 }] },
  { name: "peek-sheet", query: TOPIC, actions: [{ tapSelector: TERM }, { wait: 400 }, { tap: "Peek" }, { wait: 600 }] },
];

const defaultQuiz = { query: "&view=learning", actions: [{ tap: "Quiz" }, { wait: 600 }] };

async function load(design) {
  try {
    const mod = await import(`./steps-${design}.mjs`);
    return { steps: mod.steps ?? common(), quiz: mod.quiz ?? defaultQuiz };
  } catch (e) {
    if (e && (e.code === "ERR_MODULE_NOT_FOUND" || /Cannot find module/.test(String(e.message)))) {
      return { steps: common(), quiz: defaultQuiz };
    }
    throw e;
  }
}

const loaded = {
  codex: await load("codex"),
  vault: await load("vault"),
  course: await load("course"),
};

export const steps = {
  codex: loaded.codex.steps,
  vault: loaded.vault.steps,
  course: loaded.course.steps,
};

export const quiz = {
  codex: loaded.codex.quiz,
  vault: loaded.vault.quiz,
  course: loaded.course.quiz,
};

export default steps;
