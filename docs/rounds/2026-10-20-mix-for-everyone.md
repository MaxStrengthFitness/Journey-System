# The Mix for everyone (Oct 20 2026)

Branch `oct20/mix-for-everyone` over master `33680d99`. Front end only: no
rules, no indexes, no Cloud Functions, no Firestore structure.

## What AJ said

- "i also really like the new Mix Learning, we can go ahead and stay with Mix"
- On the three questions the plan asked: "build the Mix for everyone with your
  picks: markup hidden until its own Firestore round, cross-outs decided then,
  playbooks hidden until head office reads them."
- On what the build found (the Mix lacks some of the studio's tools): "Switch
  everyone to the Mix now, with a door on each page to today's Learning for the
  studio tools, and move them in later."

## What changed for a trainer

1. **Learning opens on the Mix, for everyone.** The prototype bar, its
   Mix | Current switch and "View as" are gone. An iPad that remembered
   "Current" opens on the Mix all the same.
2. **Nothing on a line can be marked yet.** A line is plain reading: no tap,
   no "Tap a line to …" hint, no "Solon's version | MSF original" switch, no
   head office queue. Crossing out, a note on a line, Tell head office and Ask
   in Teams all wait (see "What waits").
3. **The playbooks are hidden** until head office has read them: not on the
   Academy's shelves, not in a path, not on the map, not as a quiz answer's
   door. The quiz's "The floor and the conversation" deck waits with them
   (its questions come from the same business notes).
4. **A door on each page that has a studio tool the Mix lacks**, under the
   page's title, named for what is behind it. It opens today's page in place,
   under one strip: **Back to Learning** (and the words "Studio tools").

| Mix page | Its door | What today's page holds that the Mix does not yet |
| --- | --- | --- |
| A machine on this floor | Floor notes, set-up and history | the floor's notes, "How it's used", the studio's set-up card and its change log, the model, comments |
| The Catalog | Floor plan and body view | the floor drawn to size and Draw the floor, the body view |
| The Academy | Studio pages | the studio's own pages and New page |
| A topic, a quick card, a script, a deep dive | Comments | the page's comments |

The Overview, a path, the quiz, the map, the glossary, the phrasebook and a
module have no door: today's version of them holds nothing the Mix lacks.

Back to Learning finds the Mix exactly as it was left (its page, its trail,
its tier, its scroll): the Mix stays mounted, hidden, on the section it was on,
so nothing is rebuilt between clients (the review's fix). Moving between
today's sections stays on today's pages until Back. Every door and Back asks about unsaved typing
first, like every other door in Learning.

A Learning link from outside the tab (the bell, a note, an announcement)
opens the Mix, even while today's pages are on, with one exception: a
studio's own page, which only today's Academy draws, opens there.

## What waits

- **Keeping marks** (cross out, notes, Tell head office): their own round, a
  Firestore structure change (a markup document kind, a `learningSubmissions`
  collection and two indexes; `src/features/learning-vault/README.md`). It
  needs AJ's explicit OK. Whether a studio may cross out the Academy's own
  words is decided in that round. Turning marking on is `MARKUP_ON` in
  `src/features/learning-vault/markup-on.ts`.
- **Ask in Teams**: its links open a Learning page only once the Teams link
  round (`claude/oct19-teams-link-795436`) is live.
- **The playbooks**: AJ or Jeff reads one for head office, then its file's
  `status` becomes `"read"` (and `playbooks/shown.test.ts`'s pinned "none yet"
  line changes in the same commit). It shows, with no draft line.
- **The studio's tools, into the Mix one at a time.** Each one that moves
  takes its words off its door (`todayDoorLabel`); a door with nothing left
  behind it goes, and when none is left today's pages can go too.

## Files

| What | Where |
| --- | --- |
| Marking off | `src/features/learning-vault/markup-on.ts`; `VaultProvider`'s `markup`; `ArticleBlocks` (plain lines), `CodexBits.useVersionSlot` (no switch), `CodexHome` (no queue door) |
| Playbooks hidden | `playbooks/index.ts` (`SHOWN_PLAYBOOKS`, `PLAYBOOKS_DECK_SHOWN`, `shownTracks`), `useVaultData.ts`, `quiz/bank.ts` (`floorDeck`), `CodexIndexes.tsx`, `CodexShelves.tsx` |
| The doors | `src/features/learning-redesign/today-door.ts`; `TodayDoorButton` in `codex/CodexBits.tsx`, under the title on the machine (only one on this floor: today's Catalog opens any other on All MSF machines), topic, piece and index pages |
| The switch | `src/features/learning/LearningView.tsx` (`today`, `mixSection`: the Mix waits mounted and hidden), `TodayStrip.tsx`, `learning.css`; `LearningRedesign.tsx` (no picker, no "View as", no sample marks); `VaultProvider`'s `markup` is required, so no mount can forget it |
| Gone | `learning-redesign/DesignSwitcher.tsx` and its test, `design.ts` and its test, `redesign.css`; the `LearningDesign` type |
| Harness | `harness/learning-redesign/main.tsx` (`?design=current` is today's pages), `shots.mjs` (no bar to wait for), `steps-codex.mjs` (`today-door`, `today-back`) |

## Tests

`CodexLearning.render.test.tsx` "the live Mix" and "the doors to today's
Learning", `LearningView.render.test.tsx` (the Mix for everyone, each door,
Back, the gate over typing, outside links), `LearningRedesign.render.test.tsx`,
`today-door.test.ts`, `playbooks/shown.test.ts`, `quiz/floor-deck.test.ts`.

## Walk it on the iPad

1. Learning: the Mix opens, on every section. No strip, no picker.
2. A machine: under its title, Floor notes, set-up and history. Tap it: today's
   machine page, the strip on top. Back to Learning: the same machine in the Mix.
3. The Catalog's front: Floor plan and body view, then the drawn floor.
4. The Academy's front: Studio pages (a leader sees New page there).
5. A topic: Comments.
6. Tap a line anywhere: nothing happens, and nothing says it would.
7. The Academy's front: no Playbooks shelf; Play: no "The floor and the conversation".

## Shipping

No rules or indexes, so: push to `master`, then on Render, Manual Deploy on
the web service and Manual Build on both crons.
