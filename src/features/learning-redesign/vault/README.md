# Design 2 — The Living Vault & Rumor Map

One of three playable prototypes of Learning (the Learning vault redesign, Oct 19 2026). Picked on the prototype bar as **2 Vault map**. It is a layout of the shared parts in `src/features/learning-vault/`: the pages, the studio's markup, the line actions, the concept cards, the graph, the peek sheet, the quiz and head office's list are theirs, drawn here.

## The idea

Learning is a **connected vault you wander**. Everything in it (machines, the method's words, equipment words, cue moments, the Academy's modules and topics, clinical flags, the Life Transformer playbooks) is a star on one map, and every link between two stars says why it is there ("is part of a set that can replace", "is cued at", "talks about"). You never have to know where a thing is filed: you start anywhere and follow what connects.

Three promises hold it together:

1. **Every page shows what it connects to, and why.** A band under the title draws the page in the middle and its links around it, each with its reason. "Linked here" at the foot lists what points at the page, in sentences.
2. **Every word that means something opens a card**, and the card's own words open the next one, three deep, with a pin to keep it (the shared ConceptLayer).
3. **Nothing makes you lose your place.** A cross-link peeks: the page it points at rises in a sheet under your thumb (portrait) or a dock beside the page (landscape), and "Open full page" is one tap when you want it.

## The screens

| Screen | What is on it |
| --- | --- |
| **Overview** | The **Rumor Map**: chips for each domain, Map or List, the map itself (about 60% of an upright iPad, never past the room the scroller has under it), then the card for the star you tapped (what it is in the source's words, its links grouped by why, Open page, Peek, and a way Back across the map). The map names a star only where the name covers no other star, and with a focus it names only the links the card lists. Under it: Reading paths (every stop drawn alike: nothing is kept), Play (three decks and Every deck), and for head office, Waiting for review. |
| **Catalog** | The studio's floor first, in walking order: the stop number, the code tag in the machine's category colour (as the Catalog draws it), the name, then what a trainer needs before walking over: **Out of service** and **Flagged** in the Catalog's own plum, with why it is out (the shared `FloorStatus` chip, said only once the roster and Relay's flags are both known), and how the set begins (**Load-up** or **Handoff**) with **Never to failure** in the crimson the Catalog gives it. Then the MSF machines not on the floor, the same way. (Until the judges' round, Oct 19 2026, a row showed how many things the machine links to, by domain: numbers with no reader on the floor.) A lens switch, Floor · Map · List: the map is the floor's machines with their cue moments and clinical flags, machines not on the floor drawn hollow. |
| **Academy** | The thirteen modules (number, title, topics and reading time), the Glossary and the Cueing phrasebook, the playbooks by pillar (said once to be drafts; one column on an upright iPad, two flowing columns from 1024px), Play. Lens: Modules · Map · List (modules, topics, words, cue moments). |
| **Any page** (machine, topic, card, script, deep dive, glossary, cueing, playbook) | Eyebrow, title, lede, a machine's **Out of service** and **Flagged** banner (the shared `FloorStatus`, where today's machine page says them; a machine peeked as a stand-in says it too), the facts the eyebrow does not already say; the page's own constellation as a band (each link a button that peeks; the middle, "Map" in blue on every page, opens the whole map focused here); the body through `ArticleBlocks` (on the studio's version with `annotate="gutter"`, a studio's notes and crossed-out lines as markers in a left gutter; on the MSF original, where no mark can show, the page keeps the gutter's room empty, `.vm__room`, so switching versions never moves a word; a phone, the peek and a viewer with no studio read at the page's edge); Read alongside (whatever the band and Linked here do not already say); Linked here (what the band does not already draw). A machine's body is its floor, cue and adapt lines: its spoken script and its deep dive are peeks under Read alongside. A section holding a line the studio crossed out, noted or told head office about stays in the body (so head office's answer is read under its line), whichever version is showing, and stays for the whole visit: putting the line back never drops the section, or moves the chosen line onto another. Substitutes read one way, the floor's question: "If LEG PRESS can't be used", "In sets that replace it"; never the sets this machine helps replace another. The glossary has a row of letters that jump, over the whole article (one row on an iPad either way up; rows of six on a phone). The version switch rides the masthead's second row ("Solon's version · MSF original", and Hide crossed-out lines when there are any); on a phone it sits in the page. |
| **A glossary term / a cue moment** | Its own page: titled by the term or the moment, its own constellation, its line first in the body (the same block, so a studio's mark stays on it), then the rest of the glossary or phrasebook to browse. A peek shows the one term, not the glossary. |
| **Module** | Its topics as numbered rows. |
| **Reading path** | Its steps as stops on one line, each a card with its why. |
| **Quiz, head office's list** | The shared QuizMode (its "Read it" peeks the source) and SubmissionQueue, in the frame. |
| **Map** | The whole map focused on one star: where a page's "Map" button and a clinical flag's card go. |
| **Waiting and gone** | The one loading mark; a module or a reference chunk (glossary, cues, cards, scripts, deep dives) that failed to arrive says "This part of the Academy didn't load" with Try again (on a page, the map, the quiz and the peek); one of the studio's own machines while its floor can't be read says so with the way back; a page the corpus no longer has says "This page has moved" with the way back. |

Landscape (1024px and wider, nothing docked): the map at the top of the page with its chips, switch and card in the right-hand column; a page's constellation beside its title and Read alongside / Linked here beside its body (Obsidian's side pane). With the peek docked, the page is an upright iPad's width again and lays out as one column. Phone: one column, the Overview opening on the List (the map one tap away), the chips as glyphs, the version switch in the page, the peek a tall sheet.

Every link that peeks goes through one door (`peekAt` in `VaultLearning.tsx`): a page, a path or a focused map peeks; anything else (a quiz deck under Read alongside, a quiz step in a path) opens as the page itself and the sheet lets go, after one question about any typing on the page and the sheet together.

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
| `map-model.ts` | The pure arithmetic: the map's height (and the scroller's room under it), the label placement (every star an obstacle at rest; each label's renderer slack, `LABEL_SLACK`, kept clear), the names around a focus (`focusLabelRequests`, exactly the card's `CARD_LINKS`), the domains' name points, backlinks, Start with, say-it-once (`whoSaid`, `bodySections`), the lines that tie a page to the studio and keep their sections for the visit (`studioLineKeys`, `unionKeys`), the glossary's letters. Tested in `map-model.test.ts`. |
| `vault-map.css` | The one stylesheet, prefix `vm__`, `--wk-*` tokens only. |
| `VaultLearning.render.test.tsx` | The whole design mounted on the Academy's real JSON: the map and its list, home → a star → its machine page → a topic it peeks → Open full page → Back → Back, a jump, a page that moved, the floor first, an unreadable floor, the Academy and the quiz, the phone's version switch; and the review's fixes (the map names only the card's links, focus after the card closes, the phone on the List, category code tags, the orbit's blue door, Linked here without the orbit, the machine body without its script and deep dive, the gutter by lens, the glossary's letters, a path's who said once, the quiz from Read alongside, one moment peeked with no false "lines that changed", chunks that didn't load, an unreadable floor for a studio's own machine, Keep editing keeping the peek) and the stylesheet's (no filled first stop, balanced labels, one column of pillars); and the last round's (Out of service and Flagged on rows, pages and a stand-in's peek, nothing said while unknown, the floor facts in place of counts, substitutes one way, a put-back beat line staying put, a section kept across the version switch and for head office's answer, the original's empty gutter room, a term's peek with no link to itself). |

