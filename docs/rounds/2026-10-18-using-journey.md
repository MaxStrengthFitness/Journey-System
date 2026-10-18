# Using Journey (Oct 18 2026)

A shelf of short pages, one for each thing a trainer does in the app, in the words on the screen. It is where AJ's app tutorial lives.

## Why

On Oct 18 2026 AJ listed ten reasons trainers open the Academy. Two of them, 9 and 10, were about learning the app itself. The Academy is corporate's method, so it should not hold app help. The answer is a separate shelf that Claude writes and AJ approves, kept current by every round that changes a screen. Before this round, no trainer guide covered the briefing, the Wrap-up, Pulse, the report, InBody or Demo Mode. The only one was `docs/ops/TRAINER-QUICK-START.md`, at 470 words.

## The plan and AJ's answers

Plan page: `claude.ai/artifact/4RXAefQo9jn72WvCHZ8PgT`. AJ answered **1a 2a 3b** on Oct 18 2026:

- **1a**: trainers read the pages in the app, in a fourth Learning section beside Catalog and Academy.
- **2a**: the floor six come first, AJ walks them, then the other eight follow.
- **3b**: keeping a page current is a reminder, never a failing round.

## Phase 1 (this round): the shelf and the floor six

- `docs/using-journey/`: the README (how a page is written, approved and kept true) and six draft pages.
- `src/features/using-journey/shelf.ts` and its test hold each page to its shape: a header, one question, `covers` paths that exist, 120–350 words and no code words.
- `scripts/using-journey-check.ts` is the reminder. It lists drafts, pages reworded since AJ's yes, and pages whose screens changed since. Its `--approve` (dry run unless `--commit`) writes AJ's yes.
- No change to the app. Nothing reads or writes Firebase or Mindbody.

The facts were checked in the code, not only in the READMEs. Four places where the notes lag behind the app were found, and they get fixed when their page is written:

- `docs/business/the-floor.md`'s Wrap-up section predates the Oct 18 Wrap-up round.
- A comment in `rating/Loudness.tsx` says "three weeks" for a Heads up. The rule is four sessions.
- The progress report's README says five steps. The code has six, counting the printed page.
- A broken machine can be reported two ways: a floor note on the client's card, or Report a problem on the studio's card. That question is open with AJ, and `machine-cards.md` has a marked line waiting on it.

## Next

1. AJ reviews the six on the review page, then walks them on the iPad. After his approvals: `npx tsx scripts/using-journey-check.ts --approve <page>.md --commit` for each page.
2. The other eight pages.
3. The Learning section (1a), built from approved pages only.
4. Ask the Academy reads the shelf, after its own server and screen phases.

Using Journey: six pages added, all draft.
