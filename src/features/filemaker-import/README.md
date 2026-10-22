# The FileMaker import

A client's FileMaker history (visits, machines, weights, reps) into Journey, written exactly as a finished session is, so every screen reads it with no second code path. Built Oct 12 2026 from the first three sample clients the FileMaker developer exported (AJ: "build a migration tool that works with our current files"). The round is `docs/rounds/2026-10-12-filemaker-import.md`.

**Read this before you change anything here, and before you run it against the real database.**

## The pieces

| File | What it is |
| --- | --- |
| `files.ts` | Reads an export: an Excel workbook (a ZIP of XML, read directly; the project has no Excel library) or a CSV / tab / FileMaker Merge file. Gives back rows of text, a date-styled cell as its day. Refuses a CSV with no column names on its first row (FileMaker's plain CSV). |
| `records.ts` | Which column is which (by name, prefix and case ignored), and what each cell says. **The swap lives here**: FileMaker's `NextSet` is the reps done and its `Reps` is next time's weight. The profile's `JSON` column (Mindbody's whole record, card details included) is never read. |
| `visits.ts` | What one entry means (`readSet`), what a visit is (`groupVisits`), and what a person should know about the data (`findingsOf`). |
| `machine-map.ts` | The machine table: which Journey machine each FileMaker name is, per studio, settled by a person. Suggests from Journey's own names for the twenty movements (`catalog/names.ts`). `tableProblems` checks a person's table before anything is planned: every machine on that studio's floor, no two rows claiming one name on a day. |
| `plan.ts` | One client's history as Journey documents (`planClient`) and the updates to the client's own documents that go with each batch of them (`clientWriteFor`). Pure. |
| `report.ts` | The dry run's words. |
| `scripts/import-filemaker.ts` | The only part that reads files and Firestore and writes. Its header is the safety model and the usage. |
| `scripts/lib/stub-assets.mjs` | Lets the script load `catalog/names.ts`, which reaches the machines' photos (Vite handles those; Node does not). |

## What an entry means

AJ's answers and what the sample charts show (Oct 12 2026):

| FileMaker | Journey | Why |
| --- | --- | --- |
| reps 1 to 20 | performed, those reps | |
| a weight, reps blank | performed, **reps not recorded** (`repsNotRecorded: true`) | FileMaker never fills a weight in by itself ("no trainer puts it in"), so the machine was done. Strongsville left reps blank on two thirds of one long client's entries. Counts toward weight progress, never toward a rep average. |
| reps 0, or a 0 for next time with no count | skipped, reason unknown | "zero in either column either means it wasn't performed. Or to take it out". A 0 for next time BESIDE a count is ignored: Solon wrote one beside eleven timed holds. |
| 30 to 120, on a machine that is held | a timed hold, in seconds (`isTSC`, `isStaticHold`) | Solon writes them in the reps column, unmarked (60, 90, 120); Strongsville's KM and KS since 2025. Over 120, or on Hip ADD, Hip ABD, Leg Curl, Pulldown, Lumbar or a Leg Press (`holdsAllowedOn`), it is a weight typed in the reps column: held back, said (the Strongsville audit, Oct 21 2026: 8 of 1,009). |
| a weight over 400, or 4× the client's usual on the machine (`implausibleWeights`) | held back, said | A typing slip that can run for months (2000 on 12 visits, 13137 on 11): corrected in a copy of the export BEFORE the import (`backups/filemaker/tools/correct-export.mts`), since an imported visit is never rewritten. |
| a count beside a weight of 0 | held back, said | A second unit under one name, or a bare sled (the audit: 7 lines). |
| a day in a year before 2000 ("12/12/0205") | held back as an entry with no date | A typing slip for 2025; read literally it sorted above every real visit. |
| a decimal on Torso Rotation | left and right (two logs) | Solon: "7.6" is 7 left, 6 right; "9.11" is 9 and 11. |
| a minus before any of these ("-10") | the same, without the minus | Willoughby's try at marking rep quality, at the weight of the visits either side (AJ, Oct 12 2026: "we dont have to mind that"). Said once in the dry run as handled. |
| 21 to 29, a decimal elsewhere, "7.1" (seven and one, or seven and ten: Excel drops a trailing zero), a side of 0 or above 20 | held back, said | can't be read safely |

