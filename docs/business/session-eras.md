# The two eras of a client's sessions: FileMaker's and Journey's

*Oct 22 2026, Stage 3 of the Strongsville import (`docs/rounds/2026-10-21-strongsville-import.md`). AJ's decision (a), Oct 21 2026: FileMaker sessions count everywhere for now, with a visible "from FileMaker" tag. In a few months (b): trend and average measures move to the Journey era only. Read `docs/business/migration-and-prior-history.md` first: the total, the numbering and "a client's history did not begin when Journey first saw them" are unchanged by anything here.*

## The one place the era is read

`src/lib/session-era.ts`. Nothing is stored for it: the era is **derived at read time** from the marks the importer writes (`legacy_filemaker_id` on the session, the `fm_` session id, and for a set its session id) and the older chart imports' marks.

- `eraOf(session)` → `"filemaker"` or `"journey"`. `client-history/model.ts`'s `isLegacySession` is this.
- `eraTag(session)` → the words every list shows beside a FileMaker session, `"from FileMaker"`, or null.
- `TREND_ERA` → `"all"` today (decision (a)); `"journey"` is decision (b). **Switching to (b) is changing that one word.** Every measure below asks `inTrendEra` once, and that call is the line that honours it.

## Where the tag shows

Every list of a client's sessions says "from FileMaker" beside a FileMaker one, in words, 11px or more, no colour of its own: History's rows and the session pop-up (`client-history/HistoryList.tsx`, `SessionDetailDialog.tsx`, where "Imported" used to be), the header's Last session list (`client-profile/session-lists.ts`, in place of a start time, which a FileMaker session never has), the Journey grid's column headers under the date (`journey-grid/JourneyGrid.tsx`, `jg-head__era`), and the machine card's session list beside the day (`machine-menu/timeline-words.ts`).

## The measures decision (b) changes, one call each

| Measure | Where the call is | What (b) does to it |
| --- | --- | --- |
| The Journey grid's five aggregates (first, low, high, most reps, fewest reps) and the trend arrows between sets | `journey-grid/stats.ts` `orderedSets` | reads Journey's sets only; the cells still draw every session |
| The Staircase (the machine card's weight runs and its line) | `machine-menu/step-runs.ts` `stepRuns` | the runs from Journey's columns only; the session list under it still shows every column, tagged |
| The progress report's windows, totals and averages (sessions in the window, total reps and volume, average session and rest) | `lib/progress-utils.ts` `sessionsInWindow` | the window holds Journey's sessions only |
| The Deep Dive: the baseline, the effort trend, the stalls, "worth asking why" | `clinical-review/facts.ts` `buildFacts` | the facts are Journey's sessions only (the Deep Dive already counts Journey-only measures from the cutover, Oct 14 2026) |
| Machine trends and the Kaizen reports (the weekly job, Learning → Catalog → a machine → How it's used) | `machine-trends/trends.ts` `createTrendsAccumulator` `add` | the sets of Journey's sessions only, by the set's session id |
| The performance watch (Operations → Today's drops) | `admin/overview/performance.ts` `createPerformanceAccumulator` `add` | the sets of Journey's sessions only, by the set's session id |

## What stays whole under (b), on purpose

These are counts and records, not trends or averages, and a FileMaker session is a real session (`migration-and-prior-history.md`):

- **The session total and the numbering** (`lib/session-total.ts`, `lib/history-claims.ts`, `lib/prior-history.ts`): total = Journey's sessions (imported ones included) + the prior record's uncounted. A client with 48 imported, 2 of her own and a stated 183 reads 185 and starts #186 (`lib/session-era.test.ts`).
- **The machine totals** (`features/machine-totals/`): how many times, the last time, the current weight.
- **The trainer rollups and the month tallies**: an imported session carries the trainer's initials and `rollupCounted`.
- **InBody due**: sessions since the last scan.
- **Attendance, the client states and All stars** (`renewals/attendance.ts`, `hub-opportunities/`): they judge the weeks after the studio's cutover, which no FileMaker session falls in.
- **Your week and My clients** (`trainer-profile/your-week.ts`): already Journey-only, since an imported session carries no trainer id and no time.

## The Wrap-up's "last time"

The Wrap-up compares today's set with the client's previous set on the machine (`lib/post-session.ts`). Under (a) that previous set may be a FileMaker one, which is right: it is the last time she did the machine. Under (b) the question is open: a client's first Journey session after the import would otherwise read "first time" on every machine. It is not on the one-call list for that reason; decide it with (b).

## How to turn (b) on

1. `TREND_ERA` in `src/lib/session-era.ts` from `"all"` to `"journey"`.
2. `lib/session-era.test.ts` already covers both words; the measures' own tests hold their answers under `"all"`, so read the ones that fail for what they say.
3. Say it in this page and in `CLAUDE.md`'s decision line.
