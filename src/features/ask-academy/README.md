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
3. **Answering** (`answer.ts`). The picked pages go in whole, as plain-text documents with citations on. `readAnswer` turns each cited line into a point: Claude's line, then the quoted sentences (`cited_text`, which the API copies from the page) and their pages. Uncited lines are dropped. `NOT_COVERED` means the pages don't answer the question; `CONFLICTING` means they disagree, and head office decides (AJ: loyal to what we teach, never "willy-nilly").
   - **A health question** (an injury, surgery, pain or a condition; the pick says so) is also sent the Academy's line on surgery and medical clearance (`CLEARANCE_PAGE_ID`, the TSC page), and the point quoting a clearance line is read out first (AJ, Oct 18 2026: "we always need to have the Academy's medical clearance line on any pages that need it").
   - **Not the method:** the Journey app, Mindbody, prices, marketing and machine repair come back not covered.
4. **Refusals.** There is no fallback model (Oct 17 2026). The API can pass a declined request to another model, but that would put an answer from a model AJ didn't choose in front of a trainer, so it is his call. Until he decides, a declined question comes back as `refused` with its category, and the trial counts how often that happens.

`ask.ts` is one question start to end (`askAcademy`, or its halves `pickPages` and `answerFrom`), with the SDK client handed in. **Sonnet 5.5 answers** (`ANSWER_MODEL`): AJ's pick from the blind trial on Oct 18 2026.

`models.ts` has the model ids and list prices. `costOf` prices a request by the model that actually served it, and returns null, never zero, for a model it doesn't know.

## Files

| File | What it is |
| --- | --- |
| `pages.ts` | The Academy as one list of pages; `pageById`, `pageListText` |
| `academy-files.ts` | Every Academy JSON file, imported at once. For the server and the trial only: the Academy screen loads a module at a time and must keep doing so |
| `pick.ts` | The picking request and `readPicks` |
| `answer.ts` | The answering request and `readAnswer` |
| `ask.ts` | One question start to end, for the server: `askAcademy`, `pickPages`, `answerFrom`, the `AskResult` a trainer is shown |
| `models.ts` | Which model does what (`ANSWER_MODEL` is Sonnet 5.5), the prices, `costOf` |
| `client.ts` | The app's signed-in call to the route; one flat reply (`result` or `error`) |
| `AskAnswer.tsx` + `ask.css` | The Ask row and the answer page (phase 2), on Learning's tokens |
| `learning-ref.ts` | Which Learning page a quote opens |
| `find-quote.ts` | Finding a quote on its page by its first words, for the highlight |
| `repeats-quote.ts` | Leaving out Claude's line when it only repeats its quote |
| `AskAnswer.render.test.tsx` | The screen mounted: the row, waiting, an answer, clearance first, not covered, disagreeing pages, a failure and Try again |
| `head-office.ts` | Head office's list (phase 3): the entry a trainer's ask adds (never who), the send, the admin reads and marks, `groupQuestions` |
| `academy-routes.test.ts` | The server route on a bare Express app: sign-in, length, no key, one at a time, a failure |
| `trial-questions.ts` | Phase 0's questions: Claude's 20 and AJ's 37 (his ten reasons), each naming the pages it should come from |

On the server: `server/academy-routes.ts` is `POST /api/academy/ask` (the staff sign-in, one question at a time and 20 in 15 minutes per person, a 4 KB body, a question of 3 to 300 characters; the question is never logged), and `server/academy.ts` makes the client from `ANTHROPIC_API_KEY` and builds the pages on the first question. With no key, the route answers "Ask the Academy isn't switched on yet."

Everything here is pure: no React, no Firebase, no network of its own. The calls are made by the server route and by `scripts/ask-academy-trial.ts`.

## Traps

- **`academy/academy-machines.ts` can't be imported here.** It reaches the machine database and its photos, which neither `tsx` nor the server bundle can load. So `pages.ts` copies its two naming rules (`scriptTitle`, `cardTitle`), and `pages.test.ts` holds the copies to the originals.
- **Citations and JSON output don't mix.** A request with `output_config.format` is refused when it also has citations on. So picking asks for JSON, and answering asks for cited text.

## Phases

0. **The trial**: passed on Oct 18 2026; AJ picked Sonnet 5.5. The commands are in the round document.
1. **The server route**: built (Oct 18 2026).
2. **The screen**: built (Oct 18 2026; AJ "1a 2a 3a"). The Ask row is first in Learning's one search once two words are typed (WikiSearch's `lead`) and asks only when tapped. The answer page replaces the results; Back keeps the question typed. A quote's page opens scrolled to the quote, highlighted (LearningView looks for it for up to 5 seconds as the page draws). A health answer's clearance point comes first, in Learning's plum. Claude's line is left out when it only repeats its quote (most of Sonnet's did, in the trial). "This answer is wrong" (3a) comes with phase 3.
3. **Head office's list**: built (Oct 19 2026; AJ "1a 2a 3a" on the plan page `claude.ai/artifact/RE7jpibaWtvg3kKb9T9vYH`). A question the Academy can't answer, or whose pages disagree, goes to `academy_questions` on its own ("Sent to head office's list."); "This answer is wrong" under every answer asks why in a box that may stay empty; Demo Mode's practice never reaches it. One document per ask: the question, why it's there, the studio and the studio's day, and for a flagged answer the reason, the answer as text and who sent it (AJ, Oct 19 2026: names on flagged answers only; the box says so first). An unanswered question carries no uid and no name; the rules hold the shape (`academy_questions` in `firestore.rules`, the note in `docs/ops/RULES-NOTES.md#academy-questions-id`). Head office's page is Admins → Standard → Academy questions (`admins/AcademyQuestionsPage.tsx`): the same question asked again is one row, marked Needs an Academy page, Studio's call or Done; the sidebar counts the unmarked and Home has a line. Both reads are on the (mark, at) index.
4. AJ's walk, then the deploy.
