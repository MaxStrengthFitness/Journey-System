# Design 3 — The Interactive Course & Field Manual

One of three playable prototypes of Learning (the Learning vault redesign, Oct 19 2026). Picked on the prototype bar as **3 Course**. It draws the same shared pages, markup, quiz and playbooks as the other two (`src/features/learning-vault/`); what it changes is how they are laid out and what you *do* with them.

## The idea

Learning that teaches by doing. A long Academy module becomes short cards you step through; the repetition is something you scrub; a cue is a drill you answer out loud before you reveal the Academy's lines; the glossary is a vault you browse; a machine is a field manual, its dials pinned like callouts on a blueprint. Nothing is scored, stored or ranked anywhere: a course shows where you are, never how far you got.

## The screens

| Where | What it is |
| --- | --- |
| **Overview** (`HomePage.tsx`) | *Start here*: Life Transformer 101 as the featured course, its first three lessons showing, Start the course. The other six courses as little decks of cards (title, who it is for, how many lessons, where it starts), one neutral band each. **Play a round** (Quick ten, or a deck) beside **What would you cue?**, the drill of the day (a moment chosen from the studio's date, nothing stored, never the moment the scrubber below opens on; Another moment, which arrives closed). **The repetition** scrubber with the shape switch. **Field manual**: the floor's machines in walking order, *Out of service* and *Flagged* on a tile that has them. **Glossary vault**: three words of the day. Head office's queue door, for head office only. |
| **Catalog** (`IndexPages.tsx`, `CatalogPage`) | The studio's floor first, as a walk: numbered stops joined by a line, each with the floor's status as today's Catalog row says it (*Out of service* and *Flagged*, and why it is out), how the set begins (load-up or handoff) and *Never to failure* where it applies. Then every other MSF machine. |
| **Academy** (`AcademyPage`) | *Practice*: What would you cue?, Play a round, Glossary vault, and the packages conversation as a reveal-one-step-at-a-time drill (a draft). *The method*: the 13 modules as courses. *Life Transformer playbooks* by pillar, said once to be drafts. |
| **A course** (`CoursePage`) | A track's lessons, or a module's topics, as numbered rows with their why; Start with lesson 1. |
| **A lesson** (`LessonPage.tsx`) | A topic, playbook, deep dive or spoken script as **step cards**: one card at a time, Back / Next (and a sideways swipe, and the arrow keys), dots for where you are. The last card offers **Check yourself** (up to three of the quiz's questions whose source is this page) and **Next lesson**. A lesson opened from a course, or any topic (its module is its course), carries a course bar (the course's name, *Lesson 3 of 10 · 4 min*; no arrows of its own); on a wide screen the course's whole list sits beside it, the read time on the lesson on screen. **Read it all** is the same page whole through `ArticleBlocks`, where a line is crossed out, noted, told to head office or asked about in Teams; it ends on **Next lesson** too. |
| **Field manual** (`MachinePage.tsx`) | The floor's status at the top (*Out of service* or *Flagged by Jess*, who, when, why, where it changes: `FloorStatus`'s banner, as today's machine page says it). The blueprint (the body it works; the unit's dials as pins with this unit's number or *Not set*, the dial's letter where the unit records one; a pin whose dial a set-up line names is a raised button that goes to that line, the rest are quiet wells; what it works and the facts beside them), **Stop** (never folded, plum, a label said once over its run), **the set-up** as one list (Set up, Get set, Begin, each under its own title), with **Step through** for the same lines as step cards, **the repetition** in this machine's shape with no lines to say, **At each moment** (this machine's cue moments, the Academy's lines showing), and **The full manual**, one tier at a time (Floor glance · Script & cues · Adapt & clinical · Deep science), opening on Adapt & clinical, its substitutes under *If LEG PRESS can't be used*, one line a set, each machine a chip that peeks it. A machine that is a course's lesson ends on **Next lesson**. A studio's own machine gets no rep shape and no "begins with"; on a floor that can't be read it says so. |
| **What would you cue?** (`DrillPages.tsx`, `CueingPage`) | Every moment of a set as a drill, the lines behind a tap; Read it all is the phrasebook. |
| **Glossary vault** (`GlossaryPage`) | Cards, two across in portrait and three in landscape (one on a phone); All · Method · Equipment; a search field; an A–Z of 44px letters that sticks while you browse (not on a phone: the search does it); More opens the definition (its words linked, never the word itself) and *Where it's taught* (rows that peek the topic). With every word showing it is grouped by letter; a filter or a search is one grid, the letters jumping to each letter's first card. |
| Quiz, queue, quick card, a clinical flag (`OtherPages.tsx`) | `QuizMode`, `SubmissionQueue`, a card read whole, and a flag's connections. |
| The peek (`PeekBody`) | Any page, compact, in the shared `PeekSheet`; a cue moment or a glossary word peeks as itself alone, its name said once, in the sheet's header (Open full page is the rest); a clinical flag as what it connects to, headed by the flag's name, its machines in their categories' colours; a machine with the floor's status first. A quiz or a course is never peeked: it opens in the trail. A wait that will not end says so, with Try again. |

