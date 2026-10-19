# Design 2 — The Living Vault & Rumor Map

One of three playable prototypes of Learning (the Learning vault redesign, Oct 19 2026). Picked on the prototype bar as **2 Vault map**. It is a layout of the shared parts in `src/features/learning-vault/`: the pages, the studio's markup, the line actions, the concept cards, the graph, the peek sheet, the quiz and head office's list are theirs, drawn here.

## The idea

Learning is a **connected vault you wander**. Everything in it (machines, the method's words, equipment words, cue moments, the Academy's modules and topics, clinical flags, the Life Transformer playbooks) is a star on one map, and every link between two stars says why it is there ("is part of a set that replaces", "is cued at", "talks about"). You never have to know where a thing is filed: you start anywhere and follow what connects.

Three promises hold it together:

1. **Every page shows what it connects to, and why.** A band under the title draws the page in the middle and its links around it, each with its reason. "Linked here" at the foot lists what points at the page, in sentences.
2. **Every word that means something opens a card**, and the card's own words open the next one, three deep, with a pin to keep it (the shared ConceptLayer).
3. **Nothing makes you lose your place.** A cross-link peeks: the page it points at rises in a sheet under your thumb (portrait) or a dock beside the page (landscape), and "Open full page" is one tap when you want it.

## The screens

| Screen | What is on it |
| --- | --- |
| **Overview** | The **Rumor Map**: chips for each domain, Map or List, the map itself (about 60% of an upright iPad), then the card for the star you tapped (what it is in the source's words, its links grouped by why, Open page, Peek, and a way Back across the map). Under it: Reading paths, Play (three decks and Every deck), and for head office, Waiting for review. |
| **Catalog** | The studio's floor first, in walking order: the stop number, the code tag, the name, and what it connects to as small domain badges ("3 machines, 2 cue moments, 2 clinical flags"). Then the MSF machines not on the floor. A lens switch, Floor · Map · List: the map is the floor's machines with their cue moments and clinical flags, machines not on the floor drawn hollow. |
| **Academy** | The thirteen modules (number, title, topics and reading time), the Glossary and the Cueing phrasebook, the playbooks by pillar (said once to be drafts), Play. Lens: Modules · Map · List (modules, topics, words, cue moments). |
| **Any page** (machine, topic, card, script, deep dive, glossary, cueing, playbook) | Eyebrow, title, lede, the facts the eyebrow does not already say; the page's own constellation as a band (each link a button that peeks; the middle opens the whole map focused here); the body through `ArticleBlocks annotate="gutter"` (a studio's notes and crossed-out lines as markers in a left gutter); Read alongside (whatever the band and Linked here do not already say); Linked here. The version switch rides the masthead's second row ("Solon's version · MSF original", and Hide crossed-out lines when there are any); on a phone it sits in the page. |
| **A glossary term / a cue moment** | Its own page: titled by the term or the moment, its own constellation, its line first in the body (the same block, so a studio's mark stays on it), then the rest of the glossary or phrasebook to browse. A peek shows the one term, not the glossary. |
| **Module** | Its topics as numbered rows. |
| **Reading path** | Its steps as stops on one line, each a card with its why. |
| **Quiz, head office's list** | The shared QuizMode (its "Read it" peeks the source) and SubmissionQueue, in the frame. |
| **Map** | The whole map focused on one star: where a page's "Map" button and a clinical flag's card go. |
| **Waiting and gone** | The one loading mark; a module that failed to arrive says so with Try again; a page the corpus no longer has says "This page has moved" with the way back. |

Landscape (1024px and wider, nothing docked): the map and its card side by side; a page's constellation beside its title and Read alongside / Linked here beside its body (Obsidian's side pane). With the peek docked, the page is an upright iPad's width again and lays out as one column. Phone: one column, the chips as glyphs (the map names the domains), the version switch in the page, the peek a tall sheet.

## What it borrows, and why

