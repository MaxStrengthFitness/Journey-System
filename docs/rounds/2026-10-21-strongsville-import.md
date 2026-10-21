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

## Stage 3: the import (to plan after Stage 2)

In waves, from a corrected copy of the export, with `--through` on the export day: first the clean clients (about 95), then the 51 flagged once their charts are read and their rows checked, and the 21 numbering clients once their totals are stated; former clients, split profiles and Bruce Stone as AJ decides. The importer changes it needs first (each behind AJ's yes): `parseDay` refuses a year before 2000; `readSet` takes the machine and holds a hold on a lifting machine or over 120 seconds; a weight of 0 on a counted line, or over 400 or 4× the client's median, is held and listed; `correct-export.mts` takes a date column and a blank `--becomes`; the "from FileMaker" tag and the era filter for decision (a) / (b), with the list of measures (b) would change; a test that a client with both eras reads right. `PRODUCTION_IMPORT_READY` flips in that round, with the three rebuild jobs after the run.