Studio markup reads the same everywhere: the step cards, the drills and the vault cards lay this studio's marks on with `useAppliedMarkup` (a crossed-out line struck, what the studio does instead, why, who and when; a note under its line; hidden lines folded into one quiet line), and `ArticleBlocks` does the acting. `VersionToggle` sits in the sticky row on an iPad and in the page on a phone.

## What it borrows, and why

- **Brilliant**: a lesson as short cards with one idea each, a big Next under the thumb, and a check at the end that explains instead of scoring.
- **Inkling** (interactive textbooks, blueprints): the field manual's grid-paper panel and the figure with its parts called out.
- **LegendKeeper** pins: each dial a numbered pin you can tap to jump to the line that sets it.
- **Trainual**: courses as ordered reading lists for a role, with the lesson list always in reach.
- Language-app drills: say it first, then reveal (active recall, without a streak).

## Files

| File | What it holds |
| --- | --- |
| `CourseLearning.tsx` | The root: data once, the trail (`useVaultNav`), the peek, the one `ConceptLayer`, section and jump handling, the route switch |
| `shell.tsx` | The context, `CourseShell` (WikiShell + PeekFrame + PeekSheet), the page head, `MarkedLine`, Read next, loading / failed / moved |
| `StepDeck.tsx`, `CheckYourself.tsx`, `CueDrill.tsx` | The deck, the end-of-lesson check, the drill cards |
| `HomePage.tsx`, `IndexPages.tsx`, `LessonPage.tsx`, `MachinePage.tsx`, `DrillPages.tsx`, `OtherPages.tsx` | The screens |
| `steps.ts` | Step cards: a page cut into cards of about 80–160 words, whole lines only, never ending on a heading (tested) |
| `drills.ts` | Cue drills, the order drill, the day's pick, the course around a lesson, Check yourself's questions (tested) |
| `vault.ts` | The glossary as cards, filters, letters (tested) |
| `course.css` | The design's one stylesheet (`crs__`, `--wk-*` tokens only) |

Tests: `steps.test.ts`, `drills.test.ts`, `vault.test.ts`, and `CourseLearning.render.test.tsx` (the design mounted on the real Academy corpus and graph: Overview → field manual → a lesson's cards → Read it all → back; a jump; the vault; the drills; and the review fixes: the stacked deck and its focus, labels once, the manual's first tier, the substitute chips, a studio's own machine, a floor or chunk that will not come, the mode switch's question, the peek's contents; and the judges' last fixes: the floor's status, the set-up list and Step through, the open moments, one-way substitutes, Next lesson from a machine, Another moment closed, a flag's title, no file path as a source).

## Decisions and their reasons

- **Jumps, section changes and the reset start a fresh trail without asking twice.** The app asked before any of them reached the design (AppContent's guarded screen, LearningView's doors), so the trail is replaced with `useVaultNav`'s `set` (which does not ask) and the peek lets go. `resetSignal` is the Learning title on the Overview, or the section already on: back to the section's root. In-design moves go through `useVaultNav` and ask.
- **Stop is never a card.** The lines a trainer must not miss stay open on the field manual; only Set up, Get set and Begin become the set-up list (or, on Step through, the deck).
- **The full manual shows one tier at a time.** `ArticleBlocks` draws only the tier picked, with `showOrphans={false}`, so a mark on another tier is never called "changed"; the page's own lines that changed are listed once under it (`OrphanMarks`, from `useAppliedMarkup` over the whole page). A tier switch asks the page first (`useWikiPageGuard`), since it takes the tier on screen away with any form open in it.
- **Drill of the day, vault words of the day**: picked from the studio's date (`studioTodayKey`), so nothing is stored and every iPad agrees.
- **Check yourself** asks only choice and true/false questions (an order question needs a card of its own), dealt with a seed made from the page, so a page asks the same way each visit. The answers not picked are quieted in ink-2, never faded under 4.5:1.