A **visit** is a client's entries on one day (AJ: the date is the key). The same machine twice on a day keeps the first entry with something on it, in its own place in the order (a blank entry, or one with only next time's weight, never pushes one out), and holds a second such entry back; a machine with nothing written is left out and the visit still imports. A visit where nothing was done (every machine 0, blank or unreadable) is left out: a session with no set done would count as a visit that wasn't one.

## What it writes

- `sessions/fm_{client}_{day}`: Completed, the home studio as host (AJ: the studio a visit was at isn't needed), `legacy_filemaker_id` (History says "Imported"; the pre-launch reset keeps these), `rollupCounted` (the trainer-rollup trigger does nothing per document; rebuild trainers' counts once after), `createdAt` and `endTime` at **noon of the visit's own day** in the studio's zone. Never the import's time: the Hub, Insights, Hours, the month tally and the machine trends all read `createdAt`; the briefing's "Last session" reads `endTime`.
- `exerciseLogs/{session}_{machine}[_Left|_Right]`: the id Journey derives for a set; `machineSettings: {}` (FileMaker keeps today's dials, not that day's).
- The client document: `completedSessions` up by what was created; `priorHistory.importedCount` raised by the same when a person stated a total (`recordImportedSessions`, the importer's contract); `sessionCount` set as the profile's reconciler sets it (Journey's Completed sessions plus what the stated total still holds uncounted), so a stated total stays the total and Start numbers the next session after it; `lastSessionDate` only forward; `lifetimeReps` / `lifetimeWeight` as Finish counts them; the trainer tally added to what is on file; `legacy_filemaker_id`.
- `clients/{id}/machineTotals/current`: the machine stats (the importer's rollup) and "last time" per machine, never over a newer one.
- `clientMachineSettings/{client}_{machine}`: next time's weight (FileMaker's when set, else the last weight done), never over a newer one; a starting weight only from the machine's first FileMaker day, and only when FileMaker holds the client from the first visit.

Every id is derived: a second run writes nothing it wrote before. The sessions go in batches of whole visits, **each batch in one transaction with the client's documents** above, read in the same transaction: a stop leaves all of a batch or none of it, never sessions without their counts, and a batch whose sessions are already there writes nothing.

## What it never does

- **Makes a client.** A client is found by Mindbody id and site (`lib/mindbody-site.ts`), never by name; one not in Journey is reported, and the report prints Journey's name beside FileMaker's.
- **Imports a client Journey already holds sessions for.** Journey numbers its own from 1, and the imported numbers would clash: import before a client's first Journey session, after the pre-launch reset. Also left out, and said: a client whose earlier imported sessions are gone from the export (or after `--through`), and one whose numbering has moved since an earlier run.
- **Imports a day Journey owns**: nothing after `--through` (the day before the studio's switch-over; a `--through` on or after it stops the run).
- **Guesses a machine.** While any visit has a FileMaker name nobody has matched, the client waits whole (a gap in the numbers would be filled twice by Start, which numbers from the count); `--allow-waiting` writes the other clients. The draft table fills in only sure matches (the same name on the floor, or a movement's own name with one unit of it); "Leg Press Imag." beside "Leg Press Hoist" is a person's call.
- **Writes without the dry run's number, or over a client Journey already holds sessions for.** `PRODUCTION_IMPORT_READY` was switched on for the Strongsville import on Oct 22 2026, once its three conditions were met: the reset ran for Strongsville that morning (`reset-test-data.ts --studio`), the full export carries the trainer per visit, and AJ gave the go on the wave 1 dry run (`docs/rounds/2026-10-21-strongsville-import.md`). The app side was ready since the history-ready round (Oct 12 2026: the session screen reads a window of a client's sessions, and every reader of reps understands "reps not recorded", asking `lib/set-outcome.ts` `repsOf` / `isRepsNotRecorded`). What still guards a run: `--commit --expect N` with the dry run's number, a client with a Journey session of her own refused, a `--through` on or after the studio's cutover refused, a machine table with a mistake stopping it, and a client waiting whole while any of her names is unmatched (`--allow-waiting` writes the others).

## Numbering

Imported sessions are numbered in date order from 1 with no gap, or from the stated total before Journey when a person has stated one (`numberOffsetFor`). A visit is numbered only once it imports (the client waits whole while anything waits), and a run whose numbers differ from what an earlier run stored stops for that client. Without a stated total the numbers start at 1 even for a client whose FileMaker history starts years after the first visit (one Strongsville sample: Mindbody since 2020, FileMaker since late 2023); the dry run says so for each such client. Screens that claim "#N" go through `lib/history-claims.ts`, which judges coverage from Mindbody's count, not from these numbers.

## Running it

From the project folder, in PowerShell (it needs `service-account.json`, like the other data scripts):

```
npx tsx scripts/import-filemaker.ts "C:\Users\austi\Downloads\ClientProfile.xlsx" "C:\Users\austi\Downloads\ClientWorkouts.xlsx"
```

1. The dry run reads Journey, writes nothing, and saves `backups\filemaker\machine-table.csv` and a report.
2. Open the machine table in Excel. Fill in every blank "Journey machine" (an id from Suggested or Note, or `skip`). Use From / Until when a studio replaced a machine under the same FileMaker name. Save as CSV.
3. Run again with `--map backups\filemaker\machine-table.csv --through 2026-10-11`.

The rehearsal on a throwaway emulator (nothing real touched): see the script's header.

## When FileMaker named a client's machines wrongly: client rows and `--relabel`

**FileMaker's export can name a machine wrongly while the chart a trainer reads is right.** Allan Boike's trial import (Oct 13 2026, Strongsville) put his weights on the wrong machines: from Aug 24 2024, the week Bicep, Lateral Raise and Chest fly joined his routines, the export's `MachineName` was shifted round eight machines ("Abs" was his Chest Fly, "Chest fly" his Pulldown, "Pulldown" his Pullover, "Pullover" his Overhead, "Overhead" his Lumbar, "Lumbar" his Abs, Seated Dip and Comp. Row swapped). The weights and the order were right. It was proven against his session in Journey that day and his FileMaker chart, and every machine's weight runs straight through the change once the names are put right. AJ: machines are also named differently for some clients at one studio, and FileMaker holds "data in the wrong field".

- **Client rows** (`machine-map.ts`): the table's "Client" column takes a Journey client's id. Such a row is that client's alone and wins over the studio's row on the days it claims (From / Until); every other day the studio's row answers. The import reads them like any other row.
- **`--relabel`** (the script): for a client already imported, run the same files with a table that has the client's rows. It plans the visits with the studio's rows (what was written) and with the client's (what should have been), and `relabel.ts` moves each set to its machine. It refuses, for that client, if Journey's sets aren't exactly what the import wrote, if anyone edited a visit, or if the corrected names would add or drop a set rather than move one. "Last time" and next time's weight change only where the import put them: anything a person set afterwards, or Journey's own sessions wrote, stays. The machine stats are worked out again from every session (the profile's own backfill, `rollupFromHistory`). It saves what it changes to `backups\filemaker\relabel-backup-*.json` first. Dry run, then `--commit --expect N --trial`.
- **There is no way to tell from the numbers alone** which client's export is wrong: it took a real session and the chart. The full export must take each line's machine from where the chart takes it (asked of the developer, Oct 14 2026).

## Still to come

- **Notes**: the profile's standing note is reported, not imported, until AJ answers how loud imported notes come in.
- **The full export** adds the client id on every workout line, the trainer per visit, the list of workouts (the Solon sample has 8 workouts with nothing entered that only the list would carry), and the per-client machine settings. The reader already looks for `__ID_Client` and a trainer column on the lines.
- **Machines replaced under one name** (a Strongsville sample's Pullover, Abs and Overhead in October 2024) need the studio's dates in the machine table, and a retired unit on the floor to point the old history at.
