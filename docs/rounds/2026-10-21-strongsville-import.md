# The Strongsville mass import (Oct 21 2026 →)

AJ, Oct 21 2026: a full FileMaker workout-history import for Strongsville in three stages, his yes between each. **Stage 1** (the audit, read-only) is done; its report is `backups/filemaker/audit/DISCREPANCY-REPORT-2026-10-21.md` (gitignored: client names) and AJ approved its rules table with its defaults the same day. **Stage 2** is the reset of Strongsville's sessions, one studio at a time; this page is its plan, written before any code. **Stage 3** is the import itself.

Decision (a), AJ, Oct 21: FileMaker sessions count everywhere for now, with a visible "from FileMaker" tag; in a few months (b) trend and average measures move to Journey-era only. So the era is derived from `legacy_filemaker_id` at read time, and Stage 3 lists each measure that (b) would change.

## What Stage 1 found, in six lines

- The export: 107,622 lines, 268 clients, 15,720 client-days, Nov 2023 to Oct 2026, with the client id, the trainer and a visit note on every line (new since the trial files).
- The importer's dry run with the studio table as it stands: 109 clients ready (9,650 new sessions, 65,737 new sets), 16 waiting on the table (Cx mostly), 7 stopped by their own test sessions, 136 not in Journey or without a Mindbody id.
- The chart-row-order name fault is still in the export and is one studio-wide wave (Aug 12 to Nov 4 2024) in one order: 51 clients flagged, 24 of them among the ready 109. No client first seen in 2025 or later has it. Only a chart proves a client; those 51 are held until AJ reads three or four chart row orders.
- Thirteen weight typing slips (47 cells) and one date (year 0205 = Dec 12 2025) are corrected in a copy of the export before the import; 1,001 of 1,009 high rep counts are real timed holds.
- 125 exported clients have no Journey record (former clients outside the six-month onboard window), 11 have no Mindbody id (staff, tests, and three split profiles), 4 are filed at another studio.
- Numbering: 21 clients whose story predates FileMaker need their prior total stated by a leader before import, or their cards read #1.

## Stage 2: the reset, one studio at a time

### What AJ asked

"Strongsville's existing sessions (hand-imported and test) get wiped with `scripts/reset-test-data.ts`, which also clears session-written notes, FORD, machine totals and counters; it keeps clients, trainers, studios, contracts and packages. I want to be able to reset ONE studio at a time, so add a `--studio` option to the script (script change only, dry-run by default, `--expect` count, backup and `--restore` kept; list any clients booked at one studio but filed at another in the dry run rather than skipping them silently), with a test. Show me the dry run and ask which optional groups to keep (I lean to keep routines and the machine settings trainers set). Back up before committing. Nobody is using the app yet; it is four trainers at one studio."

### What the reset is today

`scripts/reset-test-data.ts` reads every relevant collection whole (no query, no index), hands the lists to `src/lib/test-reset.ts` (`planReset`, pure, 693 lines of tests), prints what it would delete or change part by part, and writes nothing without `--commit --expect N`. The backup and the way back are `src/lib/test-reset-codec.ts` and `--restore`. It has no notion of a studio: its scope is "every session outside Demo Mode". Read `docs/ops/RESET-BEFORE-LAUNCH.md` for the whole of it.

Two things in it matter for a FileMaker re-import, found in Stage 1:

- The `imported-history` group deletes imported sessions and their sets but leaves the client's `legacy_filemaker_id` and `priorHistory.importedCount` as the import set them (noted Oct 12; still so). No Strongsville client has a prior record today, so only the id would be left behind, but a later reset after Stage 3 would leave clients counting short.
- The trial clients' machine set-ups carry the weights the October imports wrote (current, starting, next), and two of those clients (Allan, Lynne) were imported under the wrong machine names. Stage 3 writes a weight only when the set-up is older than the visit, so those weights would block the right ones.

### The design: `--studio <id>`

