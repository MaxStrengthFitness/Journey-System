# The FileMaker import round (Oct 12 2026)

**Branch:** `oct12/filemaker-import` over master `a39bca59`. **Not pushed. Nothing written to the real database: production writes are switched off (§6). The app side of §6 (items 1 and 2) was done the same day by the history-ready round (§10); the biggest client in MSF is §11.**

## 1. What AJ asked

The first FileMaker data arrived on Oct 12 2026: one client's profile and workout lines, exported to Excel by the FileMaker developer, then two more clients (one more at Strongsville with nearly three years of visits, one at Solon). AJ: "do you think this is going to be something that we can easily export in if we do have a file that has every client's information on it?" After the review below: "lets go ahead and build a migration tool that works with our current files."

AJ's answers along the way, each one a rule in the tool:

- **The date is a visit's key**: "I don't think we really do need a visit ID because we can just use the date for that."
- **The studio a visit was at isn't needed**: every imported visit is filed at the client's home studio.
- **The trainer per visit** is "nice": asked for in the full export.
- **A 0 means not performed**: "zero in either column either means it wasn't performed. Or to take it out."
- **FileMaker never fills a weight in by itself**: "no trainer puts it in". So a weight with blank reps was done and the count wasn't written down.
- **FileMaker's workout count runs one ahead** of the visits with machines on them: "when it's loaded, that's the current session."
- **Build it outside the app** (asked: "would it be smart to build it outside of the app?"): a script in `scripts/` over a pure core in `src/`, never a screen.
- **Slowness**: "how much data is going to make our app slow?" Storing history doesn't slow Journey; reading a client's whole history at once does, and one screen still does (§6).

## 2. What the three samples showed

| | Strongsville, short | Solon | Strongsville, long |
| --- | --- | --- | --- |
| Visits in the export | 59 | 111 | 214 |
| FileMaker's workout count | 60 | 120 | 216 |
| First visit in FileMaker | Feb 2026 | Aug 2025 | Nov 2023 |
| First visit in Mindbody | Feb 2026 | Aug 2025 | **Aug 2020** |
| Entries with reps blank | 19% | 2% | 67% |

