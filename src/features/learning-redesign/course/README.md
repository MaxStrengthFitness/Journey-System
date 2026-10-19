# Design 3 — The Interactive Course & Field Manual

One of three playable prototypes of Learning (the Learning vault redesign, Oct 19 2026). Picked on the prototype bar as **3 Course**. It draws the same shared pages, markup, quiz and playbooks as the other two (`src/features/learning-vault/`); what it changes is how they are laid out and what you *do* with them.

## The idea

Learning that teaches by doing. A long Academy module becomes short cards you step through; the repetition is something you scrub; a cue is a drill you answer out loud before you reveal the Academy's lines; the glossary is a vault you browse; a machine is a field manual, its dials pinned like callouts on a blueprint. Nothing is scored, stored or ranked anywhere: a course shows where you are, never how far you got.

## The screens

| Where | What it is |
| --- | --- |
| **Overview** (`HomePage.tsx`) | *Start here*: Life Transformer 101 as the featured course, its first three lessons showing, Start the course. The other six courses as little decks of cards (title, who it is for, how many lessons, where it starts). **Play a round** (Quick ten, or a deck) beside **What would you cue?**, the drill of the day (a moment chosen from the studio's date, nothing stored; Another moment). **The repetition** scrubber with the shape switch. **Field manual**: the floor's machines in walking order. **Glossary vault**: three words of the day. Head office's queue door, for head office only. |
| **Catalog** (`IndexPages.tsx`, `CatalogPage`) | The studio's floor first, as a walk: numbered stops joined by a line, each with how the set begins (load-up or handoff) and *Never to failure* where it applies. Then every other MSF machine. |
| **Academy** (`AcademyPage`) | *Practice*: What would you cue?, Play a round, Glossary vault, and the packages conversation as a reveal-one-step-at-a-time drill (a draft). *The method*: the 13 modules as courses. *Life Transformer playbooks* by pillar, said once to be drafts. |
| **A course** (`CoursePage`) | A track's lessons, or a module's topics, as numbered rows with their why; Start with lesson 1. |
| **A lesson** (`LessonPage.tsx`) | A topic, playbook, deep dive or spoken script as **step cards**: one card at a time, Back / Next (and a sideways swipe, and the arrow keys), dots for where you are. The last card offers **Check yourself** (up to three of the quiz's questions whose source is this page) and **Next lesson**. A lesson opened from a course, or any topic (its module is its course), carries a course bar (Lesson 3 of 10, the lessons either side); on a wide screen the course's whole list sits beside it. **Read it all** is the same page whole through `ArticleBlocks`, where a line is crossed out, noted, told to head office or asked about in Teams. |
| **Field manual** (`MachinePage.tsx`) | The blueprint (the body it works; the unit's dials as numbered pins with this unit's number or *Not set*; a pin whose dial a set-up line names turns the deck to that card), **Stop** (never folded, plum), **Set it up** as step cards, **the repetition** in this machine's shape, **At each moment** (this machine's cue moments as drills), and **The full manual**, one tier at a time (Floor glance · Script & cues · Adapt & clinical · Deep science). |
| **What would you cue?** (`DrillPages.tsx`, `CueingPage`) | Every moment of a set as a drill; Read it all is the phrasebook. |
| **Glossary vault** (`GlossaryPage`) | Cards, two across in portrait and three in landscape (one on a phone); All · Method · Equipment; a search field; an A–Z of 44px letters that sticks while you browse; More opens the definition (its words linked) and *Where it's taught* (rows that peek the topic). |
| Quiz, queue, quick card, a clinical flag (`OtherPages.tsx`) | `QuizMode`, `SubmissionQueue`, a card read whole, and a flag's connections. |
| The peek (`PeekBody`) | Any page, compact, in the shared `PeekSheet`; a cue moment or a glossary word peeks with itself first. |

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

Tests: `steps.test.ts`, `drills.test.ts`, `vault.test.ts`, and `CourseLearning.render.test.tsx` (the design mounted on the real Academy corpus: Overview → field manual → a lesson's cards → Read it all → back; a jump; the vault; the drills).

## Decisions and their reasons

- **Jumps, section changes and the reset start a fresh trail without asking twice.** The app asked before any of them reached the design (AppContent's guarded screen, LearningView's doors), so the trail is replaced with `useVaultNav`'s `set` (which does not ask) and the peek lets go. `resetSignal` is the Learning title on the Overview, or the section already on: back to the section's root. In-design moves go through `useVaultNav` and ask.
- **Stop is never a card.** The lines a trainer must not miss stay open on the field manual; only Set up, Get set and Begin become the set-up deck.
- **The full manual shows one tier at a time.** `ArticleBlocks` draws only the tier picked, with `showOrphans={false}`, so a mark on another tier is never called "changed"; the page's own lines that changed are listed once under it (`OrphanMarks`, from `useAppliedMarkup` over the whole page). A tier switch asks the page first (`useWikiPageGuard`), since it takes the tier on screen away with any form open in it.
- **Drill of the day, vault words of the day**: picked from the studio's date (`studioTodayKey`), so nothing is stored and every iPad agrees.
- **Check yourself** asks only choice and true/false questions (an order question needs a card of its own), dealt with a seed made from the page, so a page asks the same way each visit.

## Shared changes this design asked for (made in the integration pass, Oct 19 2026)

1. `ArticleBlocks showOrphans`: the field manual draws one tier with it off and lists the page's orphans once. The generated `<style>` rule that hid three tiers is gone.
2. `useVaultNav`'s `set(stack)`: jumps, section changes and the reset replace the trail without asking twice. The trail is no longer remounted.
3. The mode switch and the glossary vault's filters: the picked segment takes the 3:1 control edge (`--wk-border-strong`), as the app-wide edge guard asks.

## What I would do next

- Let a trainer mark a line straight from a step card (today: Read it all), by drawing each card through `ArticleBlocks` with `showOrphans={false}`.
- A per-lesson "Say it" card for topics that have cue moments, so a lesson ends with a drill as well as a check.
- Course cards that show the course's pillar colour on its lessons too, so a lesson in *Relationships and renewals* reads as one at a glance.