**One option, reset-only:** `--studio BVDDRe5AqQZFihRLW0vK` (a studio's document id; a name or an unknown id prints the studios and their ids and stops; `--restore` refuses it). Without it the script does exactly what it does today, so the pre-launch reset of every studio is unchanged.

**The scope** (`ResetOptions.studioId`, decided in `test-reset.ts` from plain data, so it is tested without a database):

| Record | In scope when |
| --- | --- |
| A client | `homeStudioId` is the studio |
| A session | its client is in scope, **or** it was hosted at the studio (`studioId`) for a client filed elsewhere |
| A set, a session note, a FORD detail, an incident, a Seen mark, a reminder | tied to a session in scope, or (a session-time note with no session id) to a client in scope |
| Machine totals, counters, dates, the renewal snapshot fields, the FORD summary, the Pulse snapshot, the B switch, the prior record | the client is in scope |
| Client states, the Journey summary, All stars, month tallies, floor notes, watch list, cases, day logs, renewal conversations, other Seen marks | under `studios/{the studio}/…` |
| Routines, plan changes, routine change records, progress reports, focuses, machine set-ups, setting history | the client is in scope (setting history by its client, else its studio; one with neither is left and counted) |
| Trainers' old counts map (`trainers/{id}.rollups`) | the trainer coached a session going (so a delete trigger can't copy it back), as today |
| Trainers' counts document (`trainers/{id}/stats/rollups`) | **not deleted with `--studio`**: a trainer's counts span studios, and the delete trigger takes each going session off by itself (the script's settle wait stays). The follow-up list says to press **Rebuild trainer rollups** on Admins → System tools once |
| Old leaderboards | left alone with `--studio` (nothing reads them; they are not one studio's) |
| Demo Mode | left out, as today; `--include-demo` with `--studio` is refused (Demo Mode has its own Reset) |

**Booked here, filed elsewhere, and the other way round.** The dry run prints two lists before the counts, ids and counts only, never a name:

- *Hosted at this studio, filed at another:* each client id, the studio they are filed at, how many sessions. These sessions **are taken** (they are this studio's test data; Bruce Stone's 27 FileMaker visits are not in Journey yet, so today this list is the test sessions only), and the client's counters go back with them like anyone's.
- *Filed at this studio, hosted at another:* each client id, the studio that hosted, how many sessions. Taken too (they are this studio's client's).

Nothing is skipped silently; both lists are in the backup's manifest. Bookings are Mindbody's and are not touched; `scripts/find-wrong-home-studio.ts` (read-only, exists) is the sweep for bookings at one studio against a home at another, and the Oct 20 home-studio notice on Operations → Today is where a leader moves such a client.

**The cutover check** looks at this studio alone with `--studio` (today any studio with a cutover date refuses a commit). Strongsville has none set; nothing changes there.

**When the test sessions began** (`sessionEraStartMs`, which every date rule needs) is read from the sessions in scope; a second run reads it from this studio's earlier backup (the manifest carries `studioId`, and `earlierEraStart` matches on it).

**The open-session check** looks at sessions in scope only.

**`imported-history` gains a part** (both with and without `--studio`): on each client whose imported sessions go, `priorHistory.importedCount` comes down by the number deleted (never below 0; a record a trainer typed otherwise untouched), and `legacy_filemaker_id` is cleared. Field changes, in the same write as the counters, backed up and restored like any other field.

**The backup** is the same `backups/reset-<stamp>/` folder; the manifest gains `studioId`, `studioName` and the two cross-filed lists. `--restore` is unchanged and needs no scope: it puts back exactly what the backup holds.

**What a run prints**, in order: the target (PRODUCTION …), `STUDIO: Strongsville Ohio (BVDD…)`, the groups, the two cross-filed lists, then the plan part by part exactly as today, the era start, the open sessions, `PLANNED: N documents` and the `--expect N` line.

### The groups for Strongsville, and the recommendation

| Group | Recommendation | Why |
| --- | --- | --- |
| *(always)* | | the test sessions, their sets, notes, FORD, totals, counters, the job's documents |
| `imported-history` | **take** | the ten trial clients' imported sessions (Allan's and Lynne's under the wrong names, Pam's already corrected); Stage 3 writes all of them again from the full export, right |
| `settings` (the weights only) | **take** | the weights on the trial clients' set-ups came from the October imports and would block Stage 3's; the dials (seat, pads, belt) a trainer or the chart tool set **stay**, which is what AJ leans to |
| `settings-all` | leave | it would wipe the dials too |
| `routines` | **keep** | AJ leans to keep them; nothing in the import touches routines |
| `setting-history`, `pulse`, `floor-notes`, `operations`, `prior-history`, `ford-briefing` | keep | none of it is built from the test sessions in a way the import needs gone; the dry run counts each so AJ can change his mind on numbers |

So the command AJ runs, after the dry run with the same groups:

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386 --studio BVDDRe5AqQZFihRLW0vK --also imported-history,settings
```

then the same with `--commit --expect N`, N being that dry run's number. Then Step 4 (the check: the same dry run finds nothing) and Step 5 (the three jobs) of the runbook, plus Rebuild trainer rollups.

### The tests

In `src/lib/test-reset.test.ts`, a fixture of two studios, S and W: a client filed at each, a session hosted at each, one W-filed client with a session hosted at S, one S-filed client with a session hosted at W, each studio's own `clientStates`, `watch`, `floorNotes` and `cases`, two trainers (one coached at both), an imported session for an S client with `importedCount` 2 and a `legacy_filemaker_id`, and S with no cutover date while W has one. Then:

- `studioId: S` deletes S-hosted and S-client sessions and their sets, lists the two cross-filed clients, and leaves every W document and W client field untouched (the plan's deletes and field steps name no W path).
- Only S's `studios/S/…` documents go; W's `clientStates` and tallies stay.
- The trainer who coached at both keeps his counts document; his old `rollups` map is cleared.
- W's cutover date does not block a commit scoped to S; S's own would.
- `imported-history` with `--studio` lowers `importedCount` from 2 to 0 and clears the client's `legacy_filemaker_id`; without the group both stay; the record a trainer typed keeps its other fields.
- `settings` with `--studio` clears the weights on S clients' set-ups and leaves W clients' and every dial.
- A second run on the applied plan finds nothing left for S, and W's counts are what they were.
- Without `studioId` every existing test passes unchanged (the whole-database reset is the same).
- `parseFlags`: `--studio` with `--restore` or `--include-demo` is refused; an unknown studio id names the studios.

The emulator proof the runbook describes (the perf lab's 40-client studio, a reset, a second dry run that finds nothing, a restore whose fingerprint equals the one before) is re-run once with `--studio` on the emulator before the production dry run.

### The phases (one commit each, typechecked and tested on their own)

1. **The scope in the pure core.** `ResetOptions.studioId`; the in-scope sets (clients, sessions) and every part's filter; the two cross-filed lists on the plan; the cutover and era rules by studio; the trainer-stats and leaderboard rules under a scope. Tests above.
2. **The imported-history marker.** The new part (`client-import-marker`), its words in `PARTS`, the field changes, and its tests. Applies with or without `--studio`.
3. **The script.** The flag, the studio lookup, the header line, the lists, the manifest fields, `earlierEraStart` by studio, the follow-up words (Rebuild trainer rollups). `docs/ops/RESET-BEFORE-LAUNCH.md` gets a short section, "Resetting one studio", and `src/lib/test-reset.ts`'s header a paragraph.
4. **The emulator proof, then the production dry run** (read-only), shown to AJ with the groups question answered by numbers. He commits.

Nothing here touches the Mindbody integration, a Cloud Function or the Firestore structure (the import marker fields already exist on the client). The rules are unchanged: the script runs on the Admin SDK.

### Three questions for AJ

1. **Cross-filed sessions.** A session hosted at Strongsville for a client filed at westlake is taken with Strongsville's reset and listed (recommended), or left alone and listed?
2. **The groups.** `imported-history` and `settings` (the weights only), keeping the dials, routines and everything else (recommended), or something else once the dry run's numbers are in front of you?
3. **Trainers' counts.** With `--studio` the counts document is left to the delete trigger and one press of Rebuild trainer rollups afterwards (recommended), rather than deleted?

## Stage 2: what ran

Four commits on local master (`808ed5d3` the scope in the core, `2408d167` the import's marks on the client, `5359653d` the script, `2181a2a2` the emulator proof, 33 checks). **The real reset ran on Oct 22 2026 at 8:25 AM ET** (`--studio BVDDRe5AqQZFihRLW0vK --also imported-history,settings --commit --expect 10151`): every write landed, backup `backups\reset-2026-10-22T12-25-32-221Z`, point-in-time minute 2026-10-22T12:25 UTC, the check dry run PLANNED 0, the three jobs run with no Mindbody call, Rebuild trainer rollups pressed by AJ. Strongsville holds no sessions; routines, Pulse, dials, setting history and everything Mindbody owns are as they were. The log is `backups/filemaker/IMPORT-LOG.md`.

## Stage 3: the import, in waves (the plan, Oct 22 2026; nothing built yet)

### What AJ asked

"Dry-run the import for Strongsville, show me the numbers, wait for my go, then flip `PRODUCTION_IMPORT_READY`, run with `--commit`, and run the three rebuild jobs from the reset runbook, step 5. Every imported session already carries `legacy_filemaker_id` and the client's `priorHistory` marks the before-Journey count; keep that marker intact and add a test that a client with both eras reads right. DECISION (a): FileMaker sessions count everywhere for now, with a visible 'from FileMaker' tag; in a few months we switch trend and average measures to Journey-era only (b). So make the era filterable at read time (derive it from `legacy_filemaker_id`) so (b) is a one-line change per measure, and note each measure that would need it in a doc." And the rules table of Stage 1, approved with its defaults.

### What the importer does today, and what Stage 3 changes in it

The importer (`src/features/filemaker-import/`, `scripts/import-filemaker.ts`) is built and rehearsed; the Stage 1 audit found four readings that would write something wrong into a visit that can never be rewritten, and one guard that is missing. Each is small, pure, and tested beside the rule it changes:

| Change | Where | Rule it serves |
| --- | --- | --- |
| A year before 2000 is not a day: the entry is held as "no date", never a session in year 205 | `records.ts` `parseDay` | R11 |
| A count of 30 or more is seconds only from 30 to 120 and only on a machine that is held; on Hip Adduction, Hip Abduction, Leg Curl, Pulldown, Lumbar, a Leg Press or the Hoist it is held and listed (the machine reaches `readSet` the way `perSide` does) | `visits.ts` `readSet`, `findingsOf`; `plan.ts` | R8 |
| A weight of 0 beside a count is held and listed | `visits.ts` | R6 |
| A weight over 400, or over 4× the client's median on that machine, is held and listed | `visits.ts` `findingsOf` → `plan.ts` (a new "held" kind) | R10 |
| The dry run's held list says, once, that a held entry on a visit that imports is never added later, so the copy is corrected first | `report.ts` | the rules table's note |

Nothing in the importer's writing changes: the ids, the batches, the client's counts, the machine totals and the next weights are as the Oct 12 round built and rehearsed them (the README). The trainer per visit is already written from the lines (`trainerInitials`, one set of initials or blank).

### The era: decision (a) now, (b) later, one line per measure

One new file, **`src/lib/session-era.ts`**, the only place the era is read:

- `eraOf(session)` → `"filemaker"` or `"journey"`, from `legacy_filemaker_id` (and the older chart imports' marks, exactly `isLegacySession`'s test today). `client-history/model.ts`'s `isLegacySession` delegates to it, so the four screens that already read it (History's list and pop-up, the codex's Arrivals, Your week, the Deep Dive's `beforeJourney`) are unchanged.
- `TREND_ERA: "all" | "journey" = "all"` and `inTrendEra(session)`. Under (a) every measure includes both eras. Switching to (b) is changing that one constant, and each measure's one call is the line that honours it.
- **The visible tag.** History's pop-up already says "Imported" where a time would be; the Journey tab and the session list on the header do not. Stage 3 gives every list of a client's sessions the same small tag, "from FileMaker", through one helper (`eraTag(session)`), on: History's rows and pop-up, the Journey tab's past sessions, the machine card's session list, the header's Last / Next session lists. No new colour, no icon: words, 11px or more, as the Wrap-up round's labels are.
- **The measures (b) would change**, each named in **`docs/business/session-eras.md`** with the file and the one line: the Journey grid's trend arrows (`journey-grid/stats.ts` `trendVsPrevious`) and the Staircase (`machine-menu`), the Wrap-up's "last time" and gains (`lib/post-session.ts`), the progress report's windows and totals (`lib/progress-utils.ts`, `progress-report/`), the Deep Dive's baseline, effort trend and stalls (`clinical-review/facts.ts`, `effort-trend.ts`, `analytics.ts`), machine trends and the Kaizen reports (`machine-trends/trends.ts`, the weekly job), the performance watch, All stars and the client states' pace (`renewals/attendance.ts`, `hub-opportunities`), Your week and My clients (`trainer-profile`). **Not** in the list, because they are counts and stay whole under (b) too: the session total and numbering (`lib/session-total.ts`, `history-claims.ts`), the machine totals and "last time", the trainer rollups, the month tallies, InBody due. The sweep that builds this list is part of the phase, read file by file; the list above is the starting point.
- **The test AJ asked for** (`session-era.test.ts` and a case in `lib/session-total.test.ts`): a client with 48 imported sessions, a stated total of 183 and 2 Journey sessions of her own reads total 185, next session #186, two eras tagged apart, History's coverage "complete" from Mindbody's count; `inTrendEra` includes all 50 under (a) and only the 2 under (b), and no measure in the list changes its answer under (a) against today's.

### The copy of the export, the machine table, and the two sheets

Prepared before the dry run, nothing in `src/`:

1. **A corrected copy** of the workouts file, through `backups/filemaker/tools/correct-export.mts` run once per row, each run's output the next run's input (the tool gains a `--column DateofWorkout` mode and a blank `--becomes`, both in the gitignored tools folder): the 12 rows AJ already confirmed by approving the rules table (Nancy 2000 → 200, Eva 1000 → 100, Stacy 1780 → 178, Gary 1400 → 140, Steve 1502 → 150, Debora 8410 → 84 and 268 → 26, Janice 5412 → 54, Tom Cifelli 888 → 88 and 849 → 84, Mary 540 → 54) and Tom Reddy's date 12/12/0205 → 2025-12-12; Tom Reddy's 13137 and Bonnie Eggers' 228 as AJ picks, else left for the guard to hold. The original stays as it came; the copy is named for the day and logged.
2. **The machine table, `machine-table-strongsville-v2.csv`**: the studio's 19 rows, plus Cx → `m-neck`; the five old names (Comp. Row Hoist, Chest Press Hoist, Pulldown Imag., Overhead Imag., Leg Press Nt) and the two flagged (Rowing Back → `m-simple-row`, Abs Imagine → `m-abs`), each Until 2023-12-31; Pam's five client rows (chart-proven); Allan's eight T1 rows from 2024-08-24 (chart-read Oct 14); and **a hold row per flagged client** (the other 49, Lynne included: a client row with a blank Journey machine from the client's start day, so each waits whole and nothing wrong is written). The draft rows for them stay in `audit/draft-client-rows-2026-10-21.csv` for wave 2.
3. **The numbering sheet** for the 21 clients whose story predates FileMaker (R13): name, Mindbody's count, FileMaker's visits, the suggested total, Confirm / Change. Until a leader has answered for a client, that client is held (a hold row) out of wave 1. The answers are written the way the app writes them: a leader on Account → Sessions before Journey, or AJ hands the sheet back and `scripts/state-prior-history.ts` (new, dry run by default, `--commit --expect`) writes each record with source `filemaker` and the leader's name, never without a person.
4. **Held out of wave 1 by the rules table's defaults**, and said in the dry run's report: the 124 former clients not in Journey (R15), the four split profiles (R16), the nine staff and test profiles (R17), Bruce Stone and the three drive-bys (R18).

### The waves

| Wave | Who | When |
| --- | --- | --- |
| 1 | Every Strongsville client in Journey who is neither flagged for the name fault nor waiting on a stated total: about 90 clients, the exact list from the dry run; Pam and Allan with their rows | after AJ's go on the dry run |
| 2 | The flagged clients as their charts answer (the row order read on three or four charts settles the order; each client's rows then checked: the eight incomplete chains completed, the implied Pulldown and Lumbar rows confirmed by the notes test or the chart, the start days where routines were rebuilt apart), and the 21 numbering clients as their totals are stated | as the answers come, in runs of the clients ready |
| 3 | Former clients if AJ wants them (onboard `--months 36` first), the split profiles once paired in Mindbody, Bruce Stone once re-filed | AJ's call |
| Top-up | FileMaker keeps running at Strongsville until its cutover, so every session logged there after the export (Oct 21 2026, 10 AM) is missing from Journey. A second export on the eve of the cutover, run through the same importer, adds the new visits and writes nothing twice; it must happen BEFORE the first Journey session is logged there, since a client with a Journey session of her own is refused | the night before Strongsville's cutover |

Every run: `--through` the export's own day (Oct 21 2026 for this export, so April Lozinak's Oct 23 sheet stays out), `--verify` on the commit, the report and the table kept in `backups/filemaker/`, the log updated. After each wave: `rebuild-machine-fit --commit`, `run-machine-trends --commit`, `run-renewals --commit --max-pulls 0 --first-sync-max 0`, and Rebuild trainer rollups once (an imported session is written `rollupCounted` so the trigger does nothing per document).

### The lock

`PRODUCTION_IMPORT_READY` flips to `true` in its own commit, after the wave 1 dry run and AJ's go, with the lock's comment rewritten to say what it now guards: a run is refused for a client who has a Journey session of her own, for a `--through` on or after the studio's cutover, and for a machine table with a mistake, exactly as before. `--trial` stays for a single client between waves.

### The phases (one commit each, typechecked and tested on their own)

1. **The reading guards**: the five rows of the table above, with tests in `records.test.ts` and `visits.test.ts`, and the emulator rehearsal run again on the three Oct 12 samples (nothing real touched).
2. **The era**: `session-era.ts`, `isLegacySession` delegating, the tag on the four lists, the one call in each measure (no behaviour change under (a), held by the test), the two-era client test, `docs/business/session-eras.md`.
3. **The copy, the table and the sheets** (gitignored files, logged): the corrected export, `machine-table-strongsville-v2.csv`, the numbering sheet, `scripts/state-prior-history.ts` with its test.
4. **The wave 1 dry run on production** (read-only), its numbers to AJ: clients ready, sessions and sets to write, what waits and why, the held entries by kind with their rows. AJ's go.
5. **The lock flipped, wave 1 written** (`--commit --expect N --through 2026-10-21 --verify`), the three jobs, Rebuild trainer rollups, the log and `backups/filemaker/IMPORT-LOG.md`; a `--trial` walk of two clients on an iPad before the rest if AJ wants one.

Nothing here touches the Mindbody integration, a Cloud Function or the Firestore structure: every field the import writes exists today (`legacy_filemaker_id`, `priorHistory`, the session and set documents as Finish writes them). An InBody "last scan day" field (R20) would be a structure change and is not in this stage.

### Stage 3: what ran (Oct 22 2026)

Phases 1 to 3 are committed (`f89acb97` the reading guards and the emulator rehearsal, `233fe126` the session era, `390c5cab` the numbering sheet's writer), the lock flipped in `97bd2e1c`, and **wave 1 was written at about 11:06 AM ET: 94 clients, 6,829 sessions, 46,264 sets, each client read back with its counts; 38 clients held on purpose (the flagged, the numbering clients, four filed elsewhere); nobody stopped.** The three jobs ran after with no Mindbody call; AJ pressed Rebuild trainer rollups. The log is `backups/filemaker/IMPORT-LOG.md`; the files that wave used are `exports/strongsville-full/…-corrected-2026-10-22.csv`, `machine-table-strongsville-v2.csv` and `report-2026-10-22T14-51-53-477Z.json` there. **Wave 2 (the afternoon of Oct 22).** The charts were read in FileMaker on AJ's PC, Claude driving: fifteen of them, each cell checked against the export's name on the same day. Thirteen are Allan's order, Diane Wolf is Pam's, and three are cleared outright (Gary Mundson and Mike Henkel standard; Jules Horvath's chart in Allan's order but his export names already equal to his labels, so a chart's order alone proves nothing, a cell against its export name does). `machine-table-strongsville-v3.csv` (`tools/build-table-v3.mts`) gives every drafted client the full eight-row permutation from the chain's day. **Wave 2 was written at about 3:55 PM ET: 16 clients, 2,829 sessions, 19,432 sets**, with Tom Reddy at 137 and Bonnie Eggers at 28 (AJ's picks). The dry run also showed that wave 1 had imported **Steve Ragan and Angie Silva** without the rows the audit drafted for them (the v2 builder took one helper's list and missed the other's two additions): the importer's `--relabel` moved 502 and 251 sets onto the right machines, with a backup of each client's old state. **The 18 stated totals** were written by AJ from the sheet (`state-prior-history.ts --commit --expect 18`; the classifier refused the write to Claude). Wave 2b's first dry run held 49 real sets of Beverly Snyder's and Elovia Peddle's as "a weight nobody lifts", because the guard's median was per FileMaker name and a renamed client's one name is two machines over time: fixed in `effc6d4f` (the guard keys by the machine a line lands on), and **wave 2b was written at about 4:50 PM ET: 18 clients, 2,863 sessions, 20,962 sets, numbered from the stated totals** (Kenda Daniels #141–#188, Lynne Koszkalda #378–#592). Strongsville then held 128 clients and 12,521 imported sessions.

**Wave 3 (the evening of Oct 22).** The last four clients were settled first: Sandy Shaker's and Dave Iammarino's start days from the export (Aug 21 2024; Mar 24 2025, his return from a break), Judy Davidson's and Marla Steimle's charts read, so the v3 table lost its last hold rows (381 client rows for 47 clients). Then `onboard-studio.ts --months 36` brought the former clients in from Mindbody by id (189 made, 2 refreshed, 955 calls, about $1.91; its verify reads all 336 in scope as synced), and **wave 3 was written at about 10:55 PM ET: 117 clients, 2,882 sessions, 18,557 sets**, each read back with its counts; the three jobs after. **Strongsville now holds 245 clients and 15,403 imported sessions**, every current client's FileMaker history through Oct 21 2026. Outside it, each a one-line answer from AJ: Bruce Stone (filed at westlake, re-file first), Brad Chill's 42-visit profile with no Mindbody number, Trina Rauscher Cooper's 29 visits under her second Mindbody number, six one-to-four-visit people older than the 36-month window, nine staff and test profiles (stay out), and the three drive-bys (stay out). The top-up export on the cutover's eve remains.

### Three questions for AJ (2 and 3 answered on Oct 22: wave 1 with them held, 137 and 28)

1. **The top-up.** FileMaker stays the studio's log until the cutover, so a second export on the cutover's eve is part of the plan (and the import is refused once a client has a Journey session of her own). Is that the order you want, or does Strongsville start logging in Journey as soon as wave 1 is in?
2. **The flagged 51 and the 21.** Wave 1 now with them held (recommended: nothing wrong is written, and wave 2 adds them), or wait for the charts and the numbering sheet and import everyone in one wave?
3. **Tom Reddy's Seated Dip (131, 132 or 137) and Bonnie Eggers' Leg Extension (28, or 22 × 8).** A pick, or the guard holds those 12 sets for good.
