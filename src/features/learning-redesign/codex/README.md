# The Tactical Codex — Design 1 of the Learning vault redesign (Oct 19 2026)

One of three playable prototypes of Learning, for AJ's morning pick. Mounted by
`../lazy.tsx` (`CodexLearning`, the default export, takes `DesignProps`) inside
LearningView's masthead and the round's `VaultProvider`. Nothing here reads or
writes Firestore: every mark goes to the vault's in-memory sandbox.

## The idea

Every entry is a codex page in **layers**. The first layer is what a trainer
needs standing at the machine, iPad in one hand, in thirty seconds; each deeper
layer is one tap. It reads like a well-made strategy game's encyclopedia:
structured, numbered, confident, quick. Numbers are in the display face
(walking order, chapters, tiers, steps); every machine thing carries its
category's band; panels are crisp on the house's firm edges.

## The screens

| Screen | What is on it |
| --- | --- |
| **Overview** (`CodexHome.tsx`) | **Paths**: a new Life Transformer's path as the lead card (the brand band, its first three steps side by side with why each comes there, one Start), the head trainer's and studio leader's paths beside each other, the pillar paths as rows. **On {Studio}'s floor**: the floor as codex entries in walking order (number, code chip, name, category band, and the "Out of service" / "Flagged" chips). **The method**: the thirteen modules as a two-column contents page, the glossary and the phrasebook beside them. **Play**: Quick ten and every deck. Head office sees its queue's door first, saying the queue's own first line ("2 waiting from the floor · 6 lines crossed out", `queueLead`), so the door and the page it opens never disagree. |
| **Catalog** (`CodexIndexes.tsx`) | "{Studio}'s floor": one list in walking order (number, code, name, its preset when a number is set, "Out of service" / "Flagged" and why it is out as today's Catalog row says them (`FloorStatus`, read from Relay and the roster; unknown says nothing), category), then the MSF machines this floor does not have. A floor that could not be read, or has nothing on it, lists every MSF machine instead ("Every MSF machine", `otherMachines`), so the Catalog is never a dead end. The floor first is a recorded decision. |
| **Academy** (`CodexIndexes.tsx`) | The method's thirteen chapters with their blurbs and reading times, the two reference books, the playbooks on their five shelves (the draft line said once), every path, Play. |
| **Machine** (`CodexMachine.tsx`) — the showpiece | Title and category, and the floor's status under them when there is one (`FloorStatus`'s banner: "Flagged by Jess · …", "Out of service · …", where it is cleared). The **bento**: the body with the worked muscles (`MachineFigure`) on the left; beside it the facts (how it begins, never to failure; the workout only when the category in the eyebrow does not already say it) with the Academy's quick card, script and deep dive as doors that peek, and under them the dials, which take whatever height the body leaves: the preset numbers, or the dials by name and "No numbers set for this unit yet" in a sunk plate (never a guessed number, never a letter nobody recorded; a dial with a rule written opens it). Then the **tier bar** — 1 Floor glance · 2 Script & cues · 3 Adapt & clinical · 4 Deep science — sticky under the trail, its shelf edge to edge, remembered for the visit. The **floor glance leads with the set-up**, the Stop well straight after it and before Get set and Begin (`floorGlanceOrder`; the floor judge, Oct 19 2026: "Floor glance should start with dials and set-up"; the peek of a machine reads the same). Tier 2 opens on the `RepScrubber` with this machine's shape. Each tier ends with a door one layer deeper. Then what the machine connects to (`LocalConstellation`, its groups side by side, each machine in its category's colours; substitutes one way only, "In sets that replace it", never the sets this machine helps replace another), then "Read next", which lists only what Connected did not; a reason several links share is said once over them, and a substitute's reason names its whole set ("If LEG PRESS can't be used: LEG EXTENSION + HIP ABDUCTION + LUMBAR."). On a page 1000px wide (landscape) the bento is a column beside the layers, the facts and dials first and the body under them; with the peek docked, it stacks again (the page is a container). On a phone the body is shorter. The first screen of a portrait iPad holds the title, the floor's status, the bento (body, facts, dials), the tier bar and the first set-up lines. **Decision for AJ:** the Machine Codex puts Stop first; this page puts the set-up first and Stop second (one constant, `GLANCE_LEAD` in `codex-model.ts`, to undo). |
| **Topic** (`CodexArticle.tsx`) | The same tier bar, adapted honestly: **In one minute** (its headings and the first line under each, the topic's own words), **Say it** (the phrasebook moments that use the topic's words, from the knowledge graph; their marks are the phrasebook's, so they land there), **Full text**. A tier that would be empty, or only repeat the full text, is left out, and the bar numbers what is left by its place (1 · 2 · 3, or 1 · 2): a bar reading 1 · 2 · 4 looked like a tier had gone missing. |
| **Quick card, script, deep dive, playbook** | Head, facts, every line, Read next. A machine's piece is titled by the piece ("Quick card", the word on the bento's door), the machine's code and name above it; its crumb is "Quick card" right after its machine and "Quick card · LEG PRESS" anywhere else, the peek's head too (`pieceLabel`), so the three pieces never read as the machine's page. Its spoken lines take the machine's category (`pageAccent`). A playbook says "A draft from Journey's notes, waiting for head office to read it." once, in a quiet well. |
| **Glossary** | A codex index: the letters read down one column and on into the next, as a book's index does, each tile as tall as its words (two columns where they fit, one on a phone); each word a door to its own **entry** (the definition, what it connects to, "Every word in the glossary"); every definition in one list under it. |
| **Cueing phrasebook** | The fourteen moments as a contents page, each a door to its own entry (its lines, the machines cued there, the words it uses); every phrase in one list under it. |
| **Path** (`TrackPage`) | Civilopedia's chapter list: numbered steps, 64px rows, each with why it comes there and its kind's glyph. Nothing is kept about who read what, and nothing says so: there is simply no progress anywhere. |
| **Module** | Its topics as numbered chapters ("4.6"), then the next chapter's door. |
| **Clinical flag** (a `map` route) | Its entry: the matrix's words (names and counts only) and the machines it touches. |
| **Quiz, head office's queue** | `QuizMode` and `SubmissionQueue`, inside the page's one scroller. |
| **Peek** (`CodexPeek.tsx`) | Every cross-link that would lose the reader's place peeks: a machine's quick card, script and deep dive, a substitute, a cue moment, a clinical flag, a quiz answer's source, Read next on a machine. A machine peeks at its floor glance under its code and preset; a word, its line; anything else, every line. "Open full page" pushes it. |

Every article draws the version switch ("Solon's version | MSF original", and
"Hide crossed-out lines" when there are any) on the trail's row, sticky, when
it fits there beside the crumbs (`versionFitsTrail`, from the crumbs' words
and the screen's width); on a phone, or on a trail the row would scroll until
its first crumb was cut mid-word, it sits under the title. Its place never
hangs on the lens (`hideReserved`): room for "Hide" is kept whenever the
studio crossed a line out on the page, in either lens, or the reader may cross
one out, so tapping "MSF original" never moves the switch out from under the
finger. The one quiet "Tap a line to …" is the Codex's own, once, above a
body's first section (`TapHint`, `tapHint={false}` on the body): never inside
the Stop well, never between two lines that share a label. Every body is
`ArticleBlocks` (inline annotations) with `LinkedText` inside one
`ConceptLayer`, so studio markup, line actions, disputes and Teams links work
the same as in the other designs; a page never links its own name to itself.
The lines' own inset hangs outside the column (`.cdx__blocks`), so their words
share one left edge with the title, the tier bar and Read next; a toned
section (a machine's Stop well) keeps the column's edges.

Loading is the house's loading mark, only while a page is truly on its way
(`waitState`): a module chunk or a reference chunk that failed says so with
"Try again" (`data.retryModule`, `data.retryReference`; the reader's tap,
never a timer), on the page, in the peek and on the quiz; a studio's own
machine on a floor that could not be read says "Can't read {Studio}'s floor
right now" with Back; a page the corpus no longer has says "This page has
moved" with Back.

A new visit (a masthead section, the title, a jump from outside) is set in a
layout effect, and a jump's page goes on top of the root with `nav.set`
before anything paints, so the old section or the section's front page never
flashes first.

## What it borrows, and why

- **Hades' Codex**: entries you unlock by depth. Here nothing is locked — the
  depth is the tier bar, and the first layer is the one the floor needs.
- **Civilopedia** (Civilization): a home of categories and contents pages,
  numbered chapter lists, every entry one tap from its neighbours. The method,
  the phrasebook and the paths read as contents pages.
- **Trainual**: role-based paths with a clear first step. No progress is kept
  (decision 11: nothing scored, stored or compared).
- **Bento layouts** (strategy-game unit cards): the machine's picture, numbers
  and connections in tiles you read at a glance before you read any prose.

## Navigation

Each masthead section is its own trail, as today. A new section, or a page
asked for from outside (`jump`, cleared with `onJumpHandled`), starts a fresh
visit (a remount): both were asked about before they arrived. Inside a visit
every move goes through `useVaultNav`, which asks the unsaved-changes gate
first; a tier switch asks the page's leave scope (it takes the tier's open
forms away). Crumbs go back to any page in the trail; a machine opened again
from a link returns as the reader left it (`resolveOpen`).

## Files

| File | What it is |
| --- | --- |
| `CodexLearning.tsx` | The root: the data (read once), the visits, the context, the concept layer |
| `codex-context.ts` | The context every screen reads; `crumbLabel` |
| `CodexScreen.tsx` | The page by its route's kind; the quiz and the queue |
| `CodexFrame.tsx` | The frame (WikiShell, the peek), loading, failed, gone |
| `CodexHome.tsx`, `CodexShelves.tsx` | The Overview and the shelves it shares with the Academy index |
| `CodexIndexes.tsx` | The Catalog, the Academy index, a module, a path |
| `CodexMachine.tsx` | The machine: bento, figure, dials, tiers |
| `CodexArticle.tsx` | A topic in tiers; card, script, deep dive, playbook; the glossary and the phrasebook with their entries; a clinical flag's entry |
| `CodexPeek.tsx` | A page in the peek |
| `CodexBits.tsx` | The head, the version slot, the body, the tier bar, the deeper door, Read next |
| `codex-model.ts` (+ `.test.ts`) | The pure half: trails, categories, the floor and the Catalog's other machines, why a page is waiting, the bento's facts, a machine's pieces and their names, the version switch's place, Read next and its shared reasons, topic tiers, glossary and phrasebook entries, paths |
| `CodexLearning.render.test.tsx` | Mounts the whole design on the real corpus and walks it |
| `codex.css` | The one stylesheet, `cdx__` only, `--wk-*` tokens only |

Interaction shots: `harness/learning-redesign/steps-codex.mjs`.

## Shared changes this design asked for (made in the integration pass, Oct 19 2026)

Each was worked around inside this folder; each is now a shared prop, and
the workaround is gone.

1. **`ArticleBlocks showOrphans={false}`** on a partial body (`Blocks
   partial`: one tier, one glossary word, one cue moment), so a mark on a
   line in another tier is never called "changed"; the machine and topic
   pages draw `OrphanMarks` once, counted over every tier
   (`useAppliedMarkup` over the whole page). The `.cdx__blocks--partial
   .vta__orphans` rule is gone.
2. **`LocalConstellation layout="columns"`** on the bento's foot: the pill
   groups side by side as 13rem columns fit. The `.cdx__tile--links .vtg`
   grid is gone.
3. **`MachineFigure className="cdx__figure-in"`**: the bento sizes the
   figure's own root (`wk__figure-sized`: the body takes what the
   Anterior / Posterior controls leave). The `.cdx__figure .wk__figure` and
   `.cdx__figure > *` reach-ins are gone.
4. **`DesignProps.resetSignal`**: the Learning title on the Overview, or
   the section already on, takes the Codex back to the section's front page
   (a new visit; LearningView asked the leave gate first).

## What I would do next

- Wire the studio's own dial numbers (`presetOf(def, studioNumbers)`), so the
  dial strip shows Solon's numbers rather than the standard's.
- A "Hold" for the floor glance: pin tier 1 while a session is running (the
  iPad set down at the machine), larger type, one tap back to the session.
- Keyboard: arrow keys move between the floor's tiles in walking order.
- A machine's tier in the share link (`?tier=`), so "Ask in Teams" from tier 3
  opens tier 3.
