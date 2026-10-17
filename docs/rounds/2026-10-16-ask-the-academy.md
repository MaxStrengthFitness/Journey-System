# Ask the Academy (Oct 16 2026)

The first time Journey calls Claude. A trainer asks a question in plain words, and the answer is the Academy's own sentences, each one opening its page.

## The brief, in AJ's words

AJ noticed the Claude Console gives $200 of API credits a month and asked what they could do for Journey. Then, on Oct 16 2026:

> "I think we can somehow use the API to have a more intelligent catalog for our academy information. Something that we can almost go to and ask questions to. And it will almost be like a helper ... given what we have in our academy given that we train clients that have lots of uh orthopedic issues and other health concerns. And a huge age demographic. I think in the combination of having a very intelligent academy a large client base and a vast amount of data being collected about those clients I think we can use this API to not only make a good catalog but to also have a good analytic tracking of trends across the app."

Two plan pages followed, both private artifacts:

- **Claude in Journey** (`claude.ai/artifact/9ZdmuY7mQMpQdHRLoGBphv`) sets one rule for every use: *Claude reads, the code counts, the Academy speaks*. Under that rule it lists four uses: Ask the Academy, note filing, Health words mapped to the Academy's watch-outs, and trends for head office. AJ answered **"1a 2b 2a"**:
  - **1a** means Ask the Academy comes first.
  - Question 2 asked which account holds a key that reads client words. It got two answers (2b, his personal account; 2a, an account Max Strength owns) and is **still open**. Ask the Academy sends no client words, so it doesn't matter here. Ask again before note filing.
  - Question 3, how the To-file tray would show a suggestion, was not answered. It belongs to note filing.
- **Ask the Academy** (`claude.ai/artifact/HgjTKNWP9Vz5iqYHeCD51u`) is the plan below. AJ answered **"1a 2a 3a"**.

## What the picks mean

- **1a: what an answer looks like.** The Academy's sentences, each with its page, and a short line of Claude's above each. The sentences come back through the API's citations feature, which copies them from the page rather than having the model retype them. A line of Claude's with no Academy sentence behind it is not shown. Corporate owns the method, so what a trainer reads as method is the Academy's words, and Claude's lines only point at them.
- **2a: where a trainer asks.** In Learning's one search (`LearningSearch`, the decision in `src/features/learning/README.md`). A question gets "Ask the Academy" as its first row, on every Learning page. There is no second search box.
- **3a: questions the Academy can't answer.** They are kept for administrators on Admins → Standard: the question, the studio and the day, not who asked. This needs a new Firestore collection, and **3a is AJ's OK for that structure change**. It still needs its rules, the rules tests and a rules deploy.

## The design

1. **The pages.** Claude reads the same Academy a trainer can open in Learning → Academy. That is the content `scripts/build-academy-content.ts` builds from `docs/msf-academy`: 98 topics in 13 modules, 19 machine overviews, 20 scripts, 18 quick-reference cards, the cue moments and 52 glossary terms, about 180,000 words. `src/features/ask-academy/pages.ts` turns them into one list of pages. Where the same file sits under two modules, it is kept once.
2. **Picking.** Haiku 5.5 gets the question and the list of page titles. It returns up to five page ids, as JSON checked against a schema.
3. **Answering.** The chosen pages are sent whole, as plain-text documents with citations on. The answer is read into points: Claude's line, then the quoted sentences and their pages. Uncited lines are dropped. If the pages don't answer the question, the reply is exactly `NOT_COVERED`.
4. **Refusals.** There is no fallback model (Oct 17 2026). The API can pass a declined request to another model (`fallbacks: "default"`). Phase 0 shipped with that on, then it was taken out, because it would put an answer from a model AJ didn't choose in front of a trainer. Until AJ decides, a declined question comes back as "refused" with its category, and the trial counts how often that happens.

**Rules it keeps:**
- It reads no client record, so it can't speak about one client.
- It never gives a weight or a next step for a particular client.
- It lives in Learning, never in the Active Session.
- Nothing pings anyone.
- The key lives only on the server.
- A staff sign-in and a per-person limit come first, as with the chart reader (`server/gemini-routes.ts`).

**Cost, at list prices (Oct 2026):** about 9¢ a question on Opus 5.5, 5¢ on Sonnet 5.5, and a fraction of a cent to pick the pages. A monthly spend limit in the Console keeps it inside the $200 of credits.

## Phases

One commit per phase, each typechecked on its own.

0. **The trial.** No change to the app. The pure logic is in `src/features/ask-academy/`, and `scripts/ask-academy-trial.ts` asks the trial questions. Each question is picked once, then answered by both Opus 5.5 and Sonnet 5.5. AJ reads the pairs blind.
   - **The gate:** if a model writes fewer than 9 in 10 answers AJ would let a new trainer read, we fix the pages it picks or stop. AJ chooses the model.
   - **One change from the plan page:** the Academy's "Random Notes and FAQs" page is mostly prose and holds only a handful of real questions. So the 20 trial questions are written across the Academy instead, each naming the page or pages it should come from. That also measures whether Claude finds the right page. One of the 20 is a control that should come back "not covered". **AJ adds 10 questions of his own.**
1. **The server route:** pick, answer, drop unbacked lines, staff sign-in, the per-person limit.
2. **The screen:** the Ask row in Learning's search and the answer page. The typed question registers as unsaved typing, every target is at least 40px, a render test mounts it, and the phone layout works.
3. **Head office's list (3a):** the collection, its rules and rules tests, and Admins → Standard.
4. **AJ walks it** on the iPad in Demo Mode. Then on Render: the key goes in the web service's Environment, the rules deploy first, then Manual Deploy on the web service. The cron jobs don't change.

## Running the trial (phase 0)

Steps for the PC, in PowerShell from the project folder:

1. Make a key at platform.claude.com → **API keys** → **Create key**. Name it "Journey Academy trial" and copy it.
2. Open `.env` in Notepad and add a line `ANTHROPIC_API_KEY=` followed by the key. Save. `.env` stays out of git, and Vite never sends a variable without the `VITE_` prefix to the browser.
3. In the Console, go to **Settings → Limits** and set a monthly spend limit of $200.
4. `npx tsx scripts/ask-academy-trial.ts` is a dry run: it calls nothing and prints what the run would send and roughly what it would cost.
5. `npx tsx scripts/ask-academy-trial.ts --run` asks the questions and writes the results to `harness/ask-academy-trial/` (ignored by git). The trial costs under $5.

## Status

- **Oct 16 2026:** AJ's picks recorded. Phase 0 is committed on `oct16/ask-the-academy`, over `oct16/live-review` `50c56d4d`.
  - **SDK:** `@anthropic-ai/sdk` 0.131.0, the newest release at least two weeks old.
  - **Dry run:** 202 pages and 173,079 words, with 5 duplicate pages folded in. The page list Haiku picks from is about 3,800 tokens. Twenty questions would cost about $2.64.
  - **Typecheck:** 2, the baseline.
  - **Tests:** 14,720 of 14,721 in 897 files; this round adds 34 in 5. The one failure is `WorkoutTrackerView.render.test.tsx`, "a colleague's: the server is asked first…". It fails the same way on `50c56d4d` without this round, so it was there before. It may depend on the time of day: it failed at about 10:30 PM Eastern.
- **Waiting on AJ:** the API key, and his 10 questions.
