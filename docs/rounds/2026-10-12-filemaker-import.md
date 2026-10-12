# The FileMaker import round (Oct 12 2026)

**Branch:** `oct12/filemaker-import` over master `a39bca59`. **Not pushed. Nothing written to the real database: production writes are switched off in this round (§6).**

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

1. **The session screen reads a client's entire history at Start** (`WorkoutTrackerView`'s sessions listener has no limit). Fine at 60 sessions; with years imported it is slow on the floor and costs reads at every Start. It needs a limit, measured in the perf lab with FileMaker-sized clients first.
2. **"Done, reps not recorded" must be read everywhere reps are counted.** It reverses the Sep 12 2026 rule (a FileMaker blank imported as skipped) for a weight with no reps, on AJ's answer. Nothing crashes on it; these would say wrong things (the review's list):
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