Harness steps: `harness/learning-redesign/steps-vault.mjs`.

## What is shared, and what it would take

- Everything a page says comes from `pageFor`; every mark goes through `ArticleBlocks`; every link's reason is the graph's. This folder adds no words about the method and no rule.
- **`LocalConstellation` now draws the orbit alone** (`list={false}`, the integration pass, Oct 19 2026): its nodes then focusable, each named with its why. `MiniOrbit` still draws the page's band itself, because two things it does are not the shared orbit's: its middle is a door ("Map", the whole map focused here) where the shared centre is only the page's name, and every node shows its why under its name, in words, where the shared node shows the name alone (the why only to a screen reader). Moving to the shared component would lose both; a `centre` door and visible reasons on the shared orbit would let it.
- `LocalConstellation`'s centre now measures a name as it is written (capitals wider than small letters, `layout.ts labelWidth`), so "LEG PRESS" is never broken mid-word.
- **One thing a shared change would do better**: `ArticleBlocks` draws its gutter only on the studio's version, so the MSF original keeps the same room here with padding around the whole body. The words never move, but the Stop well's left edge does (48px). Drawing the gutter column empty whenever the reader has a studio's version (`gutter = annotate === "gutter" && vault.studio.id !== null && !compact` in ArticleBody, and its render test) would keep the well still too.
- A page opened from outside, and the reset (`resetSignal`: the Learning title on the Overview, or the section already on), move the trail with `useVaultNav`'s `set`, which does not ask a second time.

## What I would do next

- Let the map remember the trail across sections (today each section's body is its own), and draw the trail as a faint path on the map.
- A "Floor walk" lens on the Catalog map: the stations in walking order joined by a line, the clinical flags of today's clients lit (needs the session's flags, read-only).
- Label placement could try a fourth side (left/right for top-of-ring nodes) before giving up; today a crowded star simply goes unnamed on the map (it is still a target, and named in the list and the card).
- Measure the label widths after the first paint instead of guessing from character counts. The guess no longer covers anything (placeLabels keeps the renderer's slack clear), but a measured width would let a few more names fit, and a pill would hug its words.