- **Obsidian's graph view, local graph and backlinks.** The map is the graph view; the band under each title is the local graph; "Linked here" is the backlinks pane. Obsidian proved that showing a note's neighbourhood makes people follow ideas instead of filing them. Unlike Obsidian, nothing moves on its own: the layout is the shared deterministic one, so the machines are always in the same place.
- **Outer Wilds' ship log (rumor mode).** You do not read the vault top to bottom; you follow a lead. Tapping a link in the card moves the map's focus there (the map re-lays itself, the lines say why), and the trail back is one tap. Nothing records what you have seen: the trail lasts as long as the screen (decision 11, no progress is kept).
- **Crusader Kings III / Victoria 3 nested tooltips.** Every meaningful word is a card that opens more cards, three deep, with a pin (the shared ConceptLayer).

## How it is built

| File | What it is |
| --- | --- |
| `VaultLearning.tsx` | The root (default export, `DesignProps`): `useVaultData` once, the map's memory, and one body per masthead section (keyed, so a masthead tap lands on that section's front page). The body holds the trail (`useVaultNav`), the peek (`usePeekStack`), the ConceptLayer, and handles a jump (`routeForRef`, then `onJumpHandled`, before paint). |
| `shell.tsx` | The screen context and `Frame`: WikiShell (crumbs from the trail), PeekFrame and PeekSheet. |
| `RumorMap.tsx` | The explorer: chips, Map/List, the canvas (shared `layoutMap`; HTML 44px stars over an SVG of rings and lines; labels placed so none overlap), the list, the card, Start with. |
| `MiniOrbit.tsx` | A page's own constellation, on the shared `layoutConstellation`. |
| `screens.tsx` | Overview, Catalog, Academy, module, path, quiz, queue, map, every article, loading and gone. |
| `PeekPage.tsx` | A route as the peek draws it (compact `ArticleBlocks`; one term or moment; a module's topics; a path's steps). |
| `map-model.ts` | The pure arithmetic: the map's height, the label placement, the domains' name points, connection counts, backlinks, Start with, say-it-once. Tested in `map-model.test.ts`. |
| `vault-map.css` | The one stylesheet, prefix `vm__`, `--wk-*` tokens only. |
| `VaultLearning.render.test.tsx` | The whole design mounted on the Academy's real JSON: the map and its list, home → a star → its machine page → a topic it peeks → Open full page → Back → Back, a jump, a page that moved, the floor first, an unreadable floor, the Academy and the quiz, the phone's version switch. |

Harness steps: `harness/learning-redesign/steps-vault.mjs`.

## What is shared, and what it would take

- Everything a page says comes from `pageFor`; every mark goes through `ArticleBlocks`; every link's reason is the graph's. This folder adds no words about the method and no rule.
- **`LocalConstellation` now draws the orbit alone** (`list={false}`, the integration pass, Oct 19 2026): its nodes then focusable, each named with its why. `MiniOrbit` still draws the page's band itself, because two things it does are not the shared orbit's: its middle is a door ("Map", the whole map focused here) where the shared centre is only the page's name, and every node shows its why under its name, in words, where the shared node shows the name alone (the why only to a screen reader). Moving to the shared component would lose both; a `centre` door and visible reasons on the shared orbit would let it.
- `LocalConstellation`'s centre now measures a name as it is written (capitals wider than small letters, `layout.ts labelWidth`), so "LEG PRESS" is never broken mid-word.
- A page opened from outside, and the reset (`resetSignal`: the Learning title on the Overview, or the section already on), move the trail with `useVaultNav`'s `set`, which does not ask a second time.

## What I would do next

- Let the map remember the trail across sections (today each section's body is its own), and draw the trail as a faint path on the map.
- A "Floor walk" lens on the Catalog map: the stations in walking order joined by a line, the clinical flags of today's clients lit (needs the session's flags, read-only).
- Label placement could try a fourth side (left/right for top-of-ring nodes) before giving up; today a crowded star simply goes unnamed on the map.
- Measure the label widths after the first paint (one layout effect) instead of guessing from character counts.