### The judges' last fixes (Oct 19 2026, before the morning)

- **The floor's status comes back.** `FloorStatus` (shared) on every floor row (the Catalog's stops, the Overview's tiles, the other MSF machines when a flag is on one) and at the top of every machine page and machine peek, from `data.care`; nothing while the status is unknown.
- **The field manual is for the floor first.** The set-up is one list a trainer scans at the machine, **Step through** keeps the cards for learning it; a dial's pin goes to the line that sets it (`lineNaming`, the same match as `cardNaming`) and marks it. A machine's moments show their lines without a tap; the phrasebook and the drill of the day keep the tap, because saying it first is the drill.
- **Substitutes say one thing:** *If LEG PRESS can't be used*, one line a set, no "Together:" (the shared `substituteSection`); never which machines this one helps replace.
- **A course never dead-ends.** A machine, the glossary vault or the phrasebook that is a course's lesson ends on **Next lesson** (`CourseNext`); the quiz always ends its course, so it has none.
- **Another moment arrives closed**, its reveal holding the focus the pressed button had (`focusReveal`).
- **Say it once in the peek**: a word or a moment is named by the sheet's header only. A clinical flag's peek and crumb take the flag's name (`courseTitleOf`), never "Map"; its machines take their categories' colours (`categoryNodeStyle`). The concept card's own button says "Open" (`ConceptLayer`'s `openLabel`, shared by all three designs: the Course draws no map, so it never says "Show on the map").
- **No repository path as a source**: `sourceLine` says a topic's calm label ("Academy 4.6 Turnaround Technique") or nothing.

### The review fixes (Oct 19 2026)

- **Next never moves inside a lesson.** `StepDeck` draws every content card stacked in one grid cell, only the one on turn seen (the rest hidden and `inert`), so the stage is the tallest card's height; the end card (Check yourself) is drawn alone in its turn. The deck's sticky bar takes back the scroller's bottom padding too (1.5rem, 2rem from 1024px), so no card words show under it. A turn that takes the pressed button away hands the focus to the deck; a reveal hands it to the lines.
- **Say it once.** The full manual opens on Adapt & clinical (Floor glance is the Stop panel and the deck above; Script & cues holds the drills' answers). The field manual's scrubber draws no "What to say" (the drills ask it). A label is drawn once over the lines that share it (`runLabels`, line-actions' `labelRuns`). The deck has no "Set it up" over "Set up". The substitutes are said once, in the manual, each machine a chip that peeks it, not five cards under Read next. The playbook's draft line is said once on its lesson. "Nothing is kept" is the quiz's own picker's to say.
- **Colour keeps its one meaning.** A course is not a machine category: one neutral band. The Play fan and the vault's *Equipment* tag are neutral. A spoken line's bubble and what a machine works take the page's accent (the machine's category; neutral grey elsewhere), never the act-blue. On the blueprint, blue is exactly the dial pins that can be tapped.
- **A form is never lost.** Cards / Read it all (and Vault, Drills) asks the page first, as the manual's tier switch does: Read it all is where the forms live.
- **Every peek is a page.** `CourseLearning` decides once: a page or a clinical flag peeks, anything else (the quiz, a course) opens in the trail.
- **A phone shows content sooner**: the dials before a smaller figure, no A–Z rail, no second pair of arrows over a lesson.
- **Drills and vault cards are as tall as their own words**: opening one never stretches its row partner; revealed one-word cues flow side by side.

## Shared changes this design asked for (made in the integration pass, Oct 19 2026)

1. `ArticleBlocks showOrphans`: the field manual draws one tier with it off and lists the page's orphans once. The generated `<style>` rule that hid three tiers is gone.
2. `useVaultNav`'s `set(stack)`: jumps, section changes and the reset replace the trail without asking twice. The trail is no longer remounted.
3. The mode switch and the glossary vault's filters: the picked segment takes the 3:1 control edge (`--wk-border-strong`), as the app-wide edge guard asks.

## What I would do next

- Let a trainer mark a line straight from a step card (today: Read it all), by drawing each card through `ArticleBlocks` with `showOrphans={false}`.
- A per-lesson "Say it" card for topics that have cue moments, so a lesson ends with a drill as well as a check.
