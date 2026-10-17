# features/ask-academy — Ask the Academy

The first time Journey calls Claude. A trainer asks a question in plain words, and the answer is the Academy's own sentences, each one opening its page. The round is `docs/rounds/2026-10-16-ask-the-academy.md`, which has AJ's words and his picks (**1a 2a 3a**).

## The rule

**Claude reads, the code counts, the Academy speaks.** Corporate owns the method, so what a trainer reads as method is the Academy's words. Claude's own lines only point at those words, and a line with nothing behind it is never shown.

It reads no client record, so it can't speak about one client. It never gives a weight or a next step for a particular client. It lives in Learning, never in the Active Session.

## How an answer is made

1. **The pages** (`pages.ts`). Claude reads the same Academy a trainer can open in Learning → Academy: the content `scripts/build-academy-content.ts` builds into `src/features/academy/content/`. That is 202 pages and about 173,000 words, each with an id (`topic:…`, `overview:…`, `script:…`, `card:…`, `term:…`, `cues`). Three tidy-ups happen here and never in the content:
   - A file filed under two modules is kept once; its other ids go in `sameAs`.
   - Cards titled with an abbreviation take the Academy's name for the machine, from its script.
   - The glossary is read term by term.
2. **Picking** (`pick.ts`). Haiku 5.5 reads the question and one line per page, then names up to five pages as JSON checked against a schema. Ids are then checked against the real pages, so a made-up one is dropped.
3. **Answering** (`answer.ts`). The picked pages go in whole, as plain-text documents with citations on. `readAnswer` turns each cited line into a point: Claude's line, then the quoted sentences (`cited_text`, which the API copies from the page) and their pages. Uncited lines are dropped. `NOT_COVERED` means the pages don't answer the question. A refusal says so, with its category.
4. **Refusals.** Opus and Sonnet requests opt into the server-side fallback (`fallbacks: "default"`), so a declined question about pain is answered by another model rather than not at all. Haiku has no fallback.

`models.ts` has the model ids and list prices. `costOf` prices a request by the model that actually served it, and returns null, never zero, for a model it doesn't know.

## Files

| File | What it is |
| --- | --- |
| `pages.ts` | The Academy as one list of pages; `pageById`, `pageListText` |
| `academy-files.ts` | Every Academy JSON file, imported at once. For the server and the trial only: the Academy screen loads a module at a time and must keep doing so |
| `pick.ts` | The picking request and `readPicks` |
| `answer.ts` | The answering request and `readAnswer` |
| `models.ts` | Which model does what, the prices, `costOf` |
| `trial-questions.ts` | Phase 0's questions, each naming the pages it should come from |

Everything here is pure: no React, no Firebase, no network. The calls are made by `scripts/ask-academy-trial.ts` today, and later by the server route (phase 1).

## Traps

- **`academy/academy-machines.ts` can't be imported here.** It reaches the machine database and its photos, which neither `tsx` nor the server bundle can load. So `pages.ts` copies its two naming rules (`scriptTitle`, `cardTitle`), and `pages.test.ts` holds the copies to the originals.
- **Citations and JSON output don't mix.** A request with `output_config.format` is refused when it also has citations on. So picking asks for JSON, and answering asks for cited text.
- **Haiku 5.5 takes no server-side fallback.** `answerRequest` sends `fallbacks` only for Opus and Sonnet.

## Phases

0. **The trial**: built. It waits on AJ's API key and his 10 questions. The commands are in the round document.
1. The server route.
2. The screen.
3. Head office's list of questions the Academy can't answer, with its Firestore collection and rules.
4. AJ's walk, then the deploy.
