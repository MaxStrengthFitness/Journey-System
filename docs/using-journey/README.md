# Using Journey — the trainers' guide to the app

One short page per thing a trainer does in Journey, in the words on the screen. This is where AJ's app tutorial lives. Plan page: `claude.ai/artifact/4RXAefQo9jn72WvCHZ8PgT`; round document: `docs/rounds/2026-10-18-using-journey.md`.

**Two shelves, two owners.** The Academy (`docs/msf-academy/`) is Max Strength's method in corporate's words. This shelf is how the app works: Claude writes it, AJ approves it. A page here never teaches the method (cadence, cues, loads, progressions); it points to the Academy instead.

## AJ's answers (Oct 18 2026: "1a 2a 3b")

- **1a** Trainers read it in the app: Learning gets a fourth section, Using Journey, beside Catalog and Academy, found by Learning's one search. Not built yet.
- **2a** The floor six first (finding your way, running a session, the briefing, the Wrap-up, notes, the machine cards). AJ walks them on the iPad, then the other eight.
- **3b** Keeping a page current is a **reminder**, never a failing round. See "Keeping it true".

## A page

One Markdown file, its name the page's slug. It starts with a header trainers never see:

```
---
title: The Wrap-up
question: What do I do while I walk them out?
covers: src/components/WrapUpScreen.tsx
status: draft
approved:
---
```

- `covers` names the folders and files of the screens the page describes, comma-separated. They must exist.
- `status` is `draft` until AJ approves it. Then `approved: yyyy-mm-dd · fingerprint`, written by the script below. The fingerprint is of the words as AJ read them, so a changed word shows up.

**Writing one.** 120 to 350 words (aim for 150 to 300). The labels exactly as the screen shows them, in bold. "The client" and "they", never a guessed pronoun. No code: no file names, no code-style names, no backticks, no builder words (Firestore, webhook, query...). Say what the app never does where a trainer might expect it to (pick a weight, book, ping). `src/features/using-journey/shelf.test.ts` holds all of this except the tone.

**Facts come from the code, not the READMEs.** Where a README and the screen disagree, the page follows the screen, and the README gets fixed. Check each label with a search of `src` before writing it.

## AJ approves a page

1. Drafts go to AJ on a review page (an artifact with Approve / Change this per page and a note).
2. After his Approve, run `npx tsx scripts/using-journey-check.ts --approve <page>.md --commit`. It writes `status: approved` and the fingerprint of the words as they are, so run it only on the words he approved.
3. A page edited after that keeps its approved line, but its fingerprint no longer matches: the reminder lists it, and the app (once it shows the shelf) keeps showing the last approved words until AJ approves again.

## Keeping it true (AJ's 3b)

- A round that changes a screen a page `covers` updates that page in the same round, and its round document says which page, or "no change a trainer would see".
- At each wrap-up, run `npx tsx scripts/using-journey-check.ts`. It lists drafts waiting for AJ, pages reworded since his yes, and approved pages whose `covers` have commits since the day he approved them. It writes nothing and never fails.
- The test fails only on a page's shape (header, length, code words, a `covers` path that's gone). Those are the writer's mistakes, never a screen's change.

## Pages

| Page | Status |
| --- | --- |
| `finding-your-way.md` | draft |
| `running-a-session.md` | draft |
| `the-briefing.md` | draft |
| `the-wrap-up.md` | draft |
| `notes.md` | draft |
| `machine-cards.md` | draft; its last line waits on AJ: a broken machine is reported two ways today (a floor note on the client's card, Report a problem on the studio's card) |

Still to write (2a, after the walk): what a session teaches you · Pulse · the progress report · InBody · Demo Mode · training at another studio · what's still done in Mindbody · the numbers Journey keeps. Then `docs/ops/TRAINER-QUICK-START.md` folds into the first two pages and retires.

AJ's own words for those pages (his Ask the Academy grading notes, Oct 18 2026):

- **Pulse**: "the life survey for the client, how much sleep, protein, water, mood and other things."
- **What's still done in Mindbody**: "confirm appointments and schedule future sessions with clients and to change any client profile info."
- **Demo Mode**: "learning and testing the app."
- On "How do I run a session in Journey?" he wrote "we will make this": this shelf owns that question, never the Academy.
- Late cancels are studio policy, not app help (cancel at least 24 hours ahead or the session may be lost, the trainer's call: "we let things slide sometimes"). A page says how to mark one, never the policy.

## Later

- **The Learning section (1a).** A build step like `scripts/build-academy-content.ts` turns approved pages into content the app ships, taking only pages whose fingerprint still matches (`isApprovedAsWritten`), and keeping the last approved words of a reworded page.
- **Ask the Academy** (`oct16/ask-the-academy`). A second, labelled shelf: page ids `guide:<slug>`; an answer groups its points under "From the Academy" and "Using Journey", never mixed in one point; only approved pages. Waits on Ask the Academy's server and screen phases.
