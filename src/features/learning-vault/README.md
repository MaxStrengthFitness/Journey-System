# The Learning vault — the parts every redesign draws

Round: the Learning vault redesign, Oct 19 2026 (overnight prototypes; the round
document is `docs/rounds/2026-10-19-learning-vault-redesign.md`). AJ asked for
Learning to become "a living, interconnected resource for the entire company",
with three designs to pick from in the morning, per-studio markup over the MSF
original, a way to tell head office a line is wrong, Teams links, Life
Transformer playbooks, and "a little game mode in learning where its a quiz mode
that just gives information from the academy and even the renaissance of
exercise".

The three designs (`src/features/learning-redesign/{codex,vault,course}/`) are
layouts. Everything they share lives here once: the pages, the words, the rules
for marking a line, the quiz, the graph. A design never re-implements any of it,
so whichever one AJ picks, the behaviour is the same and only the furniture
changes.

**Nothing here reads or writes Firestore.** Every mark, note and submission goes
to an in-memory sandbox store (`markup-store.ts`), seeded with sample marks
(`sample.ts`) so a fresh prototype shows what markup looks like. The local
`.env` points at production, so a prototype that wrote would write real
records. Persisting is a separate round, after AJ picks (below).

## The parts

| Part | Files | What it does |
| --- | --- | --- |
| Shapes | `types.ts` | Pages, blocks, markup, submissions, entities, the graph, the rep model, the quiz, playbooks, the viewer. Types only. |
| Pages | `pages.ts`, `routes.ts`, `useVaultData.ts`, `useVaultNav.ts` | `pageFor(route, data)` builds any Learning page once (a machine in four tiers, a module, a topic, a quick card, a script, a deep dive, the glossary, the phrasebook, a playbook), or says `"loading"` / `"gone"`. `useVaultData` loads the Academy chunks the existing hooks load, on demand, and builds the entity index, the graph and the quiz bank once they land. `useVaultNav` is a trail of routes where every move asks the unsaved-changes gate first (`set` for moves the app already asked about). |
| Blocks | `blocks.ts` | A line's key is made from its WORDS (`blockKeyFor`, FNV-1a over the normalised words), never its position, the same call `safetyLineKey` makes for a machine's safety lines. A rebuilt corpus can move lines and rename ids; a mark stays on the sentence it was made on, and a sentence whose words changed shows as an orphan instead of the mark landing on a different line. |
| Studio markup | `markup.ts`, `markup-store.ts`, `ui/VaultProvider.tsx`, `ui/VersionToggle.tsx`, `ui/ArticleBlocks.tsx`, `ui/BlockActions.tsx`, `ui/StrikeForm.tsx`, `ui/NoteForm.tsx`, `ui/OrphanMarks.tsx`, `ui/line-actions.ts` | "{Studio}'s version \| MSF original" on every article. A studio leader crosses a line out with a REQUIRED reason (`reasonIsEnough`, 3 to 300, the same gate as taking a safety line off a unit, `admin/machines/editor/safety-removal.tsx`); the line stays visible, struck, with what the studio does instead, why, who and when; "Hide crossed-out lines" is opt-in; "Put it back" undoes it. Anyone who works at the studio writes a note on a line. Every form opens in place under its line (InheritedSafety's manner: "Nothing here is a dialog") and registers with the unsaved-changes gate. |
| Head office | `submissions.ts`, `ui/SubmitForm.tsx`, `ui/SubmissionQueue.tsx` | Anyone can tell head office a line is wrong ("Dispute this") or offer more ("Add to it"), with proposed wording. Head office's queue groups them by page and shows how many studios crossed out the same line, a count with each studio's reason one tap away (a count is not a score). |
| Teams links | `learning-link.ts`, `share.ts`, `ui/ShareForm.tsx` | A link to a page, or to one line (`?section=<blockKey>`), in the unmerged deep-link branch's grammar (`/l/{kind}~{id}`, `claude/oct19-teams-link-795436`, `src/features/deep-link/parse.ts`). "Ask in Teams" opens the iPad's share sheet (Teams is on it), with Copy link always there. The app never posts and never pings anyone ("In-app only, for now"). "Keep client names out of Teams." When both branches land, the deep-link parser must learn to read `section` (a few lines in `parse.ts`; `parseLearningLink` here is the reading to copy). |
| Concept cards | `entities.ts`, `concepts.ts`, `plain-sense.ts`, `ui/ConceptLayer.tsx`, `ui/LinkedText.tsx` | Glossary words, machines, the method's named rules, clinical flags, topics and playbooks link wherever they appear. A tap opens a card anchored to the word, and words in the card open the next card, three deep (Crusader Kings III's nested tooltips), with a pin to keep one open. Everyday senses do not link ("positive feedback", "career path": `plain-sense.ts`). Clinical cards say names and counts only, never the matrix's instruction text (some of its lines wait on AJ's ruling). `wiki.css` records a reason against popover glossary cards ("a popover on an iPad covers the sentence you were reading"); these cards sit above or below the word and close on scroll unless pinned. |
| The graph | `graph-index-build.ts`, `graph-index.json` (built by `scripts/build-learning-graph.ts`, `--check` to verify), `graph.ts`, `layout.ts`, `ui/LocalConstellation.tsx` | Every machine, method word, equipment word, module, topic, cue moment, clinical flag and playbook is a node; every edge says why ("is part of a set that can replace", "is cued at", "talks about"). Substitutes are SETS that together replace a machine (`EXERCISE_SUBSTITUTES`), never one-for-one. A machine's own neighbourhood (`constellationOf`) shows them ONE way only, what stands in if this machine can't be used; the sets it helps replace another stay on the map (`reverseSubstitutes`), never on its page (judges' fix, Oct 19 2026). The excluded sources (suggested starting weights, Research, MSF OVERVIEW, the consultation script's prices) are never a "Comes up in" target. Layout is deterministic, every node a 40px+ target, and every map has a list beside it. |
| The floor's status | `floor-care.ts`, `ui/FloorStatus.tsx` | Out of service (the roster) and Flagged (Relay's care record, through Relay's own `useMachineCare`: one listener a Learning screen, no new query or index), as the Catalog says them: `useVaultData`'s `care`, by machine id, null while either read is unknown or failed (never "all fine"). `<FloorStatus variant="chip">` on a row, `variant="banner"` at the top of a machine page, in the Catalog's words and plum (judges' fix, Oct 19 2026). |
| The peek | `ui/PeekSheet.tsx` | A second page under your thumb (a bottom sheet inside `<main>` on an upright iPad and a phone; a dock beside the page from 1024px), with a breadcrumb of what you peeked, Back, Open full page and Close. |
| The machine in tiers | `codex-reader.ts` | The Codex v2 leaves (`machine-codex/format.ts`, `methodLines`) read for trainers at last, in four depths: Floor glance (stop, set up, get set, begin), Script & cues (the rep, finish, the spoken script, the moments that fit its turnarounds), Adapt & clinical (if something goes wrong, adapt, faults, the flags that name it, and "If {machine} can't be used": its substitute sets, one line a set, "Leg Extension + Leg Curl + Hip Abduction"), Deep science (understand, program it, the quick card's muscles, the deep dive). |
| The repetition | `rep-phases.ts`, `cue-label.ts`, `ui/RepScrubber.tsx` | The Academy's window: 6 to 10 seconds up and 6 to 10 down, a 12-to-20-second cycle (6 the house default), never "a 20-second rep". Three first reps (a load-up into an end stop, a load-up into a squeeze, a handoff), each phase with its rule, its source and the phrasebook's lines for that moment. |
| The quiz | `quiz/`, `ui/QuizMode.tsx` | About 300 questions in eight decks. "Quick ten" deals from the method's six decks only, never the playbooks (drafts head office has not read), which stay a deck of their own. Generated ones are mechanical (a glossary word and its first sentence, a cue and its moment, a script's beats in order); written ones each carry the exact quote that proves them, and a test fails if the quote is not in that topic. The Hutchins deck paraphrases the definition of exercise (as `docs/business/the-floor.md` records it) and what Journey built from each clause; a test fails on any six-word run of the definition. The Renaissance of Exercise itself is not in the repo, and AJ's rule is to paraphrase it with a book reference, never quote it. Nothing is stored, ranked or compared; a round ends with "N of 10 this round" once and the questions missed, each with Read it. A miss is never crimson. |
| Playbooks | `playbooks/` | Nine Life Transformer pages written from Journey's business notes (the twenty minutes, why every rule exists, the kit, first sessions, Pulse, packages, FORD, the progress report, renewals) and seven reading paths. Every line cites `path:line`. The four P's are always "Posture, Pace, Path, Purpose", the Academy's and the code's order (`FOUR_PS_TITLE`). Every page is a DRAFT: "Corporate owns the method, so corporate reads it before adopting it". No prices; each studio's are its own. |

