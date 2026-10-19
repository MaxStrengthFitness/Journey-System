# The Learning vault redesign — three designs for the morning (Oct 19 2026)

**Status:** three playable prototypes on branch `oct19/learning-vault` (worktree
`.claude/worktrees/learning-vault`) over master `0f6a936f`. **Not pushed, not
live.** Nothing in them reads or writes Firestore: every mark, note and
submission lives in an in-memory sandbox for as long as Learning is open.
Learning opens on **Current** (today's Learning, unchanged) until someone taps
a design on the prototype bar.

## What AJ asked

The brief (`msf_learning_redesign_foundation_for_claude.md`, written with
another AI from screenshots) asked for Learning (Overview, Catalog, Academy) to
become a living, interconnected resource for 70+ studios: a two-layer
"{Studio}'s version | MSF original" model with per-studio strike-throughs and
notes, a trainer-to-head-office dispute flow with a "how many studios crossed
this out" signal, Teams links to a page or a section, an iPad-portrait-first
layout (820 x 1180), and three distinct designs to try side by side, with a
harness that photographs them. Then, at about 1 AM:

> "i trust all your decisions i will be back in 8 hours so go nuts, also lets
> look into adding a little game mode in learning where its a quiz mode that
> just gives information from the academy and even the renaissance of
> exercise"

## How to try it

**On the PC** (the harness, no sign-in, no Firebase, sample data, studio
"Solon"), from the worktree folder in PowerShell:

```powershell
cd C:\Users\austi\Projects\Journey-System-Beta-master\.claude\worktrees\learning-vault
npx vite --config harness/learning-redesign/vite.config.ts --host
```

Then open `http://localhost:5251/?design=codex` on the PC, or
`http://<the PC's Wi-Fi address>:5251/?design=codex` on the iPad (same Wi-Fi;
the address is the "IPv4 Address" line `ipconfig` prints for Wi-Fi).
Change `design=` to `vault`, `course` or `current`; add `&theme=dark`. The
prototype bar at the top switches designs and "View as" (Trainer · Leader ·
Head office) live. (Windows may ask once to let Node through the firewall on a
private network: allow it.)

**In the real app** (the PC build, signed in, reading production but writing
nothing new): run `npm run dev` from the worktree folder and open Learning.
The prototype bar shows to administrators and in a development build only.

**The photographs** (261 of them: every design, every page, 820 x 1180 light
and dark, 1180 x 820, 390 x 844, plus each design's interactions):
`C:\Users\austi\Projects\learning-designs-oct19\` (outside the repo). Make
more with `node harness/learning-redesign/shots.mjs all` (about 9 minutes).

**The morning page**, with the best 35 shots and the checklist below as taps
(your answers save to the page and I read them):
https://claude.ai/artifact/HqPDt23qv1YZC9A9mEGo5M

## The three designs

All three draw the same pages, the same studio markup, the same line actions,
the same concept cards, the same quiz and the same playbooks (the shared parts,
`src/features/learning-vault/README.md`). They differ in how you find things
and how a page is laid out. Each folder's README has the screens in full.

### Design 1 — The Tactical Codex (`learning-redesign/codex/`)

Every page is a codex entry in layers: what a trainer needs at the machine in
thirty seconds first, each deeper layer one tap. A machine opens on a **bento**
(the body it works, its dials, its facts and what it connects to) above a
sticky **tier bar**: 1 Floor glance · 2 Script & cues · 3 Adapt & clinical · 4
Deep science; tier 2 opens on the rep scrubber in that machine's shape. The
Overview leads with **reading paths** for each role (a new Life Transformer, a
head trainer, a studio leader, the five pillars), then the studio's floor as
codex entries in walking order, the Academy as a contents page, and Play.
Borrows from the Hades Codex, the Civilopedia and Trainual.

### Design 2 — The Living Vault & Rumor Map (`learning-redesign/vault/`)

You wander Learning instead of looking things up. Everything (machines, the
method's words, equipment words, cue moments, modules, topics, clinical flags,
playbooks) is a star on one **map**, and every line says why two things
connect. Tap a star: it moves to the middle, its neighbours light, the rest
fades, and a card under the map lists its links by reason; tapping one moves
the map there, with one-tap Back. Every page shows its own small map under the
title, marks sit in a left gutter, and "Linked here" at the foot lists what
points at it. The Catalog stays floor first (the map is a lens there). Borrows
from Obsidian's graph and backlinks, the Outer Wilds ship log and Crusader
Kings III's nested tooltips.

### Design 3 — The Interactive Course & Field Manual (`learning-redesign/course/`)

Learning that teaches by doing. A topic becomes **step cards** with Back /
Next (swipe works) and a **Check yourself** at the end; the repetition is
something you **scrub**; a cue is a **drill** you say before you reveal the
Academy's lines; the glossary is a **vault** of cards with filters and an A–Z;
a machine is a **field manual** with its dials as numbered pins on a blueprint,
Stop in plum, Set it up as cards, and the full manual one tier at a time. The
Overview is courses (the seven reading paths), Play, the drill of the day, the
scrubber and the field manual. Borrows from Brilliant, Inkling, Trainual and
LegendKeeper.

## What all three share

- **{Studio}'s version | MSF original** on every article, 44px, in the sticky
  row. A studio leader crosses a line out with a **required reason** (the same
  gate as taking a safety line off a unit); the line stays visible, struck,
  with what the studio does instead, why, who and when; **Hide crossed-out
  lines** is opt-in; **Put it back** undoes it. Anyone at the studio writes a
  note on a line. Every form opens in place under its line.
- **Tell head office**: dispute a line or add to it, with proposed wording.
  Head office's queue groups them by page and shows "Crossed out at N studios"
  with each studio's reason one tap away.
- **Ask in Teams**: the iPad's share sheet (Teams is on it) or Copy link, to a
  page or one line, in the Teams-link branch's `/l/` grammar. The app never
  posts.
- **Concept cards**: every meaningful word opens a card at the word; words in
  the card open the next, three deep, with a pin.
- **The peek sheet**: a second page under your thumb, so you never lose your
  place.
- **The quiz** ("Play"): about 300 questions in eight decks (Quick ten, the
  glossary, What would you say?, The repetition, Machines, The method, Why we
  train this way, The floor and the conversation).
- **Life Transformer playbooks**: nine draft pages and seven reading paths.

## The quiz (your game mode)

Every question traces to a file and says which; "Read it" opens that page in
the peek. Generated questions are mechanical (a glossary word and its first
sentence, a cue and its moment, a script's beats in order, which machines start
with a handoff, which are never taken to failure); about 85 are written by
hand, each with the exact quote that proves it, and a test fails if the quote
is not in its topic. A content review checked every one against its source
and 67 corrections were made (below).

**The Renaissance of Exercise is not in the repo.** Your rule from Sep 27 is
to paraphrase it with a book reference and never quote it, and nothing in the
repository records more of it than its title, its author and Hutchins'
definition of exercise (in `docs/business/the-floor.md`). So the "Why we train
this way" deck paraphrases the definition clause by clause and asks what
Journey built from each, labelled "Paraphrased from Ken Hutchins' definition of
exercise (The Renaissance of Exercise)". I did not write questions from my own
memory of the book: a confident wrong fact in a training quiz is worse than a
missing one. If you want more from the book, send me notes or the passages you
can share, and I will paraphrase them into the deck.

Nothing is stored, ranked or compared ("Recognition, never ranking"). A round
ends with "7 of 10 this round" said once, kept nowhere, and the missed
questions, each with Read it. A miss is never crimson.

## Decisions I made without you (say if you want any changed)

1. **Prototypes only, no Firestore.** The local `.env` points at production.
2. **A crossed-out line stays visible by default**, struck, with its reason.
   `studio-wiki.ts` records that "the baseline is always still there"; hiding
   is a toggle.
3. **Crossing out needs a reason; a note does not.** Leaders cross out; anyone
   at the studio notes; anyone tells head office.
4. **Teams is links only.** The Oct 18 Teams plan chose "Links first", and
   Graph cannot post as the app. No Adaptive Cards, no bot, nothing pinged.
   The shared words name the page ("Leg Press · Floor glance — Open in Journey
   …"); the Teams-link branch's own Copy link names only the kind ("A Learning
   page · …"). Pick one when both land.
5. **Playbooks are drafts**, every one marked so: they are Claude's words from
   Journey's business notes, and "Corporate owns the method, so corporate reads
   it before adopting it". No prices.
6. **The map lives on the Overview; the Catalog stays floor first** (a recorded
   decision). In Design 2 the map is a lens on the Catalog and the Academy.
7. **Reading paths keep no progress.** They are ordered lists, never scored.
8. **Concept cards replace the bottom-of-page glossary card** in the
   redesigns only (`wiki.css` records a reason against popovers: "a popover on
   an iPad covers the sentence you were reading"; these sit above or below the
   word and close on scroll unless pinned). Today's Academy is untouched.
9. **The prototype bar shows only to administrators and in a development
   build**, and Learning opens on Current, so nothing changes for a trainer
   even if this branch were deployed by mistake.

## Where this changes a recorded decision (needs your yes before it ships)

- **Max Strength owns the method; every floor reads the same words**
  (CLAUDE.md), and `studio-wiki.ts`: "THE SHIPPED CORPUS IS NEVER TOUCHED … a
  studio 'correcting' them would silently fork the curriculum." Studio
  strike-throughs on Academy prose are new ground. What keeps it inside the
  spirit: the original is always one tap away, the struck words stay on the
  page, a reason is required, and head office sees every crossed-out line with
  its reason. For a studio's own machine copy you already said yes ("studios
  need to be able to customize their stuff … but are trusted", Sep 21).
- **Don't change the Firestore structure without an explicit OK.** Keeping
  marks needs a markup document kind in the studio's wiki (leaders only), notes
  per document, a `learningSubmissions` collection and two indexes
  (`learning-vault/README.md` has the plan).
- **In-app only, for now / Nothing pings anyone.** Untouched: a person shares;
  the app sends nothing.

## Your morning checklist

The morning page has these as taps; your answers save to it and I read them.

1. **Which design?** 1 Codex · 2 Vault map · 3 Course · a mix. *My pick: a
   mix with the Codex as the base.* Its machine page (bento + tiers) is the
   best thing for the floor, where the iPad is in one hand between sets. Add
   from the Course its lesson cards for long Academy topics, the scrubber, the
   cue drills and the glossary vault; from the Vault the map as a lens on the
   Overview and "Linked here" on each page, not the front door.
2. **Studio strike-throughs on Academy prose: yes?** (the recorded-decision
   change above). *My pick: yes, with the reason required and the original
   one tap away.*
3. **Crossed-out lines visible by default?** *My pick: yes (hide is opt-in).*
4. **Keep marks for real (the Firestore change)?** *My pick: yes, as its own
   round once the design is chosen.*
5. **Teams share words: name the page, or only the kind?** *My pick: name the
   page for Learning (a page title is not client data); a client or a session
   stays kind-only.*
6. **Where does the quiz live?** A door on the Overview and the Academy (as
   built), or a fourth masthead section (the Using Journey branch also wants
   the fourth slot)? *My pick: a door, as built.*
7. **The end-of-round line "7 of 10 this round": OK, or no number at all?**
   *My pick: keep it; it is kept nowhere and shown to no one else.*
8. **Who reads the playbooks for head office?** You, Jeff, or both. Until
   then they show as drafts (or I can hide them until approved, like Using
   Journey's pages).
9. **The Renaissance of Exercise:** anything you can share (notes,
   permitted passages) so the deck can grow past the definition?

## Found along the way (for you or head office)

- **Overhead Press and Seated Dip**: their scripts ask for "a brief but
  definite stillness" at the top, while everything else in the Academy says
  end-stop machines have no pause. The scrubber keeps "no pause"; this needs
  head office's ruling.
- **Machine names**: the Catalog says "CX (4 WAY NECK)", "SEATED ABDOMINALS",
  "Flye / Biceps / Triceps"; the Academy says Cervical Extension, Abdominals,
  CF / Bi / Tri. The quiz now uses the Academy's names; the machine pages keep
  the Catalog's (your Oct 2 call). Worth one look.
- **The four P's order**: `the-floor.md:114` says "Pace, Posture, Path,
  Purpose"; the Academy and the code say Posture, Pace, Path, Purpose. No
  question asks the order.
- **The progress report**: its README says five steps; `steps.ts` has six
  (the sixth is the printed page).
- **The Academy's consultation script** still carries the out-of-date package
  lines (30/60/90 days, "we no longer bill you or auto renew you"). Nothing in
  the redesign quotes them.
- **The clinical matrix**: some lines are still unsourced, pending your
  ruling from the Sep 28 source check; the concept cards show names and
  counts only.
- **The Gemini brief's facts**: most were right; wrong or stale were the
  "57-row" Academy list (35 rows today), "landscape uses independent column
  scrollers" (it is one scroller with a sticky side column), "zero extra
  listeners" (`useStudioWiki` opens its own listener in six places), a fixed
  "20-second rep" (the Academy says 12 to 20), and `?learning=…&section=…`
  (the Teams-link branch already defines `/l/{kind}~{id}`). The full check is
  in the round's scratch notes.
- `tsconfig.json` has no `strict` flag (the agents checked their own files
  under strict anyway).

## What shipping the pick would take

1. Keep the picked design (or mix), delete the others' folders, the prototype
   bar and the sandbox's sample marks; the shared parts stay.
2. The Firestore round for marks and submissions (rules, rules tests, two
   indexes, a Firestore-backed `MarkupStore`).
3. Merge with the Teams-link branch: its parser reads `?section=`.
4. Merge with the Using Journey branch (both edit Learning's section list).
5. One CLAUDE.md map line and decision entries for whatever you decide above.

## Measured

`npx tsc --noEmit`: 0 errors. The whole suite (`TZ=America/New_York npx
vitest run --dir src`): **16,002 tests in 958 files**, all passing, run twice
(master: 14,865 in 908). `vite build` and `npm run check:bundle`: the first
screen is 471.0 KB gzip of the 480 budget (+0.3 KB); each design loads only
when picked (about 10–15 KB gzip of its own plus a 77 KB chunk of the shared
parts, once). No file names that differ only by case; no invisible
characters. CLAUDE.md's test count is left alone on this branch (other
branches are changing it too); it moves with the pick.

## Commits on `oct19/learning-vault`

| Commit | Phase |
| --- | --- |
| `fc8e9400` | 0: the shared shapes |
| `6d6742b7` | 1: the shared foundation (pages, markup, links, concepts, graph, peek, codex reader, rep model, quiz, playbooks) |
| `28a326b2` | 2: the prototype switcher and its harness |
| `619a2827` | the harness's per-design steps |
| `4e814cb8` | 3a: what the designs asked of the shared parts |
| `0f17223a` | 3b: Design 1, the Tactical Codex |
| `25c8b748` | 3c: Design 2, the Living Vault |
| `aed71860` | 3d: Design 3, the Interactive Course |
| `993e192b` | 3e: every new stylesheet held by the style guards |
| `91d19acc` | 4: content checked against its sources (67 fixes) |
| `0e96dfd1` | 5: the design review's 89 findings fixed; the shared parts' README |
| (the last) | this round document |

## How the night went

Twelve readers mapped Learning and checked the brief; nine agents built the
shared parts against one contract; three designers built a design each,
photographing and fixing their own screens; a content review (five readers,
five skeptics) and a design review (six reviewers, six skeptics: visual,
correctness, house rules) found 156 problems that survived a second look (67 in
the content, 89 in the screens and the code), and fixers fixed them. Every agent worked in this worktree only.