- **The two swapped names.** FileMaker's `NextSet` holds the reps done; its `Reps` holds the weight set for next time. Checked on the chart itself (Hip ADD on 9/2 reads "56" over "9  60") and against the next visit (25 of 35 next-time weights were used). The export is right; only the names mislead. `records.ts` is the one place that knows.
- **Studios record differently.** Solon writes reps almost always; Strongsville often writes only the weight, for whole stretches. Solon writes timed holds as seconds in the reps column (60, 90, 120, unmarked) and Torso Rotation as left.right ("7.6" is 7 left, 6 right). Each studio has its own machine names ("Chest Fly" and "Leg Press" at Solon; "Chest fly", "Leg Press Imag." and "Leg Press Hoist" at Strongsville).
- **A 0 for next time** sits beside a 0 in reps at Strongsville, but Solon wrote it beside eleven timed holds that were plainly done, and once (Dec 22 2025) on three machines with reps blank. The rule: a 0 for next time means not performed only when no count was written.
- **FileMaker doesn't hold everything.** The long Strongsville client has been coming since 2020; FileMaker starts in late 2023. The total stays Mindbody's (the trainer's Confirm on Account), and FileMaker fills in the detail of the years it covers.
- **Workouts with nothing entered.** The Solon client has 8 more workouts in FileMaker than days with machines on them. Only the list of workouts would carry those (asked for, §7).
- **Machines replaced under one name.** One day in October 2024 the long client's Pullover went 72 → 24, Abs 62 → 22 and Overhead 28 → 50, and stayed there: new machines, same FileMaker name. The machine table splits a name by date (§4).
- **Real step-backs that look like typos** (62 → 42 and 60 → 40 on one day, then built back) import as they are; the dry run lists every big change for a person to glance at.
- **The profile's `JSON` column** is Mindbody's whole client record, card type and last four digits included. It is never read, and the developer was asked to leave it out.

## 3. What was built

`src/features/filemaker-import/` (read its README first) and `scripts/import-filemaker.ts`:

- **`files.ts`** reads Excel directly (an .xlsx is a ZIP of XML; the project has no Excel library) and CSV / tab / FileMaker Merge. A CSV with no column names on its first row (FileMaker's plain CSV) is refused with what to ask for. FileMaker's in-field return (a vertical tab) becomes a line break; the text may be UTF-8 or Windows' own.
- **`records.ts`** finds each column by name and reads each cell; a two-digit year, a day that isn't real, a comma that isn't a thousands mark or a number that isn't one is a problem on that cell, never a guess.
- **`visits.ts`** says what an entry means (the table in the README), groups a client's entries into visits by day, and lists what a person should know: what the import **holds back**, what is **worth a look** against the chart, and what a rule **handles**.
- **`machine-map.ts`** is the machine table, a CSV a person finishes in Excel: which Journey machine each FileMaker name is, per studio, with From / Until for a machine replaced under one name. The draft fills in only sure matches. Before anything is planned, every machine in a person's table must be on that studio's floor, every date a real day, and no two rows may claim one name on the same day.
- **`plan.ts`** turns one client's visits into the exact documents a finished session has, with derived ids, and the client's own documents' updates.
- **`report.ts`** is the dry run's words, Journey's name for the client beside FileMaker's (a check on the pairing).
- **`scripts/import-filemaker.ts`**: dry run by default; `--commit --expect N`; batches of whole visits written in **one transaction each with the client's counts, machine totals and settings**; `--verify`; the emulator rehearsal (`--emulator --seed-emulator`).

## 4. The machine table

Each studio named its own machines, so the answer is a table per studio and a person settles it once. The import suggests from Journey's own names for the twenty movements (`catalog/names.ts`, which already knew FileMaker's spellings) and never chooses between two of a studio's units ("Leg Press Imag." and "Leg Press Hoist" are two leg presses). While a client has a visit with a name nobody has matched, that client waits whole, so a visit never lands with a machine missing and the numbers never have a gap. `skip` (any capitals) keeps a name out for good.

## 5. The review and the rehearsal

Two reviewers read the round adversarially before it was committed: one checked that what it writes is what Journey's screens, jobs and rules read; the other tried to break it. Fixed from their findings:

- **Counts are written with their sessions.** The first version wrote a batch of visits, then the client's counts, and kept a local file to carry a stop between the two into the next run: a stop at the wrong moment counted twice, a lost file never counted. Now each batch is one transaction, re-checking its sessions and reading the counts inside it.
- **The session count is the profile's own answer** (Journey's Completed sessions plus what a stated total still holds uncounted). The first version raised it by the import, which put a client with a stated total N too high.
- **A client Journey already holds sessions for is left out** (the numbers would clash with Journey's own), and so is one whose earlier imported sessions are gone from the export or whose numbering has moved.
- **A visit where nothing was done** (every machine 0, blank or unreadable) is left out, not counted as a visit.
- **Left.right**: "7.1" may be seven and ten, "7.2" seven and twenty: both held back, as is a side of 0 or above 20.
- **The swapped-columns guard** no longer stops a client who does mostly timed holds.
- **The briefing's "Last session"** reads `endTime`, now written; **starting weights** come only from a machine's first FileMaker day; **"last time"** only from a set with a weight; **the trainer tally** adds to what is on file.
- Two FileMaker profiles of one Journey client, or one FileMaker id twice, stop the run.

A third reviewer checked those fixes and found where they met: numbers skipped over a waiting visit (Start would later fill the gap twice), so **a client now waits whole** while any visit waits, and a visit is numbered only once it imports; a batch found already written still counts toward the next batch's session count; a shared machine table's rows for another studio are no longer checked against the wrong floor; a client left out no longer reads "Would write"; and the swapped-columns guard also catches a file whose counts are mostly blank.

The rehearsal on a throwaway Firestore emulator (project `demo-fm-import`; nothing real touched), the three sample clients, the table filled from its suggestions, the long client given a stated total of 450 first:

- **The write** made 383 sessions and 2,638 sets: 59 + 378, 111 + 752 (Torso Rotation as two sides), 213 + 1,508 (the visit dated today left out, after `--through`).
- **Counts**: 59 and 111 sessions for the two without a stated total; the long client still totals **450** (213 imported, `importedCount` 213), numbered **#238 to #450**, so Start numbers the next one #451.
- **The same run again wrote nothing.**
- **Outcomes read through the app's own `outcomeOf`**: the long client 492 performed, 1,015 performed with reps not recorded, 1 skipped; the Solon client 539 performed, 112 timed, 74 by side, 16 skipped.

## 6. Why the real database waits

`PRODUCTION_IMPORT_READY` is false. These come first, each its own piece of work for AJ's yes:

1. **Done (§10).** **The session screen reads a client's entire history at Start** (`WorkoutTrackerView`'s sessions listener has no limit). Fine at 60 sessions; with years imported it is slow on the floor and costs reads at every Start. It needs a limit, measured in the perf lab with FileMaker-sized clients first.
2. **Done (§10).** **"Done, reps not recorded" must be read everywhere reps are counted.** It reverses the Sep 12 2026 rule (a FileMaker blank imported as skipped) for a weight with no reps, on AJ's answer. Nothing crashes on it; these would say wrong things (the review's list):
   - the Journey grid: `journey-grid/stats.ts` `trendVsPrevious` (a false reps-down then reps-up arrow), `JourneyCell.tsx` (the aria label says 0 reps; the corner needs a "not recorded" mark), `StatCell.tsx` (a visible "0 reps"), `adapters.ts` `toJourneySet` (drops the flag; quality reads "Completed");
   - the Wrap-up: `lib/post-session.ts` (a missing prior count read as 0: "▲ +10 reps") and its `todayHeadline`;
   - the progress report: `lib/progress-utils.ts` (`|| 1` counts each as one rep);
   - session volume: `lib/utils.ts` `calculateExerciseVolume` (weight × 1), and History's volume and its change;
   - the Deep Dive: `clinical-review/facts.ts` (counted as a set with no reps: "gets fewer reps");
   - the briefing: `BriefingScreen.tsx` (borrows another set's reps);
   - routines: `routines/routine-rows.ts` ("no set logged" beside a weight);
   - editing: `SessionDetailDialog.tsx` (shows 0, and keeps the flag after a trainer types the reps in);
   - smaller: the Wrap-up's lifetime fallback, the history strip's quality tally, `log-validation.ts`.
3. **The pre-launch reset runs before an import, never after.** Run after, its default zeroes an imported client's counts and deletes the machine totals while keeping the sessions.
4. **The full export with the trainer per visit** (§7). A finished session's trainer can't be changed later through the app's rules; the import would need its own update pass to add trainers afterwards.
5. **Smaller app work the review found:** InBody due counts every session since the first when there is no scan (bring FileMaker's last scan date in, or don't count imported sessions there); Insights and the month tally count an imported #1 as a first session and dilute their rates (leave `isLegacySession` out of them); the Journey grid orders past sessions by number before date (date first is safer).

## 7. Asked of the developer for the full export

```text
Client profile: __ID_Client, _MindBodyID, SITEID, _ID_Franchise, NameFull, WorkoutNotes, InBodyLastScanDate
Client notes: __ID_Client, note text, created date, created by
Workout lines: __ID_Client, DateofWorkout, MachineName, WorkoutOrder, Weight, NextSet, Reps, trainer initials, line notes
Machine settings: __ID_Client, MachineName, setting 1 to 6 values
Machines: MachineName, Order, setting 1 to 6 labels, Active, _ID_Franchise
Trainers: Initials, first name, last name, _ID_Franchise
```

Excel or Merge format (column names on the first row), one file per studio if a sheet would pass Excel's million rows, and no `JSON` column. The reader already looks for `__ID_Client` and a trainer column on the lines; settings, notes and the list of workouts are the next pieces of the tool once their shape is seen.

## 8. Numbers

- Suite **14,481 passing in 874 files** (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000` in the worktree); 66 of them are this round's, in five files.
- Typecheck **2** (the baseline).
- No rules, index, Cloud Function, Mindbody or screen change; nothing for Render.

## 9. Still open

- **How loud imported notes come in** (AJ's question 2: quiet on the profile, never the briefing or the Hub, was the recommendation). The profile's standing note is reported, not imported.
- **Which unit takes the old history** when a studio replaced a machine (the October 2024 Pullover, Abs and Overhead): a retired unit on the floor and the dates in the machine table.
- **Who at Solon can explain** the Leg Curl that alternates between two weights visit to visit (68 / 52, then 70 / 50): two set-ups under one name?
- **Numbering a client with a longer history than FileMaker's** without a stated total starts at 1 (README, "Numbering").
- **A session a trainer deletes from History** would come back on a later run of the import (no record of the deletion), and the import can't follow a client re-keyed to another record. Both matter only for a run after go-live, which the "Journey already holds sessions" stop prevents.

## 10. The history-ready round (Oct 12 2026, the same day)

AJ, on §6's first two items: "I don't want our app to just be de- destroyed once we get all this data in." The plan was items 1 and 2 of §6, plus the two smaller reads behind them, measured in the perf lab before and after. AJ answered its three questions **"1a 2a 3a"**:

- **1a** On the Journey grid a set with no count shows its weight with a dash where the reps go ("70 –"), and says "reps not recorded" to a screen reader.
- **2a** The progress report's Total Reps and Total Volume count the recorded sets, and their tiles say so ("Total Reps (recorded)").
- **3a** Part 3 is in: the progress report and the Deep Dive read only their own window, and the import marks a client's machine totals as built.

One commit a phase, each typechecked on its own:

0. **The lab can give its focus clients years of imported history** (`harness/perf-lab/seed.ts`, `PERF_LAB_FOCUS_DAYS_BACK`, default a year as before). The two clients the client and session scenarios open get one a day for that many days, the part older than a year written the way the import writes it (no trainer, noon of the day, `legacy_filemaker_id`). At 2,920 days (eight years) each has about 810 Journey sessions, 600 before Journey and some 6,500 sets.
1. **The session screen reads a window of the client's sessions** (`WorkoutTrackerView`): the newest 40, the journal's own query (one listener serves both), and every session still open whatever its age, so a session left open long ago is still asked about. What used to claim "every session" now says so only while the window isn't full: the machine card's Load older pages older sessions in from the server, 30 at a time (the menu's own page), and the briefing's InBody count asks the server for its number (`inbody/useInBodyCount.ts`, a count, not the sessions). `tracker-history-window.test.ts` fails if a sessions-by-client query in the tracker has no limit.
2. **"Reps not recorded", read the same way everywhere.** One rule in `lib/set-outcome.ts`: `isRepsNotRecorded` (performed, no count) and `repsOf` (the count, or null). Every reader in §6's list asks it: the grid (1a; no reps arrow off a missing count), the Wrap-up (no "+10 reps" against a last time with no count), volume (a set with no count adds nothing, where it used to add weight × 1), History (a session's volume is called partial and has no change against it), the progress report (2a, with how many sets had no count), the Deep Dive (a session with uncounted sets has no reps or tonnage index and stays out of the baseline; a stall says "reps not recorded", never "no gain"), the briefing, routines, and the session editor (typing a count in clears the mark). `lib/reps-not-recorded.test.ts` walks every reader; the grid has a render test.
3. **The progress report and the Deep Dive read their window** (`lib/progress-utils.ts`, `clinical-review/useClinicalReport.ts`): the sets of the window's sessions only, 30 sessions to a query, side by side, read again only when the report's window is moved earlier. The Deep Dive used to read every set a client ever had once a range held more than 60 sessions. The import now writes `machineStatsBackfilledAt`, so the profile's one-time machine-stats rebuild (which reads every session and set) has nothing to do for an imported client.
4. **The open-session check draws the screen only for news.** Start, every save to a session and Finish answer on both listeners; the open check's copy of a session the window holds changes nothing on screen, so it no longer draws the screen again. It was meant to take away the lab's +45 ms on the briefing's Start → the Now Bar, and did not (the lab, below).
5. **The review's fixes.** Two reviewers read phases 1 to 4 (nothing was a blocker). The window counts as every session only on the server's word, never a cache answer, a write of ours pending or a failed read (`windowWholeFor`); the briefing, handed the window alone, asks about the window alone; Load older's pages start again when the window's end moves, so no session falls between the two; the InBody count is ordered as its index is; the briefing says "No recent run" where it read only the newest sessions. The progress report counts a start moved earlier than what was read once its sets are read, and says "Reading their sessions…" until then rather than the narrower window's totals, which it used to save (a mounted test holds it); an all-time report or Deep Dive reads the sets in one query by client. The Wrap-up's Lifetime volume and reps say "(recorded)" for a client with FileMaker history, and History's pop-up says "Volume: reps not recorded" rather than "0 lb".

Left as they are, and why: a running session older than the newest 40 that is finished on another iPad toasts "discarded" on a watching iPad (it needs 40 newer sessions than the open one); a paper-chart import's unreadable date string sorts above every real date and takes a window place (none known); the Wrap-up compares against the last 29 sessions, as it always has (the coverage rules keep "First time" from being said for a migration client); a run of the import while the client's profile is open could have the profile's one-time machine-stats rebuild drop that batch's counts (run imports with the studios closed).

**The lab** (`harness/perf-lab`, iPad 10th generation in portrait, three timed runs of each build, interleaved; the seed's two focus clients with eight years of history, ~810 sessions and ~6,500 sets each; "before" is this branch before phase 1, "after" is everything through phase 5):

| iPad 10 in portrait, the median of three | Before | After |
| --- | ---: | ---: |
| Opening the session (the briefing drawn) | 2.85 s | 1.14 s |
| The briefing's Start → the Now Bar | 0.17 s | 0.23 s |
| From the first tap to the Now Bar | 3.02 s | 1.36 s |
| A set | 40 ms | 32 ms (within the noise) |
| The machine card opening | 122 ms | 120 ms (within the noise) |
| The screen frozen (long tasks), the whole path | 2,259 ms in 18 | 655 ms in 8 |
| The Wrap-up's long tasks | 969 ms | 355 ms |
| Data downloaded, the whole path | 4.6 MB | 1.4 to 1.9 MB |

The run after phase 3 measured the same (the briefing 2.90 s → 1.16 s; the briefing's Start → the Now Bar 175 → 220 ms), and so did this one after phases 4 and 5. Phase 4 was meant to take that second step's extra 50 ms away and did not, though it still spares the screen a needless redraw. The likely reason, not proven: the briefing now appears before the screen's other reads have all answered, so some of their waiting falls after the tap rather than before it; that step's long tasks moved only from 141 to 156 ms. From the first tap to the Now Bar it is 1.66 s faster. The client profile's path (a card → the Journey tab) did not move, as expected: it already read the newest 40 (1.65 s, against a noisy 1.5 to 3.4 s before, one before-run of which failed while the PC was busy). The lab's two focus clients have some 810 Journey sessions and 6,500 sets each, about two and a half times the biggest real client (§11), so this is the far end of what an import brings.

**Numbers**: suite **14,505 passing in 877 files** (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000` in the worktree), typecheck **2** (the baseline). No rules, index, Cloud Function or Mindbody change: the window and Load older use the sessions' (clientId, date) index, the open check and the InBody count the (clientId, status, date) one, and the reads by session the (sessionId, createdAt) one, all already in `firestore.indexes.json` (no new entry). Nothing for Render until this branch is merged and shipped.

## 11. The biggest client in MSF (Oct 12 2026)

AJ sent the files of the client with the most visits of any MSF client ("this is the biggest file we would deal with for a client where smaller clients may only have 10 visits"), at Willoughby, a client since December 2012. Read through the tool's own core, nothing written:

- **312 visits in FileMaker, March 2024 to the day it was exported**: FileMaker holds the last two and a half years, as it held the long Strongsville client's last three. 2,254 entries on 25 machine names, a median of 7 machines a visit.
- **The import would write 309 sessions and 2,262 sets**: about 2,600 documents and some 1.1 MB, in 7 transactions. The perf lab's two focus clients (about 810 sessions and 6,500 sets each) are some two and a half times this.
- **Willoughby records its own way**: reps blank on 41% of entries (Strongsville 67%, Solon 2%); two units of several movements (Imagine and Hoist: chest press, pulldown, compound row, overhead, abs), which the machine table maps one name to one unit; three names with no suggestion (Chest Flys, Ab Hoist, Shoulder Extensions).
- **Negative counts**: 25 entries (1%), almost all -10 or -12, at the same weight as the visits either side, four machines on one day at -12. AJ: "this was an attempt at rep quality i believe but we dont have to mind that". A minus before a count reads as the count (FileMaker import 6).
- **Fixed from it** (FileMaker import 5 and 6): the same machine twice on a day, blank first and then with its weight, kept the blank and held the weight; a blank entry (or one with only next time's weight) now never pushes out a real one, and the real one keeps its own place in the order. A machine with nothing written (80 of them) is "handled" in the dry run, not "not imported until fixed". After both, every entry imports but three (a day whose routine was entered twice): 309 sessions and 2,262 sets.
- **The profile export is now FileMaker's whole intake form**: health history, medications, physician, address, phone, birth date, the emergency contact, and Mindbody's `JSON` again. The tool reads its dozen columns and nothing else; the files are kept out of the project. It carries `InBodyLastScanDate`, which the InBody item below needs. The workout lines still carry no client id or trainer (fine one client a file; the full export needs both, §7).

**A question the review raised for AJ**: a single whole count on a machine done one side at a time (Torso Rotation "8", where Solon writes "8.7") imports as 8 each side. Is that what a trainer meant, or was it one side's count?

**AJ's answer (Oct 13 2026)**: "strongsville does not have a torso rotation but to answer your question some trainers might put it 8/8 8.8 8 8 8-8. i know file maker practices were not ideal". So, still to build before the full import: read "8/8", "8 8" and "8-8" as left and right the way "8.8" already is, and mark a single count on a machine done one side at a time for a person to look at in the dry run rather than importing it as each side.

**Also before the trial clients are taken out again**: the pre-launch reset deletes sessions but leaves `priorHistory.importedCount` and `legacy_filemaker_id` as the import set them, so a client reset after an import would come up short by the sessions deleted (the total is Journey's count plus `sessions - importedCount`, and only the first part drops). The reset must lower `importedCount` by the imported sessions it deletes (and clear the id) in the same write.

**Still open from §6** (each small, none needed before an import): the briefing's InBody due, for a client with no scan on file, still counts every session since the first (bring FileMaker's `InBodyLastScanDate` in with the full export); Insights and the month tally count an imported #1 as a first session; the Journey grid orders past sessions by number before date. The pre-launch reset, the full export with trainers and AJ's go are the lock's three conditions now (§6, 3 and 4).

## 12. Allan Boike's weights on the wrong machines (Oct 13 to 14 2026)

AJ, after running the trial client Allan Boike in Journey on Oct 13: "seated dip compund row seemed to be swapped, somehow chest fly got 160 when it should have been 46 lumbar and abdominals was wrong too".

- **Cause: the export, not the importer.** FileMaker's `workoutlines__Machines::MachineName` names Allan's lines wrongly from **Aug 24 2024**, the week Bicep, Lateral Raise and Chest fly joined his routines. Eight names are shifted: "Abs" is his Chest Fly, "Chest fly" his Pulldown, "Pulldown" his Pullover, "Pullover" his Overhead, "Overhead" his Lumbar, "Lumbar" his Abs, and Seated Dip and Comp. Row are swapped. The weights and WorkoutOrder are right. Proven three ways: his Journey session of Oct 13 against the last imported visit; his FileMaker chart (read on AJ's PC, Oct 14), which shows the right names for every visit since September; and every one of the eight machines' weights running straight through Aug 2024 once the names are put right (Pulldown 140 → 140, Lumbar 90 → 90, Abs 96 → 96, Seated Dip 99 → 100). Before Aug 24 2024 the names are right. The dry run had flagged the Aug 27 2024 jumps as "look", where they read like machines replaced.
- **AJ's answers (Oct 14 2026): "1a 2a 3 yes"**: relabel Allan in place from Aug 24 2024; confirm on the chart (done for the newest visits; the PC locked before Aug 2024 was reached, and the continuity settles it); hold more Strongsville imports until the developer sends the full export, testing single clients meanwhile. AJ: "filemaker is just a mess and some machines are named different for clients at the same studio, they have wrong settings fields and also just data in the wrong field ... expect our migration to be a bit messy but attempt to prepare as best as you can".
- **Built** (branch `oct14/fm-client-names`): the machine table's **client rows** (a "Client" column; a client's row wins over the studio's on its days) and the script's **`--relabel`** (`relabel.ts`). The README says how each behaves. Allan's table is `backups/filemaker/machine-table-strongsville-allan.csv` (the Strongsville table plus his eight rows).
- **Rehearsed** on the emulator (`backups/filemaker-rehearsal/rehearse-relabel.mjs`: the Oct 13 import with the studio's table, his Journey session and the weights set afterwards, then the relabel): 186 of 245 visits and 609 sets move; Oct 6 and Oct 10 2026 read exactly as the chart; Aug 20 2024 is untouched; a second run changes nothing; the weights a person set (Abs 88, Overhead 50, Pulldown 160) and Journey's own session stay; Pullover's next weight goes 50 → 124. **The real database's dry run says the same** (186 visits, 609 sets, none refused). The commit is AJ's.
- **The review's fixes** (an Opus review of the relabel before the commit): a swap reuses both machines' set ids, so the machines involved are worked out from each set's numbers and place, not its id alone (Allan was covered by his Aug 24 2024 visit, where Seated Dip came without Comp. Row); the import's starting weight is corrected on a machine done in Journey since (Finish never writes over one); a machine left with no imported set loses the import's next weight; two swapped sets with the same numbers still trade places in the order; a set carrying anything Journey added since the import makes its visit wait for a person; a client's row with no Journey machine holds the entry back rather than falling through to the studio's row.
- **For the full import**: nothing in the numbers alone shows which client's export is wrong. Asked of the developer: why the export's machine name differs from the chart, and that the full export take each line's machine from where the chart takes it.