## The words a reader sees

"{Studio}'s version", "MSF original", "Cross out for {Studio}…", "Why does
{Studio} cross this out?", "Put it back", "Note for {Studio}", "Tell head
office", "Ask in Teams", "Lines that changed since {Studio} marked them".

## What it would take to keep the marks (the next round, after AJ picks)

This is a Firestore structure change, so it needs AJ's explicit OK (CLAUDE.md:
"Don't change … the Firestore structure without an explicit OK").

- **Strikes**: a per-page markup document in the studio's own wiki,
  `studios/{studioId}/wiki/markup__{type}__{id}`, a new `kind: "markup"`. The
  rule pins `kind`, lets only studio leaders and administrators create or
  change it, caps the strike list, and never lets it be `shared` (sharing
  exposes a whole document). The overlay document cannot carry strikes: its
  rule lets any trainer write it (`comments-rules` reader report §7A).
- **Notes on a line**: one document per note, so a trainer can only edit their
  own (the comments feature's shape), either `studios/{s}/comments` with a new
  optional `block: { key, quote }` (its `commentValid` is a `hasOnly` list, so
  the rule changes) or a sibling collection.
- **Submissions**: `learningSubmissions/{id}`, created by anyone signed in at
  their studio as themselves (the Auth uid), status pinned to `pending`, read
  by administrators across studios and by the author; decided by
  administrators only. Indexes: `(status, at)` for the queue, `(by.uid, at)`
  for "mine".
- **Head office's signal**: a collection-group read of `wiki` where
  `kind == "markup"` (a new `COLLECTION_GROUP` index), administrators only.
- **The store** keeps its interface (`MarkupStore`); a Firestore-backed store
  replaces the sandbox behind it, and every screen stays as it is.

## Tests

Pure logic beside its file (`*.test.ts`); every component that works in render
has a `*.render.test.tsx`. `vault-integration.test.ts` builds the vault from the
real corpus and follows every route one part hands another (concept-card
buttons, graph nodes, track steps, related pages, quiz Read it links) to a page
that draws. Every stylesheet here is held by `wiki/learning-scale.test.ts`,
`wiki/learning-tokens.test.ts` and `css-vars-declared.test.ts`.
